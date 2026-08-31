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

  /**
   * These four used to assert the opposite: that a signed-in visitor is redirected to the
   * dashboard. They were right about the behaviour and the behaviour was removed, because it
   * made passkey enrollment structurally impossible -- `login/page.tsx` carries the full
   * argument and the measurement.
   *
   * They are replaced rather than deleted, because "no redirect" is now a load-bearing
   * property with a non-obvious reason, and the failure it prevents is invisible from this
   * file. Anyone restoring the guard on the old rationale should fail here and be sent to
   * read why.
   */
  it('renders the form for a signed-in visitor rather than redirecting', async () => {
    currentSession.mockResolvedValue({ userId: 'u1', email: 'ilse@studiowit.be' })

    await expect(render()).resolves.toBeDefined()
    expect(redirect).not.toHaveBeenCalled()
  })

  it('does not redirect mid-enrollment, which is the whole reason the guard went', async () => {
    // The sequence that broke: rung 2 holds a session, `beginPasskeyEnrollment` sets the
    // challenge cookie, Next re-renders this route on `cookies().set()`, and the old guard
    // threw the visitor to the dashboard with the OS sheet still open -- so the attestation
    // posted from a dying document and was aborted. A re-render with a live session must be
    // an ordinary render.
    currentSession.mockResolvedValue({ userId: 'u1' })

    await expect(render({ reason: 'session-expired' })).resolves.toBeDefined()
    expect(redirect).not.toHaveBeenCalled()
  })

  it('does not read the session at all any more', async () => {
    // Not merely "does not act on it". The read was the cost the ordering test above used to
    // defend; with no redirect there is nothing to read it for, and a future reader should
    // not reintroduce one on the assumption it is already paid for.
    currentSession.mockResolvedValue({ userId: 'u1' })

    await render()

    expect(currentSession).not.toHaveBeenCalled()
  })
})
