import { sql } from 'drizzle-orm'
import type { Db, TenantDb } from '../client.ts'
import { withUser } from '../tenant.ts'

/**
 * The two doors onto `invitations` that open before a principal exists: read an invitation
 * by its token, and accept it. Migration 0007 explains why they are SQL functions and not
 * queries (`resolve_invitation`, `accept_invitation`, both SECURITY DEFINER) -- in short,
 * `tenant_isolation` needs the org the token is used to learn, and building accept from an
 * INSERT into `org_members` would let any signed-in user enrol themselves anywhere.
 *
 * ## This is not an unscoped handle, and it is not `withTenant` either
 *
 * Neither call reads or writes a table directly: each is one `select` of one function, and
 * the function is the whole of the door. That is why `resolveInvitationByHash` takes a plain
 * `Db` and sets no GUCs -- there is no principal to set them for. `acceptInvitationByHash`
 * goes through `withUser`, because the function insists `app.user_id` equal the user it is
 * accepting for, so a caller that passes the wrong id fails closed.
 *
 * ## The token never arrives here
 *
 * Both take `tokenHash`, lower-case hex SHA-256, computed by the auth seam
 * (`packages/core/src/auth/invitations.ts`). The plaintext exists in the email and in the
 * URL, and nowhere in a query.
 *
 * Plain rows out, no `pg` type: `status` and `outcome` are narrowed to their unions here so
 * a value the function might one day return that this file does not know throws, rather than
 * rendering as a state nobody designed.
 */

export type InvitationLookup = {
  readonly invitationId: string
  readonly orgId: string
  readonly orgName: string
  /** Null for a staff invitation, set for a couple/editor one. */
  readonly weddingId: string | null
  readonly email: string
  readonly role: string
  /** `users.name` of whoever invited, which can be null (never named, or deleted since). */
  readonly inviterName: string | null
  readonly status: 'pending' | 'expired' | 'accepted'
}

export type AcceptOutcome =
  | {
      readonly outcome: 'accepted'
      readonly orgId: string
      readonly weddingId: string | null
      readonly role: string
    }
  | {
      readonly outcome: 'unknown' | 'expired' | 'already_accepted' | 'wrong_user' | 'forbidden'
    }

type ResolveRow = {
  invitation_id: string
  org_id: string
  org_name: string
  wedding_id: string | null
  email: string
  role: string
  inviter_name: string | null
  status: string
}

type AcceptRow = {
  outcome: string
  joined_org_id: string | null
  joined_wedding_id: string | null
  joined_role: string | null
}

// `TenantDb`'s result type is deliberately the driver-agnostic PgTransaction, whose result
// HKT is unresolved, so raw `execute` is cast to the one shape both drivers return.
// Same cast as `app/api/health/route.ts`.
async function rowsOf<T>(pending: Promise<unknown>): Promise<T[]> {
  return ((await pending) as { rows: T[] }).rows
}

const RESOLVE_STATUSES = new Set(['pending', 'expired', 'accepted'])
const REFUSALS = new Set(['unknown', 'expired', 'already_accepted', 'wrong_user', 'forbidden'])

/** `null` for a token that matches nothing, which includes a revoked (deleted) invitation. */
export async function resolveInvitationByHash(
  db: Db,
  tokenHash: string,
): Promise<InvitationLookup | null> {
  const [row] = await rowsOf<ResolveRow>(
    db.execute(sql`select * from public.resolve_invitation(${tokenHash})`),
  )
  if (!row) return null
  if (!RESOLVE_STATUSES.has(row.status)) {
    throw new Error(
      `resolve_invitation returned an unknown status '${row.status}' (migration 0007)`,
    )
  }
  return {
    invitationId: row.invitation_id,
    orgId: row.org_id,
    orgName: row.org_name,
    weddingId: row.wedding_id,
    email: row.email,
    role: row.role,
    inviterName: row.inviter_name,
    status: row.status as InvitationLookup['status'],
  }
}

/**
 * Spends the invitation for `userId` and writes their membership, in one transaction.
 * `userId` must be the SIGNED-IN user -- the function checks it against the transaction's
 * `app.user_id` and refuses (`forbidden`) otherwise -- and the invitation's email must match
 * that user's (`wrong_user`).
 */
export async function acceptInvitationByHash(
  db: Db,
  tokenHash: string,
  userId: string,
): Promise<AcceptOutcome> {
  const [row] = await withUser(db, userId, (tx: TenantDb) =>
    rowsOf<AcceptRow>(
      tx.execute(sql`select * from public.accept_invitation(${tokenHash}, ${userId}::uuid)`),
    ),
  )
  if (!row) throw new Error('accept_invitation returned no row (migration 0007)')
  if (row.outcome === 'accepted') {
    if (!row.joined_org_id || !row.joined_role) {
      throw new Error('accept_invitation said accepted with no org or role (migration 0007)')
    }
    return {
      outcome: 'accepted',
      orgId: row.joined_org_id,
      weddingId: row.joined_wedding_id,
      role: row.joined_role,
    }
  }
  if (!REFUSALS.has(row.outcome)) {
    throw new Error(
      `accept_invitation returned an unknown outcome '${row.outcome}' (migration 0007)`,
    )
  }
  return { outcome: row.outcome as Exclude<AcceptOutcome['outcome'], 'accepted'> } as AcceptOutcome
}
