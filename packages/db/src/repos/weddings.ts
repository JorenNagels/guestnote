import { and, asc, eq, isNull } from 'drizzle-orm'
import type { Db } from '../client.ts'
import { organizations } from '../schema/orgs.ts'
import { weddings } from '../schema/weddings.ts'
import { withTenant } from '../tenant.ts'
import { type Memberships, principalForOrg, principalForWedding } from './memberships.ts'

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

export type OrgSummary = {
  readonly id: string
  readonly name: string
  readonly slug: string
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
    // assumed: deleting it leaves all 14 assertions in test/repos.test.ts passing,
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
 * The organisation itself, for the shell's header.
 *
 * `organizations` is readable only where `app.org_id` equals the row's own id, so this
 * cannot be folded into `resolveMemberships` -- that runs under `withUser`, where
 * `app.org_id` is the empty string and every organisation row is filtered out. Two
 * transactions is the honest cost of the policy, and the policy is right: a membership
 * row is not a licence to read the org's billing status.
 *
 * `null` means the user has no org-wide standing here, or the org is soft-deleted.
 */
export async function getOrg(db: Db, m: Memberships, orgId: string): Promise<OrgSummary | null> {
  const principal = principalForOrg(m, orgId)
  if (!principal) return null

  const rows = await withTenant(db, principal, async (tx) =>
    tx
      .select({ id: organizations.id, name: organizations.name, slug: organizations.slug })
      .from(organizations)
      .where(isNull(organizations.deletedAt)),
  )
  return rows[0] ?? null
}
