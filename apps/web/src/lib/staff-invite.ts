import 'server-only'
import { createStaffInvite, type Memberships, revokeStaffInvite } from '@guestnote/db'
import { newBearerToken } from './bearer-token.ts'
import { getDb } from './db.ts'
import { sendStaffInviteMail } from './invite-mail.ts'
import { INVITE_TTL_DAYS } from './invite-token.ts'

/**
 * Inviting a colleague: one row and one mail. Shared by the Team screen's `inviteTeamMember` and
 * sign-up's team step (spec 0005: "Step 5 uses the existing staff invite path"), so the two
 * cannot disagree about what an invitation is. Rejected: sign-up calling the Team Server
 * Function -- that one reads the org from the `gn_org` cookie, and a planner who is staff
 * elsewhere may have that cookie pointing at the other studio while they fill in their own.
 *
 * NOT an authorization point. Each caller has already resolved who is asking and in which org;
 * `createStaffInvite` then refuses anyone who is not owner or admin there (`principalForOrg`),
 * before any SQL. That is the gate, as it was before this was extracted.
 */

export type InviteFailure =
  | 'invalidEmail'
  | 'invalidRole'
  | 'duplicate'
  | 'alreadyMember'
  | 'forbidden'
  | 'mailFailed'

export type InviteOutcome = { ok: true } | { ok: false; reason: InviteFailure }

export type StaffRole = 'admin' | 'member'

/** Deliberately loose: the only real test of an address is whether mail arrives. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * The address trimmed and lower-cased, or null when it is not one. Pure, so a caller can check
 * every row of a form before it reads a session or writes anything.
 */
export function normaliseInviteEmail(raw: unknown): string | null {
  const email = String(raw ?? '')
    .trim()
    .toLowerCase()
  return email.length > 254 || !EMAIL.test(email) ? null : email
}

/**
 * `owner` is not on offer: ownership is not something an invitation can grant, and the
 * `invitations_role_check` constraint would refuse it anyway. The wire value is a string.
 */
export function parseStaffRole(raw: unknown): StaffRole | null {
  return raw === 'admin' || raw === 'member' ? raw : null
}

export async function inviteStaff(input: {
  readonly memberships: Memberships
  readonly orgId: string
  readonly orgName: string
  /** Who the mail says invited them. */
  readonly inviter: string
  /** The inviter's language; the invitee has no preference yet (`invite-mail.ts`). */
  readonly locale: string
  /** Already through `normaliseInviteEmail`. */
  readonly email: string
  readonly role: StaffRole
}): Promise<InviteOutcome> {
  const { memberships, orgId, email, role } = input
  const { token, tokenHash } = newBearerToken()
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000)

  const created = await createStaffInvite(getDb(), memberships, orgId, {
    email,
    role,
    tokenHash,
    expiresAt,
  })
  if (!created.ok) return { ok: false, reason: created.reason }

  const sent = await sendStaffInviteMail({
    to: email,
    token,
    locale: input.locale,
    inviter: input.inviter,
    org: input.orgName,
    role,
  }).catch(() => null)

  if (!sent?.ok) {
    // Take the row back: a pending invite whose mail never left is one the planner cannot
    // tell from a live one, and its only effect would be to block a retry as a duplicate.
    await revokeStaffInvite(getDb(), memberships, orgId, created.value.id)
    return { ok: false, reason: 'mailFailed' }
  }
  return { ok: true }
}
