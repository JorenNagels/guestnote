import { and, asc, eq, isNull } from 'drizzle-orm'
import type { Db } from '../client.ts'
import { weddings } from '../schema/weddings.ts'
import { withTenant } from '../tenant.ts'
import {
  type Memberships,
  type OrgSummary,
  principalForOrg,
  principalForWedding,
} from './memberships.ts'

/**
 * The wedding list, which is the first read in this application to go through
 * `withTenant` for real.
 *
 * Everything here is scoped twice over, and both are load-bearing. `principalFor*`
 * decides whether the user may act in this organisation at all -- from `org_members`
 * and `wedding_members`, never from the URL -- and RLS then decides which rows that
 * principal can see. The application-side `where` clauses below add only soft-delete
 * filtering, which is not a tenancy concern and is deliberately not in any policy.
 */

export type WeddingSummary = {
  readonly id: string
  readonly slug: string
  readonly status: string
  readonly coupleDisplayName: string
  /** `date`, not `timestamptz`. Drizzle hands it back as `YYYY-MM-DD` or null. */
  readonly weddingDate: string | null
}

const SUMMARY = {
  id: weddings.id,
  slug: weddings.slug,
  status: weddings.status,
  coupleDisplayName: weddings.coupleDisplayName,
  weddingDate: weddings.weddingDate,
}

/**
 * Every wedding in `orgId` this user may see, oldest date first.
 *
 * Two code paths, because the tenancy model genuinely has two shapes and flattening
 * them would mean lying to `withTenant` about one of them:
 *
 *   owner / admin  ONE transaction. `app.wedding_id` is unset, so the `weddings`
 *                  policy's `... is null or id = ...` branch opens the whole org.
 *
 *   member         ONE TRANSACTION PER ASSIGNED WEDDING. An `assignedStaff` principal
 *                  must pin `app.wedding_id` -- that is the highest-risk path in the
 *                  model and `assertScoped` will not let it through unpinned -- and a
 *                  pinned GUC can only ever return the one row it names. So N weddings
 *                  cost N round trips, and there is no single query that would be both
 *                  correct and cheaper.
 *
 *                  This is fine at the scale it runs at: a member is by definition
 *                  assigned to a handful of weddings, not to the whole book. If that
 *                  stops being true, the fix is a policy that admits a list of wedding
 *                  ids -- NOT dropping the pin.
 *
 * Returns `[]` for a user with no standing in this org. The caller renders 404 from
 * that, not 403: section 3's table ends "neither -> 404 (not 403 -- don't confirm the
 * wedding exists)", and an empty list is indistinguishable from a genuinely empty org,
 * which is the point.
 */
export async function listWeddings(
  db: Db,
  m: Memberships,
  orgId: string,
): Promise<WeddingSummary[]> {
  const orgWide = principalForOrg(m, orgId)

  if (orgWide) {
    return withTenant(db, orgWide, async (tx) =>
      tx
        .select(SUMMARY)
        .from(weddings)
        .where(isNull(weddings.deletedAt))
        .orderBy(asc(weddings.weddingDate)),
    )
  }

  const rows: WeddingSummary[] = []
  for (const assignment of m.weddings) {
    const principal = principalForWedding(m, orgId, assignment.weddingId)
    if (!principal) continue

    // Sequential, not Promise.all: each iteration opens its own transaction, and
    // firing N of them at a pool sized for ordinary request concurrency is how one
    // page starves every other request on a warm Lambda container.
    //
    // The `eq(weddings.id, ...)` below is REDUNDANT, and that was measured rather than
    // assumed: deleting it left every assertion in test/repos.test.ts passing -- measured
    // when that file held 14 of them, and re-checked on 2026-08-20 when it held 32 --
    // because `app.wedding_id` is pinned and the policy already admits exactly one row.
    // It stays as the braces to RLS's belt -- the same argument `assertScoped` makes for
    // itself -- but a reader should know which of the two is actually load-bearing here,
    // and that this test file therefore does NOT prove the pin. isolation.test.ts does,
    // via the `coupleA1Unpinned` case that sets the GUCs by hand.
    const found = await withTenant(db, principal, async (tx) =>
      tx
        .select(SUMMARY)
        .from(weddings)
        .where(and(eq(weddings.id, assignment.weddingId), isNull(weddings.deletedAt))),
    )
    rows.push(...found)
  }

  // The org-wide path sorts in Postgres; this one cannot, so it sorts here. Nulls last
  // either way -- a wedding with no date yet is not "the most urgent thing you own".
  return rows.sort((a, b) => (a.weddingDate ?? '9999').localeCompare(b.weddingDate ?? '9999'))
}

/**
 * One named wedding, or `null`.
 *
 * ## Why this is not `listWeddings().find()`
 *
 * Two paths, and which one a role takes is forced by the `Principal` union rather than
 * chosen for speed:
 *
 *   owner / admin  -> the ORG-WIDE principal, with `eq(weddings.id, ...)` in the query.
 *                     `principalForWedding` returns `null` for them deliberately --
 *                     `assertScoped` refuses an `orgStaff` principal carrying a
 *                     weddingId, because it would silently narrow an owner to one
 *                     wedding. Routing an owner through the per-wedding path would 404
 *                     the person who owns the business, which is the failure mode
 *                     `memberships.ts` warns reads as "the dashboard is mysteriously
 *                     empty".
 *   member         -> `assignedStaff`, which pins `app.wedding_id`.
 *   couple/editor  -> `weddingMember`, same pin.
 *
 * The `??` is a UNION of two functions with disjoint non-null domains, not a precedence
 * rule -- `principalForOrg` admits owner and admin only, and `principalForWedding`
 * returns null for exactly those two. Swapping the operands changes nothing, measured
 * 2026-08-20 by doing it: the whole db suite stayed green. Worth knowing before someone
 * reorders them expecting a behaviour change, or "fixes" the order to look safer.
 *
 * The `eq(weddings.id, ...)` is load-bearing on the org-wide path and redundant on the
 * pinned ones, where the policy already admits exactly one row. It stays for the reason
 * `listWeddings` gives for its own: the policy is the boundary and the clause is the
 * intent. Deleting it fails two of the assertions below, both on the org-wide path.
 *
 * ## `null` is a 404, never a 403
 *
 * For a member asking about a wedding they are not assigned to, and for staff asking
 * about another org's wedding, this returns the same `null` as for a wedding that does
 * not exist. That is not laziness: section 3's permission table ends "neither -> 404
 * (not 403 -- don't confirm the wedding exists)", and distinguishing the two in the
 * return type would put the leak back one layer up.
 */
export async function getWedding(
  db: Db,
  m: Memberships,
  orgId: string,
  weddingId: string,
): Promise<WeddingSummary | null> {
  const principal = principalForOrg(m, orgId) ?? principalForWedding(m, orgId, weddingId)
  if (!principal) return null

  const rows = await withTenant(db, principal, async (tx) =>
    tx
      .select(SUMMARY)
      .from(weddings)
      .where(and(eq(weddings.id, weddingId), isNull(weddings.deletedAt))),
  )
  return rows[0] ?? null
}
