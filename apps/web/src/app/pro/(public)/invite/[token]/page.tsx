import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getLocale } from 'next-intl/server'
import { AuthFlow } from '@/components/auth/auth-flow.tsx'
import { fill, getAuthCopy } from '@/components/auth/copy.ts'
import { getStageContent } from '@/components/auth/stage-content.ts'
import { getAuth } from '../../../../../lib/auth.ts'
import { billingMode } from '../../../../../lib/billing-mode.ts'
import { isLocale, LOCALES } from '../../../../../lib/locales.ts'
import { app } from '../../../../../lib/routes.ts'

/**
 * `app.guestnote.be/invite/<token>` -- how a second planner, or a couple, gets an account at all.
 *
 * ## Why this is not four routes, or a 404
 *
 * The outcomes below are all the same screen with a different sentence on it. Two of them end
 * the flow (expired, unknown) and three continue (staff, wedding, accepted), and the difference
 * is one prop.
 *
 * Notably **none of them is a 404**. The `invitations` table is merged -- `wedding_id NULL` is
 * staff, set is couple (research/07-auth-and-tenancy.md section 4b). Until spec 0008 a couple
 * invitation said the portal was not open yet; it now runs the same accept-on-GET as staff and
 * lands on the portal instead of the dashboard.
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
    getAuthCopy(billingMode().on),
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
    // Rendered only on the non-bound cases (e.g. `accepted`): the `staff`/`wedding` branch pins the
    // address, and `auth-flow.tsx` hides Google whenever `boundEmail` is set.
    googleEnabled: getAuth().googleAvailable(),
    // Back to THIS page, not the dashboard: signing in is only half of accepting. The visitor
    // returns here with a session, and the `staff`/`wedding` branch below spends the invitation. The
    // `?welcome=passkey` marker `auth-flow.tsx` may append rides along to the redirect.
    continueHref: app.invite(token),
    stage,
  } as const

  switch (invitation.kind) {
    case 'wedding':
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
          // A couple lands in their portal, staff on the dashboard. `weddingId` comes from what
          // `accept_invitation` wrote, not from the URL.
          const home = result.weddingId ? app.couple(result.weddingId) : app.home()
          redirect(query.welcome === 'passkey' ? `${home}?welcome=passkey` : home)
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
          lead={
            invitation.kind === 'wedding'
              ? fill(copy.invite.couple, {
                  studio: invitation.org,
                  couple: invitation.couple ?? invitation.org,
                })
              : fill(copy.invite.staff, {
                  inviter: invitation.inviter,
                  org: invitation.org,
                  role:
                    invitation.role === 'admin' ? copy.invite.roleAdmin : copy.invite.roleMember,
                })
          }
        />
      )
    }

    // Already used. Not an error, and not a dead end -- they have an account, so the only
    // useful thing this screen can do is be the sign-in screen with one line of context.
    //
    // Except when they are already signed in, which is what reloading the link after
    // accepting it looks like: the sign-in screen would be a screen for a task already done.
    // `app.home()` also serves a couple: the dashboard's no-org branch sends them to the portal.
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

    default:
      return <AuthFlow {...shared} blocked={copy.errors.inviteUnknown} />
  }
}
