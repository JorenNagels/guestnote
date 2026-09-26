import { sql } from 'drizzle-orm'
import type { Db } from './client.ts'

/**
 * `@guestnote/db/cron` -- the reads that serve a scheduled job with no principal at all.
 *
 * Its own export path, and NOT re-exported from the package root, because what lives here reads
 * across every tenant. `orgsWithTrialEnding` returns four columns of every planner org whose
 * trial ends on a given day -- names and owner emails, from all studios at once -- so reaching
 * it from a page or a Server Function by autocomplete would be a cross-tenant listing one import
 * away. Moved here from `repos/studios.ts` after the slice-2 `tenancy-auditor` pass named it.
 *
 * Only `apps/web/src/app/api/cron/trial-reminders/route.ts` may import this path: banned in
 * `biome.json` (with an override for that one file) AND in `no-unsafe-imports.test.ts`, the
 * pairing every other import ban here has, because a lint rule can be silenced inline and a test
 * cannot (CLAUDE.md invariant 1).
 */

export type TrialEnding = {
  readonly orgId: string
  readonly orgName: string
  /** The trial's last day, `YYYY-MM-DD`, Europe/Brussels. */
  readonly trialEndsOn: string
  readonly ownerEmail: string
}

type TrialRow = { org_id: string; org_name: string; trial_ends_on: string; owner_email: string }

/**
 * For the trial-reminder cron only, which has no principal: every live planner org whose
 * trial's last day is `on`, with one owner's email. `billingFrom` is
 * `GUESTNOTE_BILLING_FROM`; the function returns nothing without it. Both dates are
 * `YYYY-MM-DD`. A plain `Db` and one SECURITY DEFINER call, like `resolveInvitationByHash`
 * -- migration 0010 says why this is the only cross-tenant read in the schema.
 */
export async function orgsWithTrialEnding(
  db: Db,
  on: string,
  billingFrom: string,
): Promise<TrialEnding[]> {
  const rows = (
    (await db.execute(
      sql`select * from public.orgs_with_trial_ending(${on}::date, ${billingFrom}::date)`,
    )) as unknown as { rows: TrialRow[] }
  ).rows
  return rows.map((r) => ({
    orgId: r.org_id,
    orgName: r.org_name,
    trialEndsOn: r.trial_ends_on,
    ownerEmail: r.owner_email,
  }))
}
