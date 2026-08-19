import { redirect } from 'next/navigation'
import { getLocale } from 'next-intl/server'
import { AuthFlow } from '@/components/auth/auth-flow.tsx'
import { getAuthCopy } from '@/components/auth/copy.ts'
import { getStageContent } from '@/components/auth/stage-content.ts'
import { getAuth } from '../../../../lib/auth.ts'
import { isLocale, LOCALES } from '../../../../lib/locales.ts'
import { currentSession } from '../../../../lib/principal.ts'
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
 * against a sandbox quota of 200 a day and looks like the session having been lost. Signing in
 * as somebody else is what sign-out is for.
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
  // Before the copy and the stage panel, so a signed-in visitor costs one session read and
  // not three catalogues plus a date format they will never see.
  if (await currentSession()) redirect(app.home())

  const [copy, locale, { reason }] = await Promise.all([getAuthCopy(), getLocale(), searchParams])
  const stage = await getStageContent(copy)

  return (
    <AuthFlow
      copy={copy}
      locale={isLocale(locale) ? locale : LOCALES[0]}
      locales={LOCALES}
      passkeysEnabled={getAuth().passkeysAvailable()}
      continueHref={app.home()}
      stage={stage}
      {...(reason === 'session-expired' ? { notice: copy.errors.sessionExpired } : {})}
    />
  )
}
