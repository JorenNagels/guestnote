import { afterEach, describe, expect, it, vi } from 'vitest'
import { conditionalMediationAvailable, platformAuthenticatorAvailable } from './passkey.ts'

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
