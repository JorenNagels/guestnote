/**
 * Spec 0003, slice S10. The vendor link's lifetimes; the credential itself is
 * `bearer-token.ts`, shared with `invite-token.ts`.
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
