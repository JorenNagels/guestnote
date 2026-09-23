'use server'

import { createStaffInvite, revokeStaffInvite } from '@guestnote/db'
import { revalidatePath } from 'next/cache'
import { getLocale } from 'next-intl/server'
import { newBearerToken } from '../../../../lib/bearer-token.ts'
import { getDb } from '../../../../lib/db.ts'
import { sendStaffInviteMail } from '../../../../lib/invite-mail.ts'
import { INVITE_TTL_DAYS } from '../../../../lib/invite-token.ts'
import {
  currentMemberships,
  currentOrgId,
  currentOrgs,
  currentSession,
} from '../../../../lib/principal.ts'

/**
 * Team Server Functions. **Not guarded by `(app)/layout.tsx`** -- a Server Function is a POST
 * to its own route (CLAUDE.md invariant 7) -- so each one resolves the session and the
 * memberships itself, and the repo functions refuse anyone who is not owner or admin before
 * any SQL runs (`principalForOrg` is `null` for a `member`). The org comes from
 * `currentOrgId()`, which validates the `gn_org` cookie against the user's own membership
 * rows; nothing here takes an org id from the client.
 *
 * The path is `/pro/team`, not `/team`: `revalidatePath` wants the route file, not the
 * rewritten URL (see `(app)/actions.ts`, `DASHBOARD_TREE`).
 */

export type InviteFailure =
  | 'invalidEmail'
  | 'invalidRole'
  | 'duplicate'
  | 'alreadyMember'
  | 'forbidden'
  | 'mailFailed'

export type InviteOutcome = { ok: true } | { ok: false; reason: InviteFailure }

/** Deliberately loose: the only real test of an address is whether mail arrives. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function inviteTeamMember(input: {
  email: string
  role: string
}): Promise<InviteOutcome> {
  const email = String(input.email ?? '')
    .trim()
    .toLowerCase()
  if (email.length > 254 || !EMAIL.test(email)) return { ok: false, reason: 'invalidEmail' }
  // `owner` is not on offer: ownership is not something an invitation can grant, and the
  // `invitations_role_check` constraint would refuse it anyway. The wire value is a string.
  if (input.role !== 'admin' && input.role !== 'member') return { ok: false, reason: 'invalidRole' }
  const role = input.role

  const [session, memberships, orgId, orgs, locale] = await Promise.all([
    currentSession(),
    currentMemberships(),
    currentOrgId(),
    currentOrgs(),
    getLocale(),
  ])
  if (!session || !memberships || !orgId) return { ok: false, reason: 'forbidden' }

  const { token, tokenHash } = newBearerToken()
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000)

  const created = await createStaffInvite(getDb(), memberships, orgId, {
    email,
    role,
    tokenHash,
    expiresAt,
  })
  if (created.kind !== 'created') return { ok: false, reason: created.kind }

  const sent = await sendStaffInviteMail({
    to: email,
    token,
    locale,
    inviter: session.name ?? session.email,
    org: orgs.find((o) => o.id === orgId)?.name ?? '',
    role,
  }).catch(() => null)

  if (!sent?.ok) {
    // Take the row back: a pending invite whose mail never left is one the planner cannot
    // tell from a live one, and its only effect would be to block a retry as a duplicate.
    await revokeStaffInvite(getDb(), memberships, orgId, created.id)
    return { ok: false, reason: 'mailFailed' }
  }

  revalidatePath('/pro/team')
  return { ok: true }
}

export async function revokeInvite(invitationId: string): Promise<{ ok: boolean }> {
  if (!UUID.test(String(invitationId))) return { ok: false }

  const [memberships, orgId] = await Promise.all([currentMemberships(), currentOrgId()])
  if (!memberships || !orgId) return { ok: false }

  const gone = await revokeStaffInvite(getDb(), memberships, orgId, invitationId)
  if (gone) revalidatePath('/pro/team')
  return { ok: gone }
}
