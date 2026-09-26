import 'server-only'
import { type Memberships, trialFacts } from '@guestnote/db'
import { billingMode } from './billing-mode.ts'
import { getDb } from './db.ts'
import { currentMemberships } from './principal.ts'
import { type TrialState, trialState } from './trial-state.ts'

// The pure half, re-exported so the sign-up page and the layout have one module to ask.
export {
  addOneMonth,
  brusselsToday,
  type TrialState,
  trialLastDay,
  trialState,
} from './trial-state.ts'

/**
 * The trial lock (spec 0005, "When the trial ends, staff lose writes; nobody loses reads").
 *
 * Thrown by `assertWritable` and by nothing else. A named class so a caller that wants to say
 * something specific can tell it apart; today none does -- the red banner already says why, and
 * a component shows the throw as its ordinary failure (or its route's error boundary where it
 * has no inline one). Rejected: returning a `locked` result from every action, which means
 * a new error code in some twenty result types for a screen that is switched off.
 */
export class TrialEndedError extends Error {
  override readonly name = 'TrialEndedError'
  constructor(orgId: string) {
    super(
      `The trial of org ${orgId} has ended; staff writes are refused until a plan is chosen ` +
        '(docs/specs/0005, "Trial").',
    )
  }
}

/** The trial state of `orgId` for the caller, or `off` when there is nothing to lock. */
export async function orgTrialState(
  memberships: Memberships | null,
  orgId: string | null,
  now: Date = new Date(),
): Promise<TrialState> {
  const mode = billingMode()
  // Billing off answers before any query, so the demo pays nothing for this guard.
  if (!mode.on || !memberships || !orgId) return { kind: 'off' }
  const facts = await trialFacts(getDb(), memberships, orgId)
  // Not staff of this org: nothing to lock here, and the action refuses them on its own.
  if (!facts) return { kind: 'off' }
  return trialState(facts, mode, now)
}

/**
 * Throws `TrialEndedError` when `orgId`'s trial has ended. **The first statement of every
 * staff-writing Server Function under `app/pro/(app)/`**, before it reads its input or touches
 * the database -- `app/pro/trial-guard.test.ts` fails when an exported function there lacks it,
 * because the guard is only as good as its coverage (spec 0005, "Trial").
 *
 * Server-side and once, not RLS: the lock depends on `GUESTNOTE_BILLING_FROM`, which Postgres
 * cannot see without a new GUC on every transaction. `orgId` is the caller's current org
 * (`currentOrgId()`), which is the org every Server Function here acts in: `currentCaller` and
 * `currentWeddingScope` resolve the same one. Couples and vendor links write nothing through
 * these functions, so their reads are untouched.
 */
export async function assertWritable(orgId: string | null): Promise<void> {
  if (!billingMode().on || !orgId) return
  const state = await orgTrialState(await currentMemberships(), orgId)
  if (state.kind === 'ended') throw new TrialEndedError(orgId)
}
