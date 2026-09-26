'use server'

import { revokeStaffInvite } from '@guestnote/db'
import { revalidatePath } from 'next/cache'
import { getLocale } from 'next-intl/server'
import { getDb } from '../../../../lib/db.ts'
import {
  currentMemberships,
  currentOrgId,
  currentOrgs,
  currentSession,
} from '../../../../lib/principal.ts'
import {
  type InviteOutcome,
  inviteStaff,
  normaliseInviteEmail,
  parseStaffRole,
} from '../../../../lib/staff-invite.ts'
import { isUuid } from '../../../../lib/uuid.ts'

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

/**
 * The core -- the row, the mail, taking the row back when the mail fails -- is
 * `lib/staff-invite.ts`, shared with sign-up's team step. What stays here is how the Team screen
 * finds the caller and the org: the session and the `gn_org` cookie.
 */
export async function inviteTeamMember(input: {
  email: string
  role: string
}): Promise<InviteOutcome> {
  const email = normaliseInviteEmail(input.email)
  if (!email) return { ok: false, reason: 'invalidEmail' }
  const role = parseStaffRole(input.role)
  if (!role) return { ok: false, reason: 'invalidRole' }

  const [session, memberships, orgId, orgs, locale] = await Promise.all([
    currentSession(),
    currentMemberships(),
    currentOrgId(),
    currentOrgs(),
    getLocale(),
  ])
  if (!session || !memberships || !orgId) return { ok: false, reason: 'forbidden' }

  const outcome = await inviteStaff({
    memberships,
    orgId,
    orgName: orgs.find((o) => o.id === orgId)?.name ?? '',
    inviter: session.name ?? session.email,
    locale,
    email,
    role,
  })
  if (outcome.ok) revalidatePath('/pro/team')
  return outcome
}

export async function revokeInvite(invitationId: string): Promise<{ ok: boolean }> {
  if (!isUuid(invitationId)) return { ok: false }

  const [memberships, orgId] = await Promise.all([currentMemberships(), currentOrgId()])
  if (!memberships || !orgId) return { ok: false }

  const gone = await revokeStaffInvite(getDb(), memberships, orgId, invitationId)
  if (gone.ok) revalidatePath('/pro/team')
  return { ok: gone.ok }
}
