import { afterEach, describe, expect, it, type Mock, vi } from 'vitest'
import {
  conditionalMediationAvailable,
  createPasskey,
  platformAuthenticatorAvailable,
  signInWithPasskey,
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

/**
 * The sign-in ceremony.
 *
 * Two things here can break without anything throwing, and both are asserted rather than
 * assumed. `allowCredentials` must stay **absent** when the server sent none -- an empty
 * array is the value that means "these credentials and no others", so normalising it would
 * refuse every discoverable credential, which on this path is all of them. And no
 * `authenticatorAttachment` may appear, because pinning one suppresses the cross-device QR
 * flow the surface brief says not to suppress.
 */
const REQUEST = {
  challenge: 'Y2hhbGxlbmdl',
  rpId: 'app.localhost',
  userVerification: 'preferred' as const,
}

function fakeAssertion(overrides: Record<string, unknown> = {}) {
  return {
    id: 'credential-id',
    rawId: utf8('credential-id').buffer,
    type: 'public-key',
    getClientExtensionResults: () => ({}),
    response: {
      clientDataJSON: utf8('{}').buffer,
      authenticatorData: utf8('authdata').buffer,
      signature: utf8('sig').buffer,
      userHandle: utf8('user').buffer,
    },
    ...overrides,
  }
}

function withGet(get: unknown): void {
  Object.defineProperty(navigator, 'credentials', {
    value: get === undefined ? {} : { get },
    configurable: true,
    writable: true,
  })
}

/** The whole argument object `get()` received -- `publicKey` plus mediation and signal. */
function argsPassedTo(get: Mock): Record<string, unknown> {
  const call = get.mock.calls[0]
  if (!call) throw new Error('navigator.credentials.get was never called')
  return call[0] as Record<string, unknown>
}

const publicKeyOf = (get: Mock) => argsPassedTo(get).publicKey as Record<string, unknown>

describe('signInWithPasskey', () => {
  afterEach(() => {
    Reflect.deleteProperty(navigator as unknown as Record<string, unknown>, 'credentials')
  })

  it('is unsupported when the browser has no credentials API', async () => {
    expect(navigator.credentials).toBeUndefined()
    await expect(signInWithPasskey(REQUEST)).resolves.toBe('unsupported')
  })

  it('is unsupported when the API exists but get() does not', async () => {
    withGet(undefined)
    await expect(signInWithPasskey(REQUEST)).resolves.toBe('unsupported')
  })

  it('decodes the challenge into bytes before calling the browser', async () => {
    const get = vi.fn().mockResolvedValue(fakeAssertion())
    withGet(get)

    await signInWithPasskey(REQUEST)

    expect(bytesOf(publicKeyOf(get).challenge)).toEqual(bytesOf(utf8('challenge')))
    expect(publicKeyOf(get).rpId).toBe('app.localhost')
  })

  it('passes fields it does not model straight through', async () => {
    // Same promise PasskeyRequestOptions makes: `extensions` is deliberately unmodelled,
    // so this is the assertion that keeps it arriving anyway.
    const get = vi.fn().mockResolvedValue(fakeAssertion())
    withGet(get)

    await signInWithPasskey({ ...REQUEST, extensions: { largeBlob: { read: true } } } as never)

    expect(publicKeyOf(get).extensions).toEqual({ largeBlob: { read: true } })
  })

  it('omits allowCredentials entirely when the server sent none', async () => {
    // The one that would break usernameless sign-in outright. An empty array means "only
    // these credentials", which matches nothing; absence means "any discoverable one".
    const get = vi.fn().mockResolvedValue(fakeAssertion())
    withGet(get)

    await signInWithPasskey(REQUEST)

    expect('allowCredentials' in publicKeyOf(get)).toBe(false)
  })

  it('omits allowCredentials when the server sent an EMPTY list', async () => {
    // `[]` is truthy, so a bare `options.allowCredentials ? …` guard sends it through --
    // and `allowCredentials: []` means "these credentials and no others", matching nothing.
    // The guard tests `.length` for exactly this.
    const get = vi.fn().mockResolvedValue(fakeAssertion())
    withGet(get)

    await signInWithPasskey({ ...REQUEST, allowCredentials: [] })

    expect('allowCredentials' in publicKeyOf(get)).toBe(false)
  })

  it('decodes allowCredentials ids and defaults their type when the server sent some', async () => {
    const get = vi.fn().mockResolvedValue(fakeAssertion())
    withGet(get)

    await signInWithPasskey({
      ...REQUEST,
      allowCredentials: [{ id: 'dXNlcg', transports: ['internal'] }],
    })

    const allow = (
      publicKeyOf(get).allowCredentials as { id: unknown; type: string; transports: string[] }[]
    )[0]
    expect(bytesOf(allow?.id)).toEqual(bytesOf(utf8('user')))
    expect(allow?.type).toBe('public-key')
  })

  it('never pins an authenticator attachment, so the platform may draw its QR', async () => {
    // Enrollment pins `platform` on purpose. Mirroring that here would silently kill the
    // desktop-plus-phone flow the brief says we "must simply not suppress".
    const get = vi.fn().mockResolvedValue(fakeAssertion())
    withGet(get)

    await signInWithPasskey(REQUEST)

    expect(publicKeyOf(get).authenticatorAttachment).toBeUndefined()
    expect((publicKeyOf(get).authenticatorSelection as unknown) ?? undefined).toBeUndefined()
  })

  it('sends no mediation or signal key when it was given neither', async () => {
    // A `mediation: undefined` is not the same as no mediation to every engine, and a
    // stray `signal: undefined` would abort nothing while looking like it might.
    const get = vi.fn().mockResolvedValue(fakeAssertion())
    withGet(get)

    await signInWithPasskey(REQUEST)

    expect('mediation' in argsPassedTo(get)).toBe(false)
    expect('signal' in argsPassedTo(get)).toBe(false)
  })

  it('forwards conditional mediation and the abort signal when asked', async () => {
    const get = vi.fn().mockResolvedValue(fakeAssertion())
    withGet(get)
    const controller = new AbortController()

    await signInWithPasskey(REQUEST, { mediation: 'conditional', signal: controller.signal })

    expect(argsPassedTo(get).mediation).toBe('conditional')
    expect(argsPassedTo(get).signal).toBe(controller.signal)
  })

  it('encodes the assertion back to base64url', async () => {
    withGet(vi.fn().mockResolvedValue(fakeAssertion()))

    const result = await signInWithPasskey(REQUEST)

    expect(result).toEqual({
      id: 'credential-id',
      rawId: 'Y3JlZGVudGlhbC1pZA',
      type: 'public-key',
      clientExtensionResults: {},
      response: {
        clientDataJSON: 'e30',
        authenticatorData: 'YXV0aGRhdGE',
        signature: 'c2ln',
        userHandle: 'dXNlcg',
      },
    })
  })

  it('omits userHandle when the authenticator sent none', async () => {
    withGet(
      vi.fn().mockResolvedValue(
        fakeAssertion({
          response: {
            clientDataJSON: utf8('{}').buffer,
            authenticatorData: utf8('a').buffer,
            signature: utf8('s').buffer,
            userHandle: null,
          },
        }),
      ),
    )

    const result = await signInWithPasskey(REQUEST)

    expect(result).not.toHaveProperty('response.userHandle')
  })

  it('is cancelled when the visitor dismisses the OS sheet', async () => {
    withGet(vi.fn().mockRejectedValue(new Error('NotAllowedError')))
    await expect(signInWithPasskey(REQUEST)).resolves.toBe('cancelled')
  })

  it('is cancelled when the request is aborted', async () => {
    // The conditional path's ordinary ending: the visitor typed their email instead, and
    // AuthFlow aborted. An AbortError is a cancellation like any other -- the three silent
    // outcomes stay one outcome.
    const controller = new AbortController()
    withGet(
      vi.fn(
        () =>
          new Promise((_resolve, reject) => {
            controller.signal.addEventListener('abort', () =>
              reject(new DOMException('aborted', 'AbortError')),
            )
          }),
      ),
    )

    const pending = signInWithPasskey(REQUEST, { signal: controller.signal })
    controller.abort()

    await expect(pending).resolves.toBe('cancelled')
  })

  it('is cancelled when the browser resolves null instead of throwing', async () => {
    withGet(vi.fn().mockResolvedValue(null))
    await expect(signInWithPasskey(REQUEST)).resolves.toBe('cancelled')
  })
})
