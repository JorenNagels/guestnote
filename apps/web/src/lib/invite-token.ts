/**
 * Seven days: long enough to survive a weekend and a holiday, short enough to be a decision.
 * The credential itself is `bearer-token.ts`.
 */
export const INVITE_TTL_DAYS = 7

/**
 * Thirty days for a couple (spec 0008): they read the mail a week later, between a venue visit
 * and a tasting, and a resend (a new token, the old one dead) renews it. Rejected: seven like
 * staff, too short for someone who logs in six times a year; the wedding date, which leaves a
 * stale token alive for a year.
 */
export const COUPLE_INVITE_TTL_DAYS = 30
