import { and, asc, desc, eq, gt, inArray, isNull, sql } from 'drizzle-orm'
import type { Db } from '../client.ts'
import { newId } from '../id.ts'
import { users } from '../schema/auth.ts'
import { invitations, orgMembers } from '../schema/orgs.ts'
import { weddingMembers, weddings } from '../schema/weddings.ts'
import { withTenant } from '../tenant.ts'
import { type Memberships, principalForOrg } from './memberships.ts'

/**
 * Slice S6 (spec 0003): the team list and staff invitations.
 *
 * Every function takes `Memberships` and an org id and resolves the principal itself, so a
 * caller cannot reach a query without the org-wide check having run. `null` from
 * `principalForOrg` means "not owner or admin here", and every function turns that into a
 * refusal before any SQL is issued.
 *
 * ## What lets `listTeam` see every row
 *
 * `org_members` and `wedding_members` carry `own_memberships` (`user_id = app.user_id`) for
 * writes, plus `org_staff_read`, a `for select` policy for owner/admin scoped by `app.org_id`
 * (migration `0007`, F1b). Without it an owner reading through `withTenant` would get only
 * their own row. This query was written against that intended policy before it existed
 * (see `team/SPEC.md`) rather than worked around, because the workaround would have been a
 * second unscoped reader and invariant 1 says stop there.
 */

export type TeamRole = 'owner' | 'admin' | 'member'

export type TeamMember = {
  readonly userId: string
  readonly name: string | null
  readonly email: string
  readonly role: TeamRole
  readonly joinedAt: Date
  /** Only meaningful for `member`; owner and admin work on every wedding. */
  readonly weddings: readonly { readonly id: string; readonly coupleDisplayName: string }[]
}

export type PendingInvite = {
  readonly id: string
  readonly email: string
  readonly role: 'admin' | 'member'
  readonly createdAt: Date
  readonly expiresAt: Date
  readonly invitedByName: string | null
}

export type InviteResult =
  | { readonly kind: 'created'; readonly id: string }
  | { readonly kind: 'forbidden' }
  | { readonly kind: 'duplicate' }
  | { readonly kind: 'alreadyMember' }

/** Owner before admin before member, then by join date, so the seat labels are stable. */
const ROLE_RANK: Record<TeamRole, number> = { owner: 0, admin: 1, member: 2 }

/**
 * Everyone in the organisation, with their assigned weddings. `null` when the caller is not
 * owner or admin -- the page shows a notice for that, not a 404, because a member knows the
 * screen exists (it is in their sidebar).
 */
export async function listTeam(
  db: Db,
  m: Memberships,
  orgId: string,
): Promise<TeamMember[] | null> {
  const principal = principalForOrg(m, orgId)
  if (!principal) return null

  return withTenant(db, principal, async (tx) => {
    const rows = await tx
      .select({
        userId: orgMembers.userId,
        role: orgMembers.role,
        joinedAt: orgMembers.createdAt,
        name: users.name,
        email: users.email,
      })
      .from(orgMembers)
      .innerJoin(users, eq(users.id, orgMembers.userId))
      .where(eq(orgMembers.orgId, orgId))

    const memberIds = rows.filter((r) => r.role === 'member').map((r) => r.userId)
    const assigned =
      memberIds.length === 0
        ? []
        : await tx
            .select({
              userId: weddingMembers.userId,
              id: weddings.id,
              coupleDisplayName: weddings.coupleDisplayName,
            })
            .from(weddingMembers)
            .innerJoin(weddings, eq(weddings.id, weddingMembers.weddingId))
            .where(and(inArray(weddingMembers.userId, memberIds), isNull(weddings.deletedAt)))
            .orderBy(asc(weddings.weddingDate))

    return rows
      .map(
        (r): TeamMember => ({
          userId: r.userId,
          name: r.name,
          email: r.email,
          role: r.role as TeamRole,
          joinedAt: r.joinedAt,
          weddings: assigned
            .filter((a) => a.userId === r.userId)
            .map((a) => ({ id: a.id, coupleDisplayName: a.coupleDisplayName })),
        }),
      )
      .sort(
        (a, b) =>
          ROLE_RANK[a.role] - ROLE_RANK[b.role] ||
          a.joinedAt.getTime() - b.joinedAt.getTime() ||
          a.userId.localeCompare(b.userId),
      )
  })
}

/**
 * Staff invitations nobody has accepted yet, newest first. Expired ones are included on
 * purpose: the planner needs to see them to revoke them, and hiding them would leave a dead
 * row that blocks nothing and explains nothing.
 *
 * `wedding_id is null` is the staff discriminator (`schema/orgs.ts`); couple and editor
 * invitations belong to the couple-portal spec and never appear here.
 */
export async function listPendingInvites(
  db: Db,
  m: Memberships,
  orgId: string,
): Promise<PendingInvite[] | null> {
  const principal = principalForOrg(m, orgId)
  if (!principal) return null

  return withTenant(db, principal, async (tx) => {
    const rows = await tx
      .select({
        id: invitations.id,
        email: invitations.email,
        role: invitations.role,
        createdAt: invitations.createdAt,
        expiresAt: invitations.expiresAt,
        invitedByName: users.name,
      })
      .from(invitations)
      .leftJoin(users, eq(users.id, invitations.invitedBy))
      .where(and(isNull(invitations.weddingId), isNull(invitations.acceptedAt)))
      .orderBy(desc(invitations.createdAt))
    return rows.map((r) => ({ ...r, role: r.role as 'admin' | 'member' }))
  })
}

/**
 * Writes one staff invitation. The caller has already generated the token and passes only
 * its hash: the plaintext exists in the email and nowhere in the database.
 *
 * Two refusals besides `forbidden`, both checked inside the same transaction as the insert:
 * a live pending invite for the same address, and an address that already belongs to a
 * member. The second read goes through `org_members` under `org_staff_read` (see the header),
 * so it sees the whole org, not just the caller's own row. The insert is not made conditional on
 * either check at the database level (there is no unique index to lean on, and adding one is
 * a migration), so two simultaneous sends can both win; the cost is one duplicate pending row
 * that the planner can revoke.
 *
 * `email` must already be trimmed and lower-cased; this function compares, it does not
 * normalise, so a caller that forgets fails the duplicate check instead of hiding it.
 */
export async function createStaffInvite(
  db: Db,
  m: Memberships,
  orgId: string,
  input: {
    readonly email: string
    readonly role: 'admin' | 'member'
    readonly tokenHash: string
    readonly expiresAt: Date
  },
): Promise<InviteResult> {
  const principal = principalForOrg(m, orgId)
  if (!principal) return { kind: 'forbidden' }

  return withTenant(db, principal, async (tx) => {
    const [member] = await tx
      .select({ userId: orgMembers.userId })
      .from(orgMembers)
      .innerJoin(users, eq(users.id, orgMembers.userId))
      .where(and(eq(orgMembers.orgId, orgId), sql`lower(${users.email}) = ${input.email}`))
      .limit(1)
    if (member) return { kind: 'alreadyMember' }

    const [live] = await tx
      .select({ id: invitations.id })
      .from(invitations)
      .where(
        and(
          isNull(invitations.weddingId),
          isNull(invitations.acceptedAt),
          gt(invitations.expiresAt, new Date()),
          sql`lower(${invitations.email}) = ${input.email}`,
        ),
      )
      .limit(1)
    if (live) return { kind: 'duplicate' }

    const id = newId()
    await tx.insert(invitations).values({
      id,
      orgId,
      weddingId: null,
      email: input.email,
      role: input.role,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      invitedBy: principal.userId,
    })
    return { kind: 'created', id }
  })
}

/**
 * Deletes a staff invitation that has not been accepted. `true` when a row went away.
 *
 * Deleting rather than flagging: `invitations` has no `revoked_at`, and adding one is a
 * migration this slice may not write. The cost is that "who revoked what" is not
 * recorded; `audit_log` is the place for that when it is wired.
 *
 * The `where` repeats what the policy already guarantees (same org) and adds the two things
 * it does not: staff only, and not yet accepted. An accepted invitation is history and must
 * survive a stray revoke.
 */
export async function revokeStaffInvite(
  db: Db,
  m: Memberships,
  orgId: string,
  invitationId: string,
): Promise<boolean> {
  const principal = principalForOrg(m, orgId)
  if (!principal) return false

  return withTenant(db, principal, async (tx) => {
    const gone = await tx
      .delete(invitations)
      .where(
        and(
          eq(invitations.id, invitationId),
          eq(invitations.orgId, orgId),
          isNull(invitations.weddingId),
          isNull(invitations.acceptedAt),
        ),
      )
      .returning({ id: invitations.id })
    return gone.length > 0
  })
}
