import { getLocale } from 'next-intl/server'
import { AuthFlow } from '@/components/auth/auth-flow.tsx'
import { fill, getAuthCopy } from '@/components/auth/copy.ts'
import { getStageContent } from '@/components/auth/stage-content.ts'
import { getAuth } from '../../../../../lib/auth.ts'
import { isLocale, LOCALES } from '../../../../../lib/locales.ts'
import { app } from '../../../../../lib/routes.ts'

/**
 * `app.guestnote.be/invite/<token>` -- how a second planner gets an account at all.
 *
 * ## Why this is not four routes, or a 404
 *
 * The five outcomes below are all the same screen with a different sentence on it. Three
 * of them end the flow and two continue into it, and the difference is one prop.
 *
 * Notably **none of them is a 404**, including a wedding-shaped invitation. The
 * `invitations` table is merged -- `wedding_id NULL` is staff, set is couple/editor
 * (research/07-auth-and-tenancy.md section 4b) -- so a planner can and will send a couple
 * invitation before the couple portal exists. A 404 there reads as a broken product to
 * the person who sent it, and it is the planner, not the couple, who will report it.
 *
 * An unknown token is the one case that *is* deliberately vague: guessed, truncated and
 * purged tokens produce one identical message, because telling them apart tells an
 * attacker which tokens once existed.
 */
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const [{ token }, copy, locale] = await Promise.all([params, getAuthCopy(), getLocale()])
  const [invitation, stage] = await Promise.all([
    getAuth().resolveInvitation(token),
    getStageContent(copy),
  ])

  const shared = {
    copy,
    locale: isLocale(locale) ? locale : LOCALES[0],
    locales: LOCALES,
    passkeysEnabled: getAuth().passkeysAvailable(),
    // Rendered only on the non-bound cases (e.g. `accepted`): the `staff` branch pins the
    // address, and `auth-flow.tsx` hides Google whenever `boundEmail` is set.
    googleEnabled: getAuth().googleAvailable(),
    continueHref: app.home(),
    stage,
  } as const

  switch (invitation.kind) {
    case 'staff':
      return (
        <AuthFlow
          {...shared}
          boundEmail={invitation.email}
          lead={fill(copy.invite.staff, {
            inviter: invitation.inviter,
            org: invitation.org,
            role: invitation.role === 'admin' ? copy.invite.roleAdmin : copy.invite.roleMember,
          })}
        />
      )

    // Already used. Not an error, and not a dead end -- they have an account, so the only
    // useful thing this screen can do is be the sign-in screen with one line of context.
    case 'accepted':
      return <AuthFlow {...shared} notice={copy.errors.inviteAccepted} />

    case 'expired':
      return (
        <AuthFlow
          {...shared}
          blocked={fill(copy.errors.inviteExpired, { inviter: invitation.inviter })}
        />
      )

    case 'wedding':
      return <AuthFlow {...shared} blocked={copy.errors.inviteCouple} />

    default:
      return <AuthFlow {...shared} blocked={copy.errors.inviteUnknown} />
  }
}
