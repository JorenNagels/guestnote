'use server'

import {
  type CoupleModule,
  markCoupleActivitySeen,
  removeCouplePartner,
  revokeCoupleInvite,
  setCoupleModules,
} from '@guestnote/db'
import { revalidatePath } from 'next/cache'
import {
  type CoupleInviteResult,
  inviteCouple,
  resendCoupleInvite,
} from '../../../../../../lib/couple-invite.ts'
import { currentOrgId, currentOrgs, currentSession } from '../../../../../../lib/principal.ts'
import { normaliseInviteEmail } from '../../../../../../lib/staff-invite.ts'
import { assertWritable } from '../../../../../../lib/trial.ts'
import { isUuid } from '../../../../../../lib/uuid.ts'
import { currentWeddingScope } from '../../../../../../lib/wedding-scope.ts'

/**
 * The planner's side of the couple portal (spec 0008): invite, resend, revoke, remove, the module
 * switches, and the unread dot. Each resolves the caller itself (a Server Function is a POST to
 * its own route), and each repo function refuses anyone but owner, admin and the assigned member
 * -- `WeddingScope.principal` -- before any SQL.
 *
 * Every one but `markCoupleSeen` is a staff write and calls the trial guard first (spec 0005).
 * `markCoupleSeen` is a read receipt, not content, and is on `trial-guard.test.ts`'s allowlist:
 * a planner whose trial ended can still read what the couple wrote, and a dot that never clears
 * would say otherwise.
 */

const paths = (weddingId: string) => {
  revalidatePath(`/pro/weddings/${weddingId}`)
  revalidatePath(`/pro/weddings/${weddingId}/settings`)
}

async function studioAndInviter(): Promise<{ inviter: string; studio: string } | null> {
  const [session, orgId, orgs] = await Promise.all([
    currentSession(),
    currentOrgId(),
    currentOrgs(),
  ])
  if (!session || !orgId) return null
  return {
    inviter: session.name ?? session.email,
    studio: orgs.find((o) => o.id === orgId)?.name ?? '',
  }
}

export type InviteCoupleOutcome =
  | { readonly ok: true; readonly results: readonly CoupleInviteResult[] }
  | {
      readonly ok: false
      readonly reason: 'invalidEmail' | 'sameEmail' | 'forbidden'
      /** For `invalidEmail`: which of the given fields, 0 or 1, so the card marks that one. */
      readonly index?: number
    }

/** One or two addresses; the second may be blank. Both are validated before either is sent. */
export async function inviteCoupleAction(
  weddingId: string,
  raw: readonly string[],
): Promise<InviteCoupleOutcome> {
  await assertWritable(await currentOrgId())
  const fields = raw.slice(0, 2).map((e) => String(e ?? ''))
  if (fields.every((e) => e.trim() === '')) return { ok: false, reason: 'invalidEmail', index: 0 }
  const bad = fields.findIndex((e) => e.trim() !== '' && normaliseInviteEmail(e) === null)
  if (bad !== -1) return { ok: false, reason: 'invalidEmail', index: bad }
  const clean = fields
    .filter((e) => e.trim() !== '')
    .map((e) => normaliseInviteEmail(e))
    .filter((e): e is string => e !== null)
  if (clean.length === 2 && clean[0] === clean[1]) return { ok: false, reason: 'sameEmail' }

  const [scope, who] = await Promise.all([currentWeddingScope(weddingId), studioAndInviter()])
  if (!scope || !who) return { ok: false, reason: 'forbidden' }

  const results = await inviteCouple(scope, { ...who, emails: clean })
  paths(weddingId)
  return { ok: true, results }
}

export async function resendCoupleInviteAction(
  weddingId: string,
  invitationId: string,
): Promise<CoupleInviteResult | null> {
  await assertWritable(await currentOrgId())
  if (!isUuid(invitationId)) return null
  const [scope, who] = await Promise.all([currentWeddingScope(weddingId), studioAndInviter()])
  if (!scope || !who) return null
  const result = await resendCoupleInvite(scope, invitationId, who)
  paths(weddingId)
  return result
}

export async function revokeCoupleInviteAction(
  weddingId: string,
  invitationId: string,
): Promise<{ ok: boolean }> {
  await assertWritable(await currentOrgId())
  if (!isUuid(invitationId)) return { ok: false }
  const scope = await currentWeddingScope(weddingId)
  if (!scope) return { ok: false }
  const gone = await revokeCoupleInvite(scope, invitationId)
  if (gone.ok) paths(weddingId)
  return { ok: gone.ok }
}

export async function removeCouplePartnerAction(
  weddingId: string,
  userId: string,
): Promise<{ ok: boolean }> {
  await assertWritable(await currentOrgId())
  if (!isUuid(userId)) return { ok: false }
  const scope = await currentWeddingScope(weddingId)
  if (!scope) return { ok: false }
  const gone = await removeCouplePartner(scope, userId)
  if (gone.ok) paths(weddingId)
  return { ok: gone.ok }
}

export async function setCoupleModulesAction(
  weddingId: string,
  modules: readonly CoupleModule[],
): Promise<{ ok: boolean }> {
  await assertWritable(await currentOrgId())
  if (!Array.isArray(modules)) return { ok: false }
  const scope = await currentWeddingScope(weddingId)
  if (!scope) return { ok: false }
  const saved = await setCoupleModules(
    scope,
    modules.filter((m): m is string => typeof m === 'string'),
  )
  if (saved.ok) paths(weddingId)
  return { ok: saved.ok }
}

export async function markCoupleSeen(
  weddingId: string,
  kind: 'task' | 'file',
  id: string,
): Promise<void> {
  if ((kind !== 'task' && kind !== 'file') || !isUuid(id)) return
  const scope = await currentWeddingScope(weddingId)
  if (!scope) return
  await markCoupleActivitySeen(scope, { kind, id })
}
