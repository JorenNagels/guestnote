import { sql } from 'drizzle-orm'
import type { Db, TenantDb } from './client.ts'

/**
 * Tenant scoping. The whole point of this file is that the dangerous call is not
 * merely checked -- it is unrepresentable.
 *
 * research/07-auth-and-tenancy.md section 3 states the trap: a principal with no
 * `org_members` row MUST also set `app.wedding_id`, because the policy's
 * `app.wedding_id IS NULL OR wedding_id = ...` branch means a couple's session that
 * omits it sees the planner's entire book of business. That section calls it "the
 * highest-risk path in the model".
 *
 * A runtime check is the belt. The type below is the braces.
 */

/** Roles permitted to see `visibility = 'internal'` rows. Mirrors the SQL policy. */
export const INTERNAL_VISIBLE_ROLES = ['owner', 'admin', 'member', 'editor'] as const

/**
 * There is no inhabitant of this union that carries an `orgId` without a
 * `weddingId` unless it is genuinely org-wide staff. A couple or an assigned staff
 * member cannot be constructed without the wedding they are scoped to, so the
 * dangerous shape cannot be built by accident -- only by casting through `any`,
 * which is what test/with-tenant.test.ts does to prove the runtime guard also fires.
 *
 * Note what is NOT here: any notion of "which org am I acting as" carried in a
 * session. The principal is derived from the URL, joined against `org_members` and
 * `wedding_members`. research/07-auth-and-tenancy.md section 3: "`app.org_id` is a
 * data-scoping mechanism, never a permission."
 *
 * ## `link` -- spec 0003, slice S10, migration 0008
 *
 * The one kind with no `userId` and no membership row behind it at all: a vendor
 * holding a signed URL, resolved by `resolve_vendor_link` (0008) from a bearer token
 * before anything else about the caller is known. `orgId` and `weddingId` are carried
 * for the same reason every other kind carries them -- the discriminated-union shape --
 * but `withTenant` deliberately does NOT set `app.org_id` for this kind (see its own
 * comment). That is what keeps a `link` principal from ever satisfying a plain
 * `tenant_isolation` policy (every one of them starts `org_id = app.org_id`, on a table
 * from before this kind existed) without having to add a role clause to each of those
 * policies by hand. `weddingVendorId` is the actual scope: 0008's two `link_read`
 * policies key on it alone, on the two tables spec 0003 names (`run_sheet_items`,
 * `wedding_vendors`) plus `wedding_events`, added so a run-sheet item's event label can be
 * read at all -- see 0008_vendor_link.sql Part 0 for why that third one was necessary and
 * why it is scoped by `weddingId` only, not `weddingVendorId`.
 *
 * **This variant must be rebuilt from `resolveVendorLinkByHash` (repos/vendor-links.ts) on
 * every use, and never persisted or reused across a request boundary.** Neither this type nor
 * `withTenant`'s `link` branch nor 0008's `link_read` policies re-check `vendor_links
 * .revoked_at` / `expires_at` -- `resolveVendorLinkByHash` is the only place that does, once,
 * at construction (it reads `resolve_vendor_link`'s `status` column and the caller refuses
 * anything but `'live'`). A `link` principal built once and kept around -- in a session, a
 * cache, a cookie -- would go on reading rows under RLS after the link it came from was
 * revoked or expired, because nothing downstream of construction asks again. This is safe
 * today only because the sole call site (`apps/web/src/app/pro/(public)/vendor/[token]/page
 * .tsx`) re-resolves fresh on every request with no caching in between --
 * `vendor-links-repo.test.ts` has a test proving the gap exists so a future caller that DOES
 * cache this principal gets caught by it, not by a production incident.
 */
export type Principal =
  | { kind: 'orgStaff'; userId: string; orgId: string; role: 'owner' | 'admin' }
  | { kind: 'assignedStaff'; userId: string; orgId: string; weddingId: string; role: 'member' }
  | {
      kind: 'weddingMember'
      userId: string
      orgId: string
      weddingId: string
      role: 'couple' | 'editor'
    }
  | { kind: 'link'; orgId: string; weddingId: string; weddingVendorId: string }

/**
 * Every `Principal` that comes from an actual `org_members` / `wedding_members` row --
 * i.e. everything except `link`. `principalForOrg` and `principalForWedding`
 * (`repos/memberships.ts`) never construct a `link` principal (only
 * `resolveVendorLinkByHash` does, from a token, not a membership), so their return type
 * says so: without this, adding `link` to `Principal` silently turned every `.userId` /
 * `.role` access in `tasks.ts` and `team.ts` into a union-property error, because those
 * fields are no longer common to all four kinds. This is that narrowing, named once.
 */
export type MembershipPrincipal = Exclude<Principal, { kind: 'link' }>

export type { TenantDb }

/** The wedding a principal is pinned to, or null for org-wide staff. */
function weddingIdOf(p: Principal): string | null {
  return p.kind === 'orgStaff' ? null : p.weddingId
}

/**
 * Runs `fn` inside a transaction whose GUCs scope every query to one tenant.
 *
 * Five GUCs, all set with `is_local = true` as the FIRST statements in the
 * transaction. `true` is non-negotiable with a pooler: without it a GUC survives
 * `COMMIT` on a connection that is then handed to the next request, and one
 * request's tenant leaks into the next. test/pooling.test.ts asserts precisely that
 * it does not.
 *
 * Every GUC is set explicitly, including to the empty string when absent, so that a
 * transaction can never inherit a value it did not ask for. The policies use
 * `nullif(current_setting(...), '')` so empty reads as "unset" -- and an unset
 * `app.org_id` makes `org_id = NULL` yield NULL, so the row is filtered. The schema
 * fails closed: no GUCs means no rows, which is assertion 1 of the isolation suite.
 *
 * ## `link` is a second shape, not a fifth branch of the same one
 *
 * A `link` principal has no `userId` and, on purpose, no `app.org_id` either --
 * `app.org_id` stays unset for exactly the reason `withUser` leaves it unset: every
 * `tenant_isolation` policy in this schema starts `org_id = nullif(current_setting
 * ('app.org_id', true), '')::uuid`, so with the GUC unset that comparison is NULL and
 * the row is filtered, on EVERY table this principal was not explicitly given a policy
 * for -- `weddings`, `organizations`, `vendors`, all of it -- with no change to any of
 * their existing policies. `app.wedding_id` IS still set (needed for display-adjacent
 * narrowing and because `schema-coverage.test.ts` requires every policy on a
 * `TENANT_SCOPED_TABLES` table to name it), but the scope that actually matters is
 * `app.wedding_vendor_id`: 0008's two `link_read` policies are the only ones that read
 * it, and they read nothing else that would admit a wider principal. See tenant.ts's
 * `Principal` doc for why this could not instead be "add a role clause to every
 * existing policy".
 */
export async function withTenant<T>(
  db: Db,
  principal: Principal,
  fn: (tx: TenantDb) => Promise<T>,
): Promise<T> {
  assertScoped(principal)

  if (principal.kind === 'link') {
    return db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.user_id', '', true)`)
      await tx.execute(sql`select set_config('app.org_id', '', true)`)
      await tx.execute(sql`select set_config('app.wedding_id', ${principal.weddingId}, true)`)
      await tx.execute(sql`select set_config('app.wedding_role', 'link', true)`)
      await tx.execute(
        sql`select set_config('app.wedding_vendor_id', ${principal.weddingVendorId}, true)`,
      )
      return fn(tx)
    })
  }

  const weddingId = weddingIdOf(principal)

  return db.transaction(async (tx) => {
    // First statements in the transaction, before `fn` can issue anything.
    await tx.execute(sql`select set_config('app.user_id', ${principal.userId}, true)`)
    await tx.execute(sql`select set_config('app.org_id', ${principal.orgId}, true)`)
    await tx.execute(sql`select set_config('app.wedding_id', ${weddingId ?? ''}, true)`)
    await tx.execute(sql`select set_config('app.wedding_role', ${principal.role}, true)`)
    await tx.execute(sql`select set_config('app.wedding_vendor_id', '', true)`)
    return fn(tx)
  })
}

/**
 * Reads scoped to one user rather than one tenant, for the `own_memberships` policies on
 * `org_members` and `wedding_members` -- and, since migration 0005, for
 * `organizations`' SELECT-only `org_read_for_members`, which is what lets a member's
 * organisation be NAMED before a tenant is known.
 *
 * This is the query that runs *before* the tenant is known, in order to determine
 * it. It deliberately does not reach for `unsafeDbForMigrationsAndAdminOnly` --
 * research/07-auth-and-tenancy.md section 4a asks for exactly that restraint, and
 * says to leave a comment so it does not get "fixed" later.
 */
export async function withUser<T>(
  db: Db,
  userId: string,
  fn: (tx: TenantDb) => Promise<T>,
): Promise<T> {
  if (!userId) throw new TenantScopeError('withUser: userId is required')
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.user_id', ${userId}, true)`)
    // Deliberately no tenant GUCs: app.org_id unset makes every tenant_isolation
    // predicate yield NULL, so the tenant tables return nothing here.
    //
    // ONE exception since migration 0005, and it is deliberate: `organizations` carries a
    // second, SELECT-only policy admitting a row to a user who holds an org_members row
    // for it, so `listOrgsForUser` can name an organisation before a tenant is known. It
    // is the only tenant table readable in this shape. Do not read this comment as
    // "nothing tenant-scoped is reachable" when adding a query here.
    await tx.execute(sql`select set_config('app.org_id', '', true)`)
    await tx.execute(sql`select set_config('app.wedding_id', '', true)`)
    await tx.execute(sql`select set_config('app.wedding_role', '', true)`)
    return fn(tx)
  })
}

export class TenantScopeError extends Error {
  override name = 'TenantScopeError'
}

/**
 * The belt behind the braces. Throws BEFORE any query is issued -- not "returns zero
 * rows", which would be indistinguishable from a legitimately empty result and would
 * let a mis-scoped call look successful.
 */
export function assertScoped(principal: Principal): void {
  // `kind` alone is read through a loose cast because a malformed caller (only reachable
  // by casting through `any`, see test/with-tenant.test.ts) may not even have it. Every
  // check past this point casts to the NARROWER partial for the branch it is in, rather
  // than one partial of the whole union -- `link` shares only `kind` and `orgId` with the
  // other three kinds, so a single `Partial<Principal>` collapsed to just those two the
  // moment `link` was added, and every `.userId` / `.role` access below stopped
  // typechecking. See `MembershipPrincipal`'s comment for the same trap in `tasks.ts`.
  const kind = (principal as { kind?: string }).kind
  if (!kind) throw new TenantScopeError('withTenant: principal.kind is missing')

  // A `link` principal has no userId and no role: it is not a membership at all, so the
  // checks below (which exist to enforce the org_members/wedding_members shape) do not
  // apply to it. It gets its own three-field check instead.
  if (kind === 'link') {
    const p = principal as Partial<Extract<Principal, { kind: 'link' }>>
    if (!p.orgId) {
      throw new TenantScopeError('withTenant: principal.orgId is required')
    }
    if (!p.weddingId) {
      throw new TenantScopeError('withTenant: a link principal must carry weddingId')
    }
    if (!p.weddingVendorId) {
      throw new TenantScopeError('withTenant: a link principal must carry weddingVendorId')
    }
    return
  }

  const p = principal as Partial<MembershipPrincipal> & { kind: string }
  if (!p.userId) throw new TenantScopeError('withTenant: principal.userId is required')
  if (!p.orgId) throw new TenantScopeError('withTenant: principal.orgId is required')
  if (!p.role) throw new TenantScopeError('withTenant: principal.role is required')

  if (p.kind !== 'orgStaff' && !('weddingId' in p && p.weddingId)) {
    throw new TenantScopeError(
      `withTenant: a '${p.kind}' principal has no org_members row, so weddingId is ` +
        'mandatory. Without it the RLS policy falls through to org-wide scope and ' +
        'this session would read every wedding in the organisation. ' +
        'See research/07-auth-and-tenancy.md section 3.',
    )
  }
  if (p.kind === 'orgStaff' && 'weddingId' in p && p.weddingId) {
    // Not a leak, but it silently narrows an owner/admin to one wedding, which
    // shows up later as "the dashboard is mysteriously empty".
    throw new TenantScopeError(
      "withTenant: an 'orgStaff' principal must not carry a weddingId; use " +
        "'assignedStaff' to scope a staff member to one wedding.",
    )
  }
}
