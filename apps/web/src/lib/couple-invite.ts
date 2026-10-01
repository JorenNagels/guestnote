import 'server-only'
import {
  type CoupleInviteRefusal,
  createCoupleInvite,
  getCoupleAccess,
  renewCoupleInvite,
  type WeddingScope,
} from '@guestnote/db'
import { newBearerToken } from './bearer-token.ts'
import { sendCoupleInviteMail } from './invite-mail.ts'
import { COUPLE_INVITE_TTL_DAYS } from './invite-token.ts'

/**
 * Inviting a couple (spec 0008): one row and one mail per partner, the staff shape
 * (`lib/staff-invite.ts`) with two differences the spec settled.
 *
 * **The row stays when the mail fails.** Staff invites take the row back so a retry is not
 * refused as a duplicate. Here the planner sees the pending invite with "Opnieuw versturen" beside
 * it, and a resend issues a fresh token -- so keeping the row costs nothing and tells the planner
 * the truth about who was invited. Rejected: the staff behaviour, which would make a bounced
 * address vanish from the list the planner is looking at.
 *
 * **The mail is in the wedding's language**, read from the wedding, not the inviter's cookie.
 *
 * NOT an authorization point: `createCoupleInvite` refuses anyone but owner, admin and the
 * assigned member before it writes.
 */

export type CoupleInviteFailure = CoupleInviteRefusal | 'notFound' | 'mailFailed'

export type CoupleInviteResult =
  | { readonly email: string; readonly ok: true }
  | { readonly email: string; readonly ok: false; readonly reason: CoupleInviteFailure }

const ttl = () => new Date(Date.now() + COUPLE_INVITE_TTL_DAYS * 24 * 60 * 60 * 1000)

/** One invite per address, in order; each result names its address so the card can place it. */
export async function inviteCouple(
  scope: WeddingScope,
  input: { readonly inviter: string; readonly studio: string; readonly emails: readonly string[] },
): Promise<CoupleInviteResult[]> {
  const access = await getCoupleAccess(scope)
  if (!access) return input.emails.map((email) => ({ email, ok: false, reason: 'forbidden' }))

  const results: CoupleInviteResult[] = []
  for (const email of input.emails) {
    const { token, tokenHash } = newBearerToken()
    const created = await createCoupleInvite(scope, { email, tokenHash, expiresAt: ttl() })
    if (!created.ok) {
      results.push({ email, ok: false, reason: created.reason })
      continue
    }
    const sent = await send(access, input, email, token)
    results.push(sent ? { email, ok: true } : { email, ok: false, reason: 'mailFailed' })
  }
  return results
}

/** A fresh token for a pending invite, mailed again. The old link stops working. */
export async function resendCoupleInvite(
  scope: WeddingScope,
  invitationId: string,
  input: { readonly inviter: string; readonly studio: string },
): Promise<CoupleInviteResult | null> {
  const access = await getCoupleAccess(scope)
  if (!access) return null
  const { token, tokenHash } = newBearerToken()
  const renewed = await renewCoupleInvite(scope, invitationId, { tokenHash, expiresAt: ttl() })
  if (!renewed.ok) return null
  const email = renewed.value.email
  const sent = await send(access, input, email, token)
  return sent ? { email, ok: true } : { email, ok: false, reason: 'mailFailed' }
}

async function send(
  access: { readonly localeDefault: string; readonly coupleDisplayName: string },
  input: { readonly inviter: string; readonly studio: string },
  to: string,
  token: string,
): Promise<boolean> {
  const sent = await sendCoupleInviteMail({
    to,
    token,
    locale: access.localeDefault,
    inviter: input.inviter,
    studio: input.studio,
    couple: access.coupleDisplayName,
  }).catch(() => null)
  return sent?.ok === true
}
