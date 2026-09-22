import 'server-only'
import { createHash, randomBytes } from 'node:crypto'

/**
 * Spec 0003, slice S10. The vendor-link twin of `invite-token.ts`: same shape, same reasoning
 * (256 bits needs no salt and no slow hash), different table.
 *
 * 30 days, not 7: an invite is spent within a day or two by someone checking their own inbox,
 * and a vendor link is handed to a caterer who may not open it until the week of the wedding.
 * Configurable per link at issue time (`createVendorLinkAction`'s `ttlDays`); this is only the
 * default the form pre-fills.
 */
export const DEFAULT_VENDOR_LINK_TTL_DAYS = 30

/** The longest a planner may set expiry to. A signed link with no account behind it that can
 *  never expire is a bearer credential with no owner to notice it going stale. */
export const MAX_VENDOR_LINK_TTL_DAYS = 180

export function newVendorLinkToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('base64url')
  return { token, tokenHash: hashVendorLinkToken(token) }
}

export function hashVendorLinkToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}
