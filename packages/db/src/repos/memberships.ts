import { and, asc, eq, isNull } from 'drizzle-orm'
import type { Db } from '../client.ts'
import { organizations, orgMembers } from '../schema/orgs.ts'
import { weddingMembers } from '../schema/weddings.ts'
import { type Principal, withUser } from '../tenant.ts'

/**
 * The query that runs BEFORE the tenant is known, in order to determine it.
 *
 * `org_members` and `wedding_members` are the only two tables scoped ONLY by
 * `app.user_id` rather than by the tenant keys, and this module is the reason they are.
 * Since migration 0005 a third table carries a policy on that axis -- `organizations`,
 * which keeps `tenant_isolation` as its primary policy and gains a second, SELECT-only
 * one so that `listOrgsForUser` below can name an org before a tenant is known.
 * Everything else in the application reaches the database through `withTenant`, which
 * cannot be called until a `Principal` exists -- and a `Principal` cannot be built
 * without knowing which organisation and which wedding the user actually belongs to.
 * That is what these functions answer, and it is why they use `withUser`.
 *
 * ## The rule this module exists to keep
 *
 * research/07-auth-and-tenancy.md section 3: **`app.org_id` is a data-scoping
 * mechanism, never a permission.** Authorization resolves from these two tables and
 * from nowhere else -- not from the session, not from the URL, not from the GUC. The
 * URL says which tenant is being *asked for*; `resolveMemberships` says which the user
 * may actually have, and the `principalFor*` functions return `null` when those two
 * disagree.
 *
 * A `null` return means 404, not 403. Confirming that a wedding exists to somebody who
 * cannot see it is itself a leak -- section 3's permission table ends with
 * "neither -> 404 (not 403 -- don't confirm the wedding exists)".
 */

/** A row of `org_members`, which is STAFF only. A couple is never here. */
export type OrgMembership = {
  readonly orgId: string
  readonly role: 'owner' | 'admin' | 'member'
}

/**
 * A row of `wedding_members`, which carries the couple AND the staff member assigned
 * to one specific wedding. `weddings.ts` states the double duty: `couple` for the
 * clients, `editor` for an assigned staff member. Which of the two a row means is not
 * decidable from the row alone -- see `principalForWedding`.
 */
export type WeddingMembership = {
  readonly weddingId: string
  readonly role: 'couple' | 'editor'
}

export type Memberships = {
  readonly userId: string
  readonly orgs: readonly OrgMembership[]
  readonly weddings: readonly WeddingMembership[]
}

/**
 * An organisation, named. Deliberately three columns and not the row.
 *
 * Lives here rather than in ./weddings.ts, where it used to, because `listOrgsForUser`
 * below is now its primary producer and weddings.ts already imports from this module --
 * the other direction would be a cycle.
 */
export type OrgSummary = {
  readonly id: string
  readonly name: string
  readonly slug: string
}

/**
 * Every membership one user holds, in one transaction.
 *
 * The two selects are issued SEQUENTIALLY, not through `Promise.all`. They share a
 * single transaction on a single checked-out connection, and overlapping two queries
 * on one connection is how you get a driver-level protocol error rather than a
 * speed-up. The round trip saved would be a fraction of a millisecond on Neon anyway.
 *
 * The `where` clauses are redundant with the `own_memberships` policies, which already
 * filter both tables to `app.user_id`. They are here regardless: the policy is the
 * security boundary and the clause is the intent, and a reader should not have to know
 * the RLS to see that this reads one user's rows. If a policy is ever wrong, a clause
 * that agrees with it narrows the blast radius instead of widening it.
 */
export async function resolveMemberships(db: Db, userId: string): Promise<Memberships> {
  return withUser(db, userId, async (tx) => {
    const orgs = await tx
      .select({ orgId: orgMembers.orgId, role: orgMembers.role })
      .from(orgMembers)
      .where(eq(orgMembers.userId, userId))

    const weddings = await tx
      .select({ weddingId: weddingMembers.weddingId, role: weddingMembers.role })
      .from(weddingMembers)
      .where(eq(weddingMembers.userId, userId))

    return {
      userId,
      orgs: orgs as OrgMembership[],
      weddings: weddings as WeddingMembership[],
    }
  })
}

/**
 * Every organisation the user belongs to, named, in one transaction.
 *
 * This is what the dashboard's sidebar head and its org switcher read, and it exists
 * because nothing else could answer the question for a `member`. `principalForOrg`
 * returns `null` for one on purpose, so no org-wide read can name their organisation; and
 * `resolveMemberships` returns ids and roles only. Migration 0005 added the policy that
 * makes this readable under `withUser` -- `org_read_for_members` -- and its header is
 * where the reasoning and the rejected alternatives live.
 *
 * ## Three columns, not the row
 *
 * `organizations` also carries `plan`, `subscription_status` and `mollie_customer_id`,
 * and 0005's policy admits the whole row to any member of the org. The select list below
 * is therefore the boundary, not the grant: a member reads the name and never the
 * billing. Widening it is not a refactor -- it is a policy decision being taken in the
 * wrong file. Anything that genuinely needs billing wants a different function, taking an
 * org-wide `Principal` so that `principalForOrg` refuses a member before any SQL runs.
 * `getOrg` was that function and was deleted on 2026-08-21 for want of a caller -- see
 * `apps/web/src/lib/principal.ts` for the bug that orphaned it.
 *
 * ## The join, and what it costs the tests
 *
 * Without it this would be `select ... from organizations` with the policy as the only
 * filter -- correct, but it reads as though it selects every organisation in the database.
 * So the join is here for the same reason `resolveMemberships` keeps its redundant `where`.
 *
 * The price is worth stating: it means **no assertion in `repos.test.ts` can prove the
 * policy**, because this join returns the right answer even when the policy is wrong.
 * Measured 2026-08-20 -- breaking 0005's predicate left every case in that file green,
 * and the leak was caught only by `isolation.test.ts` §7, which queries `organizations`
 * with app.user_id set by hand and no join at all. Read the two together; the ones here
 * are repository assertions.
 *
 * Ordered by name so the switcher is alphabetical, then by id so it is stable when two
 * organisations share one. Soft-deleted orgs are filtered here, not in the policy --
 * soft delete is not a tenancy concern, the same split every other repo function makes.
 */
export async function listOrgsForUser(db: Db, userId: string): Promise<OrgSummary[]> {
  return withUser(db, userId, async (tx) =>
    tx
      .select({ id: organizations.id, name: organizations.name, slug: organizations.slug })
      .from(organizations)
      .innerJoin(
        orgMembers,
        and(eq(orgMembers.orgId, organizations.id), eq(orgMembers.userId, userId)),
      )
      .where(isNull(organizations.deletedAt))
      .orderBy(asc(organizations.name), asc(organizations.id)),
  )
}

/**
 * The org-wide principal, or `null` if this user has no org-wide view of that org.
 *
 * `member` returns `null` on purpose, and it is not an oversight: a member's access is
 * "assigned weddings only", so there is no legitimate principal that scopes them to a
 * whole organisation. The `Principal` union does not permit `{ kind: 'orgStaff', role:
 * 'member' }` at all -- which is exactly so that this decision has to be made here,
 * once, at the point where the membership row is actually in hand.
 */
export function principalForOrg(m: Memberships, orgId: string): Principal | null {
  const org = m.orgs.find((o) => o.orgId === orgId)
  if (!org) return null
  if (org.role !== 'owner' && org.role !== 'admin') return null
  return { kind: 'orgStaff', userId: m.userId, orgId, role: org.role }
}

/**
 * The principal for one wedding inside one org, or `null`.
 *
 * Three ways in, and the order of the checks is the design:
 *
 *   owner / admin   -> `null`, deliberately. `assertScoped` REFUSES an `orgStaff`
 *                      principal that carries a weddingId, because it would silently
 *                      narrow an owner to one wedding and show up later as "the
 *                      dashboard is mysteriously empty". An owner reading one wedding
 *                      uses their org-wide principal from `principalForOrg` and filters
 *                      in the query instead.
 *   member+assigned -> `assignedStaff`. Needs BOTH rows: `org_members` for the orgId,
 *                      which `wedding_members` deliberately does not carry, and
 *                      `wedding_members` for the assignment itself.
 *   couple / editor -> `weddingMember`, and only when there is no `org_members` row at
 *                      all. That absence IS the discriminator: a `wedding_members` row
 *                      with role `editor` means an assigned staff member when the user
 *                      is org staff, and an outside collaborator when they are not.
 *
 * `orgId` is a parameter rather than something this function looks up, because looking
 * it up is the circular read -- `weddings.org_id` is itself behind `app.org_id`. For
 * staff it comes from `org_members`. For a couple, who has no `org_members` row, it
 * cannot come from anywhere yet; that is the couple-portal gap and it is P7's problem,
 * not this function's.
 */
export function principalForWedding(
  m: Memberships,
  orgId: string,
  weddingId: string,
): Principal | null {
  const org = m.orgs.find((o) => o.orgId === orgId)
  const wedding = m.weddings.find((w) => w.weddingId === weddingId)

  if (org && (org.role === 'owner' || org.role === 'admin')) return null

  if (org?.role === 'member') {
    if (!wedding) return null
    return { kind: 'assignedStaff', userId: m.userId, orgId, weddingId, role: 'member' }
  }

  if (!wedding) return null
  return { kind: 'weddingMember', userId: m.userId, orgId, weddingId, role: wedding.role }
}

/**
 * Owner before admin before member, then by org id.
 *
 * `org_members` has no "last used" column. Ordering by role and then by id at least
 * makes the choice STABLE across requests, rather than depending on whatever order
 * Postgres felt like returning.
 *
 * **2026-08-21: the switcher shipped and the column did not.** This comment used to say a
 * real most-recently-used "arrives with the switcher". It does not: the choice is a
 * validated `gn_org` cookie, written by `switchOrg` in the dashboard's `actions.ts` and
 * checked against these rows on every read in `apps/web/src/lib/principal.ts`. A column
 * would cost a migration plus a write on every switch, landing on a table whose policy
 * runs on app.user_id rather than a tenant key; the cookie does not follow a planner to a
 * second device, and `docs/specs/0001-moving-around-the-dashboard.md` prices that.
 *
 * This function is still what decides where they land when the cookie is absent, stale, or
 * names an org they have been removed from -- which is all three of the fallback paths, so
 * it is reached far more often than "they have never switched".
 */
const LANDING_RANK: Record<OrgMembership['role'], number> = { owner: 0, admin: 1, member: 2 }

/**
 * The organisation a staff member should land in, or `null` if they are staff nowhere.
 *
 * This is `Session.lastOrgId`'s only legitimate source, and the distinction matters:
 * it is a LANDING TARGET, not an authorization input. Rung 2 of sign-in has to send the
 * user *somewhere*, and somewhere is a URL -- which is then re-resolved through
 * `principalForOrg` on the next request like every other URL. Section 3 is emphatic
 * that nothing may infer membership from a value carried in a session, so this returns
 * an id to redirect to and never a `Principal` to act with.
 */
export function landingOrgId(m: Memberships): string | null {
  const ranked = m.orgs
    .slice()
    .sort((a, b) => LANDING_RANK[a.role] - LANDING_RANK[b.role] || a.orgId.localeCompare(b.orgId))
  return ranked[0]?.orgId ?? null
}
