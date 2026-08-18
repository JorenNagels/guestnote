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
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
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
