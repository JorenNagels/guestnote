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
 * The session, the redirect, and the two i18n readers that need a request context. Not
 * `AuthFlow`: it is imported for real, so this also fails if the page stops being able to
 * construct its props at all.
 */
const currentSession = vi.fn()
const redirect = vi.fn((path: string) => {
  // Next's redirect throws to unwind the render, and code after it is unreachable. A mock
  // that returned normally would let the page carry on and hide a missing `return`.
  throw new Error(`NEXT_REDIRECT:${path}`)
})

vi.mock('../../../../lib/principal.ts', () => ({
  currentSession: () => currentSession(),
}))

vi.mock('next/navigation', () => ({
  redirect: (path: string) => redirect(path),
}))

vi.mock('../../../../lib/auth.ts', () => ({
  getAuth: () => ({ passkeysAvailable: () => true, googleAvailable: () => true }),
}))

/**
 * The render work the guard is supposed to come before, as spies rather than plain stubs.
 *
 * The first version of the ordering test below asserted on a `vi.fn()` that nothing called,
 * so it passed with the guard moved to the bottom of the function -- caught by mutation,
 *2026-08-19. These are the functions the page actually reaches for, which is what makes the
 * assertion able to fail.
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
  currentSession.mockResolvedValue(null)
})

describe('the sign-in page', () => {
  it('renders the form for a visitor with no session', async () => {
    await expect(render()).resolves.toBeTruthy()
    expect(redirect).not.toHaveBeenCalled()
  })

  it('sends a signed-in visitor to the dashboard instead', async () => {
    currentSession.mockResolvedValue({ userId: 'u1', email: 'ilse@studiowit.be' })

    await expect(render()).rejects.toThrow('NEXT_REDIRECT:/')
    expect(redirect).toHaveBeenCalledWith('/')
  })

  it('redirects to the path the browser shows, never the /pro rewrite target', async () => {
    // lib/routes.ts exists to hold this line. proxy.ts serves app.guestnote.be/ from
    // /pro, so redirecting to the internal path would put `/pro` in the URL bar.
    currentSession.mockResolvedValue({ userId: 'u1' })

    await render().catch(() => {})
    expect(redirect).toHaveBeenCalledWith(expect.not.stringContaining('/pro'))
  })

  it('redirects even when a session-expired notice was requested', async () => {
    // The lapsed-session link is the most likely way to arrive here with a live cookie:
    // one tab expired, another refreshed it. Showing "your session expired" to somebody
    // whose session is fine is the confusing outcome the notice exists to prevent.
    currentSession.mockResolvedValue({ userId: 'u1' })

    await expect(render({ reason: 'session-expired' })).rejects.toThrow('NEXT_REDIRECT:/')
  })

  it('checks the session before doing any rendering work', async () => {
    // Ordering, not just outcome: a signed-in visitor should not pay for a message catalogue
    // and a date format for a screen they will never see. Asserted from inside the session
    // read, because by the time the redirect throws everything has already run.
    let copyDoneFirst: boolean | undefined
    currentSession.mockImplementation(async () => {
      copyDoneFirst = getTranslations.mock.calls.length > 0 || getFormatter.mock.calls.length > 0
      return { userId: 'u1' }
    })

    await render().catch(() => {})

    expect(currentSession).toHaveBeenCalledOnce()
    expect(copyDoneFirst).toBe(false)
    // And the work really is skipped, not merely deferred.
    expect(getFormatter).not.toHaveBeenCalled()
  })
})
