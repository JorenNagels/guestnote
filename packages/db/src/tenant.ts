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

export type { TenantDb }

/** The wedding a principal is pinned to, or null for org-wide staff. */
function weddingIdOf(p: Principal): string | null {
  return p.kind === 'orgStaff' ? null : p.weddingId
}

/**
 * Runs `fn` inside a transaction whose GUCs scope every query to one tenant.
 *
 * Four GUCs, all set with `is_local = true` as the FIRST statements in the
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
 */
export async function withTenant<T>(
  db: Db,
  principal: Principal,
  fn: (tx: TenantDb) => Promise<T>,
): Promise<T> {
  assertScoped(principal)

  const weddingId = weddingIdOf(principal)

  return db.transaction(async (tx) => {
    // First statements in the transaction, before `fn` can issue anything.
    await tx.execute(sql`select set_config('app.user_id', ${principal.userId}, true)`)
    await tx.execute(sql`select set_config('app.org_id', ${principal.orgId}, true)`)
    await tx.execute(sql`select set_config('app.wedding_id', ${weddingId ?? ''}, true)`)
    await tx.execute(sql`select set_config('app.wedding_role', ${principal.role}, true)`)
    return fn(tx)
  })
}

/**
 * Reads scoped to one user rather than one tenant, for the `own_memberships`
 * policies on `org_members` and `wedding_members`.
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
    // Deliberately no tenant GUCs: this call must not be able to read tenant data.
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
  const p = principal as Partial<Principal> & { kind?: string }
  if (!p.kind) throw new TenantScopeError('withTenant: principal.kind is missing')
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
