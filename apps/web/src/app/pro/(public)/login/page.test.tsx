import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The one decision this route segment makes before it renders anything: whether the visitor
 * should be looking at a sign-in form at all.
 *
 * ## Why the test lives beside the page
 *
 * `page.test.tsx` is not a route. Next resolves a segment by exact basename -- `page` -- and
 * `page.test` is not it, so the router never sees this file and `npm run build` is unaffected
 * (checked, 2026-08-19: the route list is unchanged and `/pro/login` is still the only entry).
 * Keeping it here rather than hoisting the guard into a lib function is the point: the thing
 * worth pinning is that *this segment* redirects, and a test of an extracted `isSignedIn()`
 * would keep passing after someone deleted the call.
 *
 * ## `.tsx` and not `.ts`
 *
 * The module under test imports `AuthFlow`, so it pulls React in whether or not anything is
 * rendered -- and the repo's rule is that the extension follows the need for a DOM, not the
 * presence of an assertion about markup.
 *
 * ## What is mocked
 *
 * The session, the redirect, `next/headers`, and the two i18n readers that need a request
 * context. Not `AuthFlow`: it is imported for real, so this also fails if the page stops
 * being able to construct its props at all.
 *
 * **The session mock is on `lib/auth.ts`, which the page actually imports.** It was on
 * `lib/principal.ts` between 2026-08-31 and 2026-09-01, and `page.tsx` imports no such
 * module -- so `expect(currentSession).not.toHaveBeenCalled()` was asserting that a mock
 * attached to nothing had not been called, and passed for that reason rather than for the
 * one its name claimed. Caught by `test-critic` 2026-09-01. A mock of a module outside the
 * subject's import graph is not a weak assertion; it is not an assertion.
 */
const getSession = vi.fn()
const redirect = vi.fn((path: string) => {
  // Next's redirect throws to unwind the render, and code after it is unreachable. A mock
  // that returned normally would let the page carry on and hide a missing `return`.
  throw new Error(`NEXT_REDIRECT:${path}`)
})

vi.mock('next/navigation', () => ({
  redirect: (path: string) => redirect(path),
}))

vi.mock('next/headers', () => ({
  headers: async () => new Headers(),
}))

vi.mock('../../../../lib/auth.ts', () => ({
  getAuth: () => ({
    getSession: (h: Headers) => getSession(h),
    passkeysAvailable: () => true,
    googleAvailable: () => true,
  }),
}))

/**
 * The render work the guard is supposed to come before, as spies rather than plain stubs.
 *
 * The first version of the ordering test below asserted on a `vi.fn()` that nothing called,
 * so it passed with the guard moved to the bottom of the function -- caught by mutation,
 * 2026-08-19. These are the functions the page actually reaches for, which is what makes the
 * assertion able to fail, and they are the reason the ordering test earns its place: a guard
 * that runs after `getAuthCopy()` has already spent a round trip is a guard in the wrong
 * place, and nothing else in this file can see that.
 */
const getTranslations = vi.fn(async () =>
  Object.assign((key: string) => key, { raw: (key: string) => key }),
)
const getFormatter = vi.fn(async () => ({ dateTime: () => '12 september 2027' }))

vi.mock('next-intl/server', () => ({
  getLocale: async () => 'nl',
  getTranslations: () => getTranslations(),
  getFormatter: () => getFormatter(),
}))

const { default: LoginPage } = await import('./page.tsx')

const render = (search: Record<string, string> = {}) =>
  LoginPage({ searchParams: Promise.resolve(search) })

beforeEach(() => {
  vi.clearAllMocks()
  getSession.mockResolvedValue(null)
})

describe('the sign-in page', () => {
  it('renders the form for a visitor with no session', async () => {
    await expect(render()).resolves.toBeTruthy()
    expect(redirect).not.toHaveBeenCalled()
  })

  /**
   * ## The eleven days this assertion was inverted
   *
   * These asserted the *opposite* between 2026-08-31 and 2026-09-01 -- that a signed-in
   * visitor is NOT redirected -- because the guard had been removed to unblock passkey
   * enrollment, which it made structurally impossible. `page.tsx` carries the measurement.
   *
   * The guard is back because the thing it was breaking has moved: the enrollment ceremony
   * now runs on the shell, in `components/auth/enrollment-prompt.tsx`, so there is nothing
   * on this surface for a re-render to interrupt. Both directions are recorded rather than
   * one being quietly overwritten, because the next person to remove this line will have a
   * reason and it will probably be a good one -- and they need to know it has been removed
   * before, and what it cost.
   */
  it('sends a signed-in visitor to the dashboard', async () => {
    getSession.mockResolvedValue({ userId: 'u1', email: 'ilse@studiowit.be' })

    await expect(render()).rejects.toThrow('NEXT_REDIRECT:/')
    expect(redirect).toHaveBeenCalledWith('/')
  })

  it('redirects even when a session-expired notice was requested', async () => {
    // The notice is about a session that lapsed. Arriving here with a live one means it did
    // not, so the dashboard wins over the explanation.
    getSession.mockResolvedValue({ userId: 'u1' })

    await expect(render({ reason: 'session-expired' })).rejects.toThrow('NEXT_REDIRECT:/')
  })

  it('checks the session before doing any rendering work', async () => {
    // A guard below `getAuthCopy()` still redirects, and still spends the round trip it
    // exists to save. The spies are the only thing that can tell the two apart.
    getSession.mockResolvedValue({ userId: 'u1' })

    await expect(render()).rejects.toThrow('NEXT_REDIRECT:/')

    expect(getTranslations).not.toHaveBeenCalled()
    expect(getFormatter).not.toHaveBeenCalled()
  })

  /**
   * The `?reason=session-expired` branch, which nothing asserted between 2026-08-31 and
   * 2026-09-01: its old test was one of four deleted with the guard, and the replacement
   * only checked that the page resolved. Deleting the `notice` spread left all four green
   * -- reported by `test-critic` 2026-09-01.
   */
  it('passes the session-expired notice through to the form', async () => {
    const el = await render({ reason: 'session-expired' })

    expect(el.props.notice).toBe('errors.sessionExpired')
  })

  it('passes no notice when nothing interrupted them', async () => {
    const el = await render()

    expect(el.props).not.toHaveProperty('notice')
  })
})
