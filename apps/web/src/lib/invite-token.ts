import 'server-only'
import { createHash, randomBytes } from 'node:crypto'

/** Seven days: long enough to survive a weekend and a holiday, short enough to be a decision. */
export const INVITE_TTL_DAYS = 7

/**
 * A fresh invitation credential. The token goes in the email and nowhere else; only its hash
 * is stored, so a read of `invitations` (a backup, a log, a stray SELECT) yields no usable link.
 *
 * 32 random bytes is 256 bits, so the hash needs no salt and no slow function: there is no
 * low-entropy secret to brute-force. Lower-case hex SHA-256 is the format the future
 * `resolve_invitation` SQL function will compute with `encode(sha256(convert_to(t, 'UTF8')), 'hex')`,
 * so the two sides cannot disagree about case (see `team/SPEC.md`, "Blocked").
 */
export function newInviteToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('base64url')
  return { token, tokenHash: hashInviteToken(token) }
}

export function hashInviteToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}
