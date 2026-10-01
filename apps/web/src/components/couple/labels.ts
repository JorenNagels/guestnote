import type { InviteCardCopy } from './invite-card.tsx'

type T = {
  (key: string, values?: Record<string, string | number>): string
  raw(key: string): unknown
}

/**
 * The invite card's copy, from `app.couple.planner`. Shared by the overview and wedding settings,
 * which both draw the card (spec 0008). Templates the card fills itself (`{email}`, `{date}`) are
 * read `.raw`: formatting them here would throw for the missing value.
 */
export function inviteCardCopy(ct: T, sharedTasks: number): InviteCardCopy {
  const raw = (key: string) => String(ct.raw(key))
  return {
    title: ct('cardTitle'),
    body: ct('cardBody'),
    partner1: ct('partner1'),
    partner2: ct('partner2'),
    sharedCount: ct('sharedCount', { n: sharedTasks }),
    send: ct('send'),
    sending: ct('sending'),
    sent: ct('sent'),
    resend: ct('resend'),
    invitedOn: raw('invitedOn'),
    expired: ct('expired'),
    mailFailed: ct('mailFailed'),
    errEmail: ct('errEmail'),
    errSame: ct('errSame'),
    errStaff: raw('errStaff'),
    errExists: raw('errExists'),
    errPartner: raw('errPartner'),
    errForbidden: ct('errForbidden'),
    errFull: ct('errFull'),
    errGeneric: ct('errGeneric'),
  }
}

/** The comment thread's copy, from `app.couple.portal` and the chip from `.planner`. */
export function threadCopy(
  pt: (key: string) => string,
  ct: (key: string) => string,
): import('./comment-thread.tsx').ThreadCopy {
  return {
    empty: pt('noComments'),
    placeholder: pt('commentPlaceholder'),
    send: pt('commentSend'),
    sending: ct('sending'),
    remove: pt('commentDelete'),
    failed: pt('commentFailed'),
    tooLong: pt('commentTooLong'),
    couple: ct('chip'),
  }
}

/** The comment link's three forms (spec 0008): none yet, one, and `{n}` left for the client. */
export function commentCounts(pt: { raw(key: string): unknown; (key: string): string }) {
  return {
    none: pt('commentsNone'),
    one: pt('commentsOne'),
    other: String(pt.raw('commentsOther')),
  }
}
