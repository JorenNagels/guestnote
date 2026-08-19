import { describe, expect, it } from 'vitest'
import { conditionalMediationAvailable, platformAuthenticatorAvailable } from './passkey.ts'

/**
 * The server half of the passkey capability check, and the reason this file is `.test.ts`
 * while its sibling is `.test.tsx`.
 *
 * `typeof window === 'undefined'` is the FIRST line of both functions, and it is
 * unobservable in jsdom -- there is always a window there. This is the only project that
 * can see the branch at all, which makes the extension split load-bearing rather than
 * bookkeeping: the same module is genuinely tested twice, in the two worlds it runs in.
 *
 * The branch matters because `AuthFlow` is a Client Component that Next still renders on
 * the server first. Without it, the initial render throws on `window` and the sign-in page
 * fails to produce HTML at all.
 */
describe('during server rendering, where there is no window', () => {
  it('has genuinely no window -- the premise of every assertion below', () => {
    expect(typeof window).toBe('undefined')
  })

  it('reports conditional mediation as unavailable', async () => {
    await expect(conditionalMediationAvailable()).resolves.toBe(false)
  })

  it('reports no platform authenticator', async () => {
    await expect(platformAuthenticatorAvailable()).resolves.toBe(false)
  })

  it('resolves rather than throwing, so the first render still produces HTML', async () => {
    await expect(
      Promise.all([conditionalMediationAvailable(), platformAuthenticatorAvailable()]),
    ).resolves.toEqual([false, false])
  })
})
