import { createHash } from 'node:crypto'
import type { AcceptResult, Invitation } from './types.ts'

/**
 * The provider-independent half of invitations: turn a token from a URL into the
 * `Invitation` the landing screen renders, and spend it.
 *
 * Better Auth is not involved. `invitations` is hand-rolled (research/07 section 4b), so
 * there is no provider type to hide here -- this file is in the seam because it is the seam's
 * vocabulary (`Invitation`, `AcceptResult`), and because `better-auth.ts` staying the ONLY
 * provider contact (CLAUDE.md invariant 5) is easier to keep when nothing else grows into it.
 *
 * ## The store is passed in
 *
 * `packages/core` does not depend on `@guestnote/db`, and reads no environment: like
 * `sendCode` and `newId`, the database half arrives as an argument. `lib/auth.ts` builds an
 * `InvitationStore` out of the two repo functions over `resolve_invitation` and
 * `accept_invitation` (migration 0007), which is where the SQL and its reasoning live.
 *
 * ## Hashing happens here, and only here
 *
 * The store only ever sees `tokenHash`. The plaintext is in the email and the URL, and never
 * in a query or a log line. `hashInviteToken` is exported because the invite ACTION (S6)
 * must generate the same hash it stores -- one implementation on both sides means the case
 * and the encoding cannot drift.
 */

/** Lower-case hex SHA-256 of the token's UTF-8 bytes: what `invitations.token_hash` holds. */
export function hashInviteToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

export type InvitationRecord = {
  readonly weddingId: string | null
  readonly email: string
  readonly role: string
  readonly orgName: string
  readonly inviterName: string | null
  readonly status: 'pending' | 'expired' | 'accepted'
}

export type AcceptRecord =
  | { readonly outcome: 'accepted'; readonly role: string }
  | {
      readonly outcome: 'unknown' | 'expired' | 'already_accepted' | 'wrong_user' | 'forbidden'
    }

export type InvitationStore = {
  /** `null` when the hash matches nothing. Must not require a session. */
  readonly resolve: (tokenHash: string) => Promise<InvitationRecord | null>
  /** Must run as `userId`: the database refuses when the two disagree. */
  readonly accept: (tokenHash: string, userId: string) => Promise<AcceptRecord>
}

/**
 * Who the screen says invited you. The name can be missing (an inviter who never gave one,
 * or whose account is gone), and a blank sentence reads as a bug, so it falls back to the
 * organisation, which is always known and is the party the invitee is actually joining.
 */
function inviterOf(r: InvitationRecord): string {
  return r.inviterName?.trim() || r.orgName
}

export async function resolveInvitationWith(
  store: InvitationStore,
  token: string,
): Promise<Invitation> {
  // An empty or absurd token is `unknown` without a query. 32 random bytes is 43 base64url
  // characters, so a generous ceiling costs a real invitation nothing and stops a 10 MB path
  // segment being hashed for nothing.
  if (!token || token.length > 256) return { kind: 'unknown' }

  const r = await store.resolve(hashInviteToken(token))
  if (!r) return { kind: 'unknown' }

  // Accepted outranks expired: a link that was used and then aged out is still "you already
  // have an account", which is the useful thing to say.
  if (r.status === 'accepted') return { kind: 'accepted' }
  if (r.status === 'expired') return { kind: 'expired', inviter: inviterOf(r) }

  if (r.weddingId !== null) return { kind: 'wedding', inviter: inviterOf(r), org: r.orgName }

  // The `invitations_scope_role_check` constraint admits only these two for a staff row. A
  // value outside them is a schema change this switch has not caught up with, and rendering
  // it as `member` would grant less than was offered but hide the mismatch.
  if (r.role !== 'admin' && r.role !== 'member') return { kind: 'unknown' }

  return { kind: 'staff', email: r.email, inviter: inviterOf(r), org: r.orgName, role: r.role }
}

export async function acceptInvitationWith(
  store: InvitationStore,
  token: string,
  userId: string,
): Promise<AcceptResult> {
  if (!token || token.length > 256 || !userId) return { outcome: 'unknown' }
  const r = await store.accept(hashInviteToken(token), userId)
  return r.outcome === 'accepted' ? { outcome: 'accepted', role: r.role } : { outcome: r.outcome }
}
