import { and, asc, eq, isNull, sql } from 'drizzle-orm'
import type { Db } from '../client.ts'
import { newId } from '../id.ts'
import { tasks } from '../schema/tasks.ts'
import { type WEDDING_STATUSES, weddings } from '../schema/weddings.ts'
import { withTenant } from '../tenant.ts'
import { type Memberships, principalForOrg, principalForWedding } from './memberships.ts'
import { fail, ok, type Result } from './result.ts'
import type { WeddingScope } from './scope.ts'

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
  /** `#RRGGBB` upper-case, or null. The sidebar's dot; never text (spec 0003). */
  readonly color: string | null
}

const SUMMARY = {
  id: weddings.id,
  slug: weddings.slug,
  status: weddings.status,
  coupleDisplayName: weddings.coupleDisplayName,
  weddingDate: weddings.weddingDate,
  color: weddings.color,
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
export async function getWedding(scope: WeddingScope): Promise<WeddingSummary | null> {
  const { db, m, orgId, weddingId } = scope
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

/**
 * What the planner edits, as one object. Both create and update take the whole thing: the form
 * posts every field, so a partial patch would only add a way to forget one.
 *
 * `color` is `#RRGGBB` or null; the repo upper-cases it because the CHECK refuses a lower-case
 * value with an error nobody wants to read, and the action has already validated the shape.
 */
export type WeddingInput = {
  readonly coupleDisplayName: string
  /** `YYYY-MM-DD` or null. A wedding with no date yet is allowed. */
  readonly weddingDate: string | null
  readonly venue: string | null
  readonly headcount: number | null
  readonly notes: string | null
  readonly color: string | null
  readonly status: (typeof WEDDING_STATUSES)[number]
}

/**
 * The summary plus what only staff may read. `notes` is the planner's own; see the column's
 * comment for why a `couple` can read the row at all and why this type is a separate read.
 */
export type WeddingDetail = WeddingSummary & {
  readonly venue: string | null
  readonly headcount: number | null
  readonly notes: string | null
}

const DETAIL = {
  ...SUMMARY,
  venue: weddings.venue,
  headcount: weddings.headcount,
  notes: weddings.notes,
}

/**
 * One wedding with its notes, for staff. `null` for no such wedding, another organisation's,
 * an unassigned member's -- and for a `couple` or outside `editor`, who can read the row under
 * RLS and must not read the notes (`staffPrincipal` says why). Same 404 for all of them.
 */
export async function getWeddingDetail(scope: WeddingScope): Promise<WeddingDetail | null> {
  const { db, weddingId } = scope
  const principal = scope.principal
  if (!principal) return null

  const rows = await withTenant(db, principal, async (tx) =>
    tx
      .select(DETAIL)
      .from(weddings)
      .where(and(eq(weddings.id, weddingId), isNull(weddings.deletedAt))),
  )
  return rows[0] ?? null
}

/** How many candidate slugs to try before giving up. Five is far past any real collision. */
const SLUG_ATTEMPTS = 5

/**
 * Creates a wedding. **Owner and admin only** -- `notFound` for anyone else.
 *
 * That is `principalForOrg` and nothing subtler: it returns `null` for a `member`, and an
 * `assignedStaff` principal must be pinned to a wedding that does not exist yet, so there is
 * no principal a member could create one as.
 *
 * ## The slug
 *
 * It becomes a subdomain, so it is unique across all organisations, and this transaction can
 * see only its own -- a `select` to check would miss every other org's. So it inserts with
 * `on conflict do nothing` and looks at whether a row came back. `do nothing` raises no error,
 * which matters: a unique violation would abort the transaction and end the loop. The caller
 * hands in `slugBase` already cleaned (reserved words, minimum length); the suffix is the last
 * five characters of a UUIDv7, which are random, and the retry is per candidate, not per call.
 * Rejected: a pre-check `select` (blind to other orgs) and catching error 23505 (aborts the tx).
 *
 * Returns `notFound` too if every candidate was taken, which needs five collisions in a row.
 */
export async function createWedding(
  db: Db,
  m: Memberships,
  orgId: string,
  input: WeddingInput & { readonly slugBase: string },
): Promise<Result<WeddingSummary, 'notFound'>> {
  const principal = principalForOrg(m, orgId)
  if (!principal) return fail('notFound')

  return withTenant(db, principal, async (tx) => {
    for (let attempt = 0; attempt < SLUG_ATTEMPTS; attempt++) {
      const id = newId()
      const slug =
        attempt === 0 ? input.slugBase : `${input.slugBase}-${id.replaceAll('-', '').slice(-5)}`
      const rows = await tx
        .insert(weddings)
        .values({
          id,
          orgId,
          slug,
          status: input.status,
          coupleDisplayName: input.coupleDisplayName,
          weddingDate: input.weddingDate,
          venue: input.venue,
          headcount: input.headcount,
          notes: input.notes,
          color: input.color === null ? null : input.color.toUpperCase(),
        })
        .onConflictDoNothing()
        .returning(SUMMARY)
      if (rows[0]) return ok(rows[0])
    }
    return fail('notFound')
  })
}

/**
 * Saves the editable fields of one wedding. `notFound` when it is not there or the caller may not
 * write it -- owner, admin, and a member assigned to it; never a couple or outside editor.
 *
 * The slug is not editable here: it is the guest site's address, and changing it is a decision
 * with consequences outside the planner app.
 */
export async function updateWedding(
  scope: WeddingScope,
  input: WeddingInput,
): Promise<Result<WeddingDetail, 'notFound'>> {
  const { db, weddingId } = scope
  const principal = scope.principal
  if (!principal) return fail('notFound')

  const rows = await withTenant(db, principal, async (tx) =>
    tx
      .update(weddings)
      .set({
        status: input.status,
        coupleDisplayName: input.coupleDisplayName,
        weddingDate: input.weddingDate,
        venue: input.venue,
        headcount: input.headcount,
        notes: input.notes,
        color: input.color === null ? null : input.color.toUpperCase(),
        updatedAt: new Date(),
      })
      // The `id` predicate is what narrows an org-wide principal to one wedding; a pinned
      // member is narrowed by RLS as well, and this is the same belt `getWedding` describes.
      .where(and(eq(weddings.id, weddingId), isNull(weddings.deletedAt)))
      .returning(DETAIL),
  )
  return rows[0] ? ok(rows[0]) : fail('notFound')
}

export type WeddingTaskCounts = {
  readonly total: number
  readonly open: number
  readonly done: number
  /** Open with a `due_at` in the past. A template task with only an offset has no instant yet. */
  readonly overdue: number
}

/**
 * Task figures for the overview. Zeros, not an error, when the caller has no standing: the page
 * has already 404ed on the wedding read, and a figure of nothing is what an empty wedding shows.
 *
 * The count is over every task the principal can see, and staff see `internal` ones too -- so
 * this is a planner figure and must never be handed to a couple screen as it stands.
 * Counting in SQL, not by fetching rows: a wedding has hundreds of tasks and the overview
 * wants four numbers.
 */
export async function getWeddingTaskCounts(scope: WeddingScope): Promise<WeddingTaskCounts> {
  const { db, weddingId } = scope
  const principal = scope.principal
  if (!principal) return { total: 0, open: 0, done: 0, overdue: 0 }

  const rows = await withTenant(db, principal, async (tx) =>
    tx
      .select({
        total: sql<number>`count(*)::int`,
        done: sql<number>`(count(*) filter (where ${tasks.status} = 'done'))::int`,
        overdue: sql<number>`(count(*) filter (where ${tasks.status} <> 'done' and ${tasks.dueAt} < now()))::int`,
      })
      .from(tasks)
      .where(and(eq(tasks.weddingId, weddingId), isNull(tasks.deletedAt))),
  )
  const row = rows[0]
  const total = row?.total ?? 0
  const done = row?.done ?? 0
  return { total, done, open: total - done, overdue: row?.overdue ?? 0 }
}
