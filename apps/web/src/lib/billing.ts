import 'server-only'
import { type BillingProvider, createNoopProvider } from '@guestnote/billing'
import { listTeam, resolveMemberships } from '@guestnote/db'
import { billingMode } from './billing-mode.ts'
import { getDb } from './db.ts'
import { reportSilentFailure } from './observability.ts'

/**
 * The app's one billing provider, composed here the way `lib/mailer.ts` composes the mail
 * transport. Today it is the no-op provider whatever the environment says, because there is no
 * other (spec 0005, "Billing"); choosing Mollie or Stripe means building one in
 * `packages/billing` and choosing it here from an env value read in `env.ts`.
 */
let cached: BillingProvider | undefined

export function getBillingProvider(): BillingProvider {
  cached ??= createNoopProvider()
  return cached
}

/**
 * Tells the provider a planner joined `orgId` (spec 0005, "Seats = active org_members rows").
 * Called from both invitation-accept paths -- `lib/auth.ts`'s link and sign-up's Join -- so
 * wiring a provider is not a hunt for call sites. There is no member-removal path in the app
 * yet; when there is, it calls this too.
 *
 * Counted as `userId`, the person who just joined, through `listTeam`, which only an owner or
 * admin can run (RLS lets a `member` see their own `org_members` row and nobody else's). So a
 * joining `member` cannot count their studio and the call is skipped, stated rather than
 * worked around with a third unscoped reader (CLAUDE.md invariant 1): the count is taken
 * again, authoritatively, at checkout by the owner or admin who pays. A provider going live
 * has to reconcile seats on its own schedule regardless -- this is the fast path, not the truth.
 *
 * Never throws: joining a studio must not fail because a provider hiccupped.
 */
export async function seatsChanged(orgId: string, userId: string): Promise<void> {
  if (!billingMode().on) return
  try {
    const memberships = await resolveMemberships(getDb(), userId)
    const team = await listTeam(getDb(), memberships, orgId)
    if (!team) return
    await getBillingProvider().setSeats({ orgId, seats: team.length })
  } catch (error) {
    reportSilentFailure('billing: setSeats failed', { orgId, error: String(error) })
  }
}
