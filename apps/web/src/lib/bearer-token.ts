import 'server-only'
import { randomBytes } from 'node:crypto'
import { hashInviteToken } from '@guestnote/core/auth'

/**
 * A fresh bearer credential for a link sent to someone with no session: a staff invitation
 * (`invite-token.ts`) or a vendor link (`vendor-link-token.ts`). Those two files keep only
 * their TTLs; the credential itself is one decision, made here.
 *
 * The token goes in the URL and nowhere else; only its hash is stored, so a read of the table
 * (a backup, a log, a stray SELECT) yields no usable link.
 *
 * 32 random bytes is 256 bits, so the hash needs no salt and no slow function: there is no
 * low-entropy secret to brute-force. Lower-case hex SHA-256 is the format `resolve_invitation`
 * and `resolve_vendor_link` compare against, so the two sides cannot disagree about case.
 *
 * The hash is the auth seam's `hashInviteToken`, not a second `createHash` here: the invite
 * landing page hashes through the seam, so the hash stored at issue time must come from the
 * same function or the two could drift. Its name says "invite" because invitations were the
 * first user; a vendor link uses the identical encoding.
 */
export function newBearerToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('base64url')
  return { token, tokenHash: hashBearerToken(token) }
}

export function hashBearerToken(token: string): string {
  return hashInviteToken(token)
}
