import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getLocale } from 'next-intl/server'
import { AuthFlow } from '@/components/auth/auth-flow.tsx'
import { getAuthCopy } from '@/components/auth/copy.ts'
import { getStageContent } from '@/components/auth/stage-content.ts'
import { getAuth } from '../../../../lib/auth.ts'
import { isLocale, LOCALES } from '../../../../lib/locales.ts'
import { app } from '../../../../lib/routes.ts'

/**
 * `app.guestnote.be/login`.
 *
 * The `/pro` prefix is a rewrite target and never appears in a URL bar -- see proxy.ts,
 * and `routes.ts` for the rule that a href is always the path the browser shows.
 *
 * ## `?reason=session-expired`
 *
 * The only query this page reads. It exists because a session that lapses mid-work sends
 * the planner here with no explanation otherwise, and "why am I looking at a login
 * screen" is a support email. The destination they were heading for is preserved by the
 * caller; this page only says why they were interrupted.
 *
 * It is deliberately a *notice* and not an error: nothing has gone wrong and nothing they
 * did caused it.
 *
 * ## Already signed in
 *
 * Sent to the dashboard, because a sign-in form has nothing to offer someone who is already
 * in -- and worse, it invites them to request a code they do not need, which spends a send
 * against a sandbox quota of 200 a day and looks like the session having been lost. Signing
 * in as somebody else is what sign-out is for.
 *
 * **This guard was deleted on 2026-08-31 and restored on 2026-09-01, and the eleven days in
 * between are the reason it is worth reading about.** It made passkey enrollment
 * structurally impossible: the offer lived on rung 2, *after* sign-in, so the visitor held a
 * session; asking for a challenge sets a cookie -- Better Auth has nowhere else to put it --
 * and `nextCookies()` writes it through `cookies().set()`, which Next 16 documents as
 * re-rendering the current route. That re-render hit this line, found the session it had
 * just been given, and threw the visitor to the dashboard **with the OS sheet still open**.
 * The attestation then posted from a dying document to the wrong route and was aborted, so
 * nothing ever reached the server -- and neither did any failure report, which travels the
 * same connection. Measured locally 2026-08-31: `beginPasskeyEnrollment()` immediately
 * followed by `GET /`, `GET /weddings`, then `POST /weddings` with ECONNRESET.
 *
 * What makes it safe now is that there is no longer a ceremony on this surface to interrupt.
 * The enrollment offer moved to `components/auth/enrollment-prompt.tsx` on the shell, which
 * is where `auth-flow.tsx` always said it belonged. **So the rule this file encodes is not
 * "redirect signed-in visitors" -- it is "this page must own no multi-step ceremony".**
 * Anything added here that survives a re-render has to move, or this guard has to go again.
 *
 * ## A second effect, and it restores a claim elsewhere
 *
 * With the guard gone, `beginPasskeySignIn` -- which runs on mount -- started firing for
 * visitors who already had a session, and Better Auth populates `allowCredentials` with the
 * session owner's credentials whenever one exists. On a shared laptop that quietly narrowed
 * the autofill sheet to whoever was signed in last. `PasskeyRequestOptions` in
 * `packages/core/src/auth/types.ts` argues that field is always absent; that argument was
 * true before 2026-08-31, false for one day, and is true again from here.
 *
 * ## Why this guard is on the page and not on the `(public)` layout
 *
 * Because its sibling `/invite/<token>` must NOT have it. Accepting an invitation while
 * already signed in is an ordinary thing to do -- a planner who invites their own second
 * address, or staff who were sent a link after logging in -- and bouncing them to the
 * dashboard would silently swallow the invitation with no way to get back to it. The guard
 * belongs to the surface that has nothing to say, not to the branch.
 *
 * The mirror of this is the `(app)` layout's redirect in the other direction, and the two are
 * the same argument twice: the surface that cannot serve you sends you to the one that can.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  // Before any render work, and `getAuth().getSession` rather than a helper: the thing worth
  // pinning is that *this segment* redirects, and an extracted `isSignedIn()` would keep
  // passing after someone deleted the call. See the docblock for the eleven days this cost.
  if (await getAuth().getSession(await headers())) redirect(app.home())

  const [copy, locale, { reason }] = await Promise.all([getAuthCopy(), getLocale(), searchParams])
  const stage = await getStageContent(copy)

  return (
    <AuthFlow
      copy={copy}
      locale={isLocale(locale) ? locale : LOCALES[0]}
      locales={LOCALES}
      passkeysEnabled={getAuth().passkeysAvailable()}
      googleEnabled={getAuth().googleAvailable()}
      continueHref={app.home()}
      stage={stage}
      {...(reason === 'session-expired' ? { notice: copy.errors.sessionExpired } : {})}
    />
  )
}
