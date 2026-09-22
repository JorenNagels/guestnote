import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
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
export default async function InvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const [{ token }, query, copy, locale] = await Promise.all([
    params,
    searchParams,
    getAuthCopy(),
    getLocale(),
  ])
  const [invitation, session, stage] = await Promise.all([
    getAuth().resolveInvitation(token),
    getAuth().getSession(await headers()),
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
    // Back to THIS page, not the dashboard: signing in is only half of accepting. The visitor
    // returns here with a session, and the `staff` branch below spends the invitation. The
    // `?welcome=passkey` marker `auth-flow.tsx` may append rides along to the redirect.
    continueHref: app.invite(token),
    stage,
  } as const

  switch (invitation.kind) {
    case 'staff': {
      if (session) {
        // The address on the invitation is who it is for. Comparing here saves a round trip
        // for the ordinary mistake, and the database checks the same thing again inside
        // `accept_invitation` -- this is the friendly copy, that is the boundary.
        if (session.email.toLowerCase() !== invitation.email.toLowerCase()) {
          return <AuthFlow {...shared} blocked={copy.errors.inviteWrongAccount} />
        }

        // A write on a GET, and deliberate. It only happens with a session for the invited
        // address, i.e. after the visitor proved they own it, so a link scanner or a prefetch
        // (which arrive with no cookie) cannot spend anything. The alternative, a confirm
        // button, adds a click to the one moment a new colleague is most likely to give up,
        // and is what a spreadsheet would not ask of them. Cost accepted: opening the link
        // while signed in as the right person IS the acceptance.
        const result = await getAuth().acceptInvitation(token, session.userId)
        if (result.outcome === 'accepted') {
          redirect(query.welcome === 'passkey' ? `${app.home()}?welcome=passkey` : app.home())
        }
        switch (result.outcome) {
          case 'already_accepted':
            return <AuthFlow {...shared} notice={copy.errors.inviteAccepted} />
          case 'expired':
            return (
              <AuthFlow
                {...shared}
                blocked={fill(copy.errors.inviteExpired, { inviter: invitation.inviter })}
              />
            )
          case 'wrong_user':
            return <AuthFlow {...shared} blocked={copy.errors.inviteWrongAccount} />
          default:
            return <AuthFlow {...shared} blocked={copy.errors.inviteUnknown} />
        }
      }

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
    }

    // Already used. Not an error, and not a dead end -- they have an account, so the only
    // useful thing this screen can do is be the sign-in screen with one line of context.
    //
    // Except when they are already signed in, which is what reloading the link after
    // accepting it looks like: the sign-in screen would be a screen for a task already done.
    case 'accepted':
      if (session) redirect(app.home())
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
