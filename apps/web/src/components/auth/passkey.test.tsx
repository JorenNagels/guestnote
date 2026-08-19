import { afterEach, describe, expect, it, type Mock, vi } from 'vitest'
import {
  conditionalMediationAvailable,
  createPasskey,
  platformAuthenticatorAvailable,
} from './passkey.ts'

/**
 * The browser half of the capability check.
 *
 * `.tsx` despite rendering nothing, because the selector between the two Vitest projects is
 * "does this need a DOM", and this does: every branch below reads `window`. Its sibling
 * `passkey.test.ts` covers the one branch a DOM makes unreachable.
 *
 * What is being defended is stated in passkey.ts: the two questions are independent, and
 * conflating them "is how you end up offering a credential the server cannot check". Both
 * functions must therefore fail to `false` on every abnormal input rather than throwing --
 * a rejected promise here would leave `AuthFlow`'s effect hanging and the control's
 * visibility undefined.
 */
function withPublicKeyCredential(value: unknown): void {
  Object.defineProperty(window, 'PublicKeyCredential', {
    value,
    configurable: true,
    writable: true,
  })
}

afterEach(() => {
  Reflect.deleteProperty(window as unknown as Record<string, unknown>, 'PublicKeyCredential')
  vi.restoreAllMocks()
})

describe('conditionalMediationAvailable', () => {
  it('is false when the browser has no WebAuthn at all', async () => {
    // jsdom's default state, and a real one: any browser predating WebAuthn.
    expect(window.PublicKeyCredential).toBeUndefined()
    await expect(conditionalMediationAvailable()).resolves.toBe(false)
  })

  it('is false when WebAuthn exists but conditional UI postdates it', async () => {
    // The case the explicit control exists for: a platform authenticator with no autofill
    // integration. Optional-chained in the source precisely for this.
    withPublicKeyCredential({ isUserVerifyingPlatformAuthenticatorAvailable: async () => true })
    await expect(conditionalMediationAvailable()).resolves.toBe(false)
  })

  it('is false when the property exists but is not callable', async () => {
    withPublicKeyCredential({ isConditionalMediationAvailable: true })
    await expect(conditionalMediationAvailable()).resolves.toBe(false)
  })

  it('is true when the browser says so', async () => {
    withPublicKeyCredential({ isConditionalMediationAvailable: async () => true })
    await expect(conditionalMediationAvailable()).resolves.toBe(true)
  })

  it('is false when the browser says so', async () => {
    withPublicKeyCredential({ isConditionalMediationAvailable: async () => false })
    await expect(conditionalMediationAvailable()).resolves.toBe(false)
  })

  it('swallows a rejection instead of propagating it', async () => {
    // Some browsers throw here inside an iframe or a cross-origin context. An unhandled
    // rejection would leave the effect's Promise.all pending forever.
    withPublicKeyCredential({
      isConditionalMediationAvailable: async () => {
        throw new Error('NotAllowedError')
      },
    })
    await expect(conditionalMediationAvailable()).resolves.toBe(false)
  })

  it('swallows a synchronous throw too', async () => {
    withPublicKeyCredential({
      isConditionalMediationAvailable: () => {
        throw new Error('boom')
      },
    })
    await expect(conditionalMediationAvailable()).resolves.toBe(false)
  })
})

describe('platformAuthenticatorAvailable', () => {
  it('is false when the browser has no WebAuthn at all', async () => {
    await expect(platformAuthenticatorAvailable()).resolves.toBe(false)
  })

  it('is false when the method is missing', async () => {
    withPublicKeyCredential({ isConditionalMediationAvailable: async () => true })
    await expect(platformAuthenticatorAvailable()).resolves.toBe(false)
  })

  it('is true when a built-in authenticator is present', async () => {
    withPublicKeyCredential({
      isUserVerifyingPlatformAuthenticatorAvailable: async () => true,
    })
    await expect(platformAuthenticatorAvailable()).resolves.toBe(true)
  })

  it('swallows a rejection instead of propagating it', async () => {
    withPublicKeyCredential({
      isUserVerifyingPlatformAuthenticatorAvailable: async () => {
        throw new Error('NotSupportedError')
      },
    })
    await expect(platformAuthenticatorAvailable()).resolves.toBe(false)
  })
})

describe('the two questions are independent', () => {
  // passkey.ts: "The surface has two independent reasons to hide the passkey control."
  // This is the combination AuthFlow actually acts on -- platform && !conditional is the
  // only one of the four that draws a control.
  it.each([
    ['neither', false, false],
    ['conditional only', true, false],
    ['platform only', false, true],
    ['both', true, true],
  ])('reports %s exactly as asked', async (_name, conditional, platform) => {
    withPublicKeyCredential({
      isConditionalMediationAvailable: async () => conditional,
      isUserVerifyingPlatformAuthenticatorAvailable: async () => platform,
    })
    await expect(conditionalMediationAvailable()).resolves.toBe(conditional)
    await expect(platformAuthenticatorAvailable()).resolves.toBe(platform)
  })
})

/**
 * The enrollment ceremony.
 *
 * jsdom has a `navigator` and no `navigator.credentials`, which is exactly the
 * "browser cannot do this" case -- so the absence is one of the assertions rather than
 * something to work around. Everything else installs a fake `create()` and reads what was
 * handed to it, because the two things that can silently break here are the direction of
 * the base64url conversion and whether the options object arrives intact.
 */
const OPTIONS = {
  challenge: 'Y2hhbGxlbmdl',
  rp: { id: 'app.localhost', name: 'Guestnote' },
  user: { id: 'dXNlcg', name: 'ilse@studiowit.be', displayName: 'Ilse' },
  pubKeyCredParams: [{ type: 'public-key' as const, alg: -7 }],
}

const utf8 = (value: string) => new TextEncoder().encode(value)

/** A credential shaped like the one a real authenticator returns. */
function fakeCredential(overrides: Record<string, unknown> = {}) {
  return {
    id: 'credential-id',
    rawId: utf8('credential-id').buffer,
    type: 'public-key',
    getClientExtensionResults: () => ({ credProps: { rk: true } }),
    response: {
      clientDataJSON: utf8('{}').buffer,
      attestationObject: utf8('attest').buffer,
      getTransports: () => ['internal', 'hybrid'],
    },
    ...overrides,
  }
}

function withCredentials(create: unknown): void {
  Object.defineProperty(navigator, 'credentials', {
    value: create === undefined ? {} : { create },
    configurable: true,
    writable: true,
  })
}

/** The `publicKey` object the browser was actually handed, or a failure that says so. */
function publicKeyPassedTo(create: Mock): Record<string, unknown> {
  const call = create.mock.calls[0]
  if (!call) throw new Error('navigator.credentials.create was never called')
  return (call[0] as { publicKey: Record<string, unknown> }).publicKey
}

/**
 * Byte comparison through a plain array, and not `toEqual` on the Uint8Arrays directly.
 *
 * Under jsdom the array `TextEncoder` produces and the one `passkey.ts` produces come from
 * different realms, so `toEqual` fails on the constructor while reporting "Compared values
 * have no visual difference" -- measured 2026-08-19, and a genuinely confusing hour. The
 * `.test.ts` sibling has no such problem, which is why it keeps the direct form.
 */
const bytesOf = (value: unknown) => Array.from(value as Uint8Array)

describe('createPasskey', () => {
  afterEach(() => {
    Reflect.deleteProperty(navigator as unknown as Record<string, unknown>, 'credentials')
  })

  it('is unsupported when the browser has no credentials API', async () => {
    expect(navigator.credentials).toBeUndefined()
    await expect(createPasskey(OPTIONS)).resolves.toBe('unsupported')
  })

  it('is unsupported when the API exists but create() does not', async () => {
    withCredentials(undefined)
    await expect(createPasskey(OPTIONS)).resolves.toBe('unsupported')
  })

  it('decodes the challenge and the user id into bytes before calling the browser', async () => {
    // The WebAuthn API takes BufferSources, not strings. Handing it the base64url through
    // would not throw -- it would sign the wrong bytes and fail verification server-side,
    // where the surface is required to say nothing.
    const create = vi.fn().mockResolvedValue(fakeCredential())
    withCredentials(create)

    await createPasskey(OPTIONS)

    const passed = publicKeyPassedTo(create)
    expect(bytesOf(passed.challenge)).toEqual(bytesOf(utf8('challenge')))
    expect(bytesOf((passed.user as { id: unknown }).id)).toEqual(bytesOf(utf8('user')))
    expect((passed.user as { name: string }).name).toBe('ilse@studiowit.be')
  })

  it('passes fields it does not model straight through', async () => {
    // The cost PasskeyCreationOptions' comment names, and the mitigation it promises: the
    // options object is spread whole, so a field the spec adds later still reaches the
    // browser rather than being dropped by a type that has not caught up.
    const create = vi.fn().mockResolvedValue(fakeCredential())
    withCredentials(create)

    await createPasskey({ ...OPTIONS, hints: ['client-device'] } as never)

    expect(publicKeyPassedTo(create).hints).toEqual(['client-device'])
  })

  it('decodes excludeCredentials ids and defaults their type', async () => {
    const create = vi.fn().mockResolvedValue(fakeCredential())
    withCredentials(create)

    await createPasskey({
      ...OPTIONS,
      excludeCredentials: [{ id: 'dXNlcg', transports: ['internal'] }],
    })

    const exclude = (
      publicKeyPassedTo(create).excludeCredentials as {
        id: unknown
        type: string
        transports: string[]
      }[]
    )[0]
    expect(bytesOf(exclude?.id)).toEqual(bytesOf(utf8('user')))
    expect(exclude?.type).toBe('public-key')
    expect(exclude?.transports).toEqual(['internal'])
  })

  it('sends no excludeCredentials key as an empty list rather than undefined', async () => {
    const create = vi.fn().mockResolvedValue(fakeCredential())
    withCredentials(create)

    await createPasskey(OPTIONS)

    expect(publicKeyPassedTo(create).excludeCredentials).toEqual([])
  })

  it('encodes the attestation back to base64url', async () => {
    withCredentials(vi.fn().mockResolvedValue(fakeCredential()))

    const result = await createPasskey(OPTIONS)

    expect(result).toEqual({
      id: 'credential-id',
      rawId: 'Y3JlZGVudGlhbC1pZA',
      type: 'public-key',
      clientExtensionResults: { credProps: { rk: true } },
      response: {
        clientDataJSON: 'e30',
        attestationObject: 'YXR0ZXN0',
        transports: ['internal', 'hybrid'],
      },
    })
  })

  it('reports no transports rather than throwing when the method is absent', async () => {
    // getTransports() postdates the interface, exactly like the capability methods above.
    withCredentials(
      vi.fn().mockResolvedValue(
        fakeCredential({
          response: { clientDataJSON: utf8('{}').buffer, attestationObject: utf8('a').buffer },
        }),
      ),
    )

    const result = await createPasskey(OPTIONS)

    expect(result).toMatchObject({ response: { transports: [] } })
  })

  it('is cancelled when the visitor dismisses the OS sheet', async () => {
    // A real dismissal is a NotAllowedError, indistinguishable from a genuine failure by
    // design. SilentPasskeyOutcome is why that does not matter.
    withCredentials(vi.fn().mockRejectedValue(new Error('NotAllowedError')))
    await expect(createPasskey(OPTIONS)).resolves.toBe('cancelled')
  })

  it('is cancelled when create() throws synchronously', async () => {
    withCredentials(
      vi.fn(() => {
        throw new TypeError('bad options')
      }),
    )
    await expect(createPasskey(OPTIONS)).resolves.toBe('cancelled')
  })

  it('is cancelled when the browser resolves null instead of throwing', async () => {
    withCredentials(vi.fn().mockResolvedValue(null))
    await expect(createPasskey(OPTIONS)).resolves.toBe('cancelled')
  })
})
