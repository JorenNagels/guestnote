import { and, eq, sql } from 'drizzle-orm'
import { users } from '../schema/auth.ts'
import { orgMembers } from '../schema/orgs.ts'
import { weddingMembers } from '../schema/weddings.ts'
import type { MembershipPrincipal, TenantDb } from '../tenant.ts'

/**
 * Who on the team can be handed work on one wedding: a run-sheet row's owner (spec 0004) and,
 * since spec 0009 C1, a task's assignee. One list for both, so the two pickers cannot disagree
 * about who works on a wedding.
 *
 * A module of its own, and deliberately NOT in the barrel: these take a `TenantDb`, so they run
 * inside a caller's `withTenant` and are no door of their own. It was `eligibleOwners` in
 * `run-sheet.ts` until the task form needed it; moving it there would have made `tasks.ts` import
 * `run-sheet.ts`, which already imports `tasks.ts` for `personName`, and a cycle between two
 * modules that both define top-level consts is a TDZ error waiting for an import order. So
 * `personName` moved here with it.
 */

/**
 * A person's display name. `users.name` is nullable on purpose (an invited staff member has no
 * name until they type one, see `schema/auth.ts`), and "Unknown" beside a comment from a
 * teammate the planner can see in the team list is worse than their address.
 */
export const personName = sql<string | null>`coalesce(nullif(${users.name}, ''), ${users.email})`

/** One entry in a staff picker: somebody who may be handed work on this wedding. */
export type WeddingStaffMember = {
  readonly id: string
  readonly name: string
}

/**
 * Who may be handed work on this wedding, as far as THIS caller can know (spec 0004).
 *
 * Owner or admin: the org's owners and admins, plus every `member` with a `wedding_members` row on
 * this wedding -- readable to them through 0007's `org_staff_read`, the join `listTeam` makes.
 * A `member`: themselves only. Their transaction is pinned and RLS lets them read no one else's
 * membership, so a list of colleagues is not something this principal can build, and the spec
 * settled on "themselves or nobody" rather than a new policy or a definer function to get one.
 * That is about the picker only: the run sheet and the checklist name every row's owner, `users`
 * having no policy, the same exposure `tasks.assigneeName` already has within one wedding.
 */
export async function eligibleWeddingStaff(
  tx: TenantDb,
  principal: MembershipPrincipal,
  weddingId: string,
): Promise<WeddingStaffMember[]> {
  if (principal.kind === 'weddingMember') return []
  if (principal.kind === 'assignedStaff') {
    const me = await tx
      .select({ id: users.id, name: personName })
      .from(users)
      .where(eq(users.id, principal.userId))
    return me.map((r) => ({ id: r.id, name: r.name ?? '' }))
  }
  const rows = await tx
    .selectDistinct({ id: users.id, name: personName })
    .from(orgMembers)
    .innerJoin(users, eq(users.id, orgMembers.userId))
    .leftJoin(
      weddingMembers,
      // `editor` only: an assignment, not a member's own `couple` row (spec 0008).
      and(
        eq(weddingMembers.userId, orgMembers.userId),
        eq(weddingMembers.weddingId, weddingId),
        eq(weddingMembers.role, 'editor'),
      ),
    )
    .where(
      and(
        eq(orgMembers.orgId, principal.orgId),
        sql`(${orgMembers.role} in ('owner', 'admin') or ${weddingMembers.userId} is not null)`,
      ),
    )
  return rows
    .map((r) => ({ id: r.id, name: r.name ?? '' }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
}

/**
 * Whether `userId` may be handed work on this wedding. `null` always may: nobody has it.
 * The same set the picker showed, read again under the same transaction, because a Server
 * Function's arguments are whatever the client sent.
 */
export async function isEligibleWeddingStaff(
  tx: TenantDb,
  principal: MembershipPrincipal,
  weddingId: string,
  userId: string | null,
): Promise<boolean> {
  if (userId === null) return true
  const staff = await eligibleWeddingStaff(tx, principal, weddingId)
  return staff.some((s) => s.id === userId)
}
