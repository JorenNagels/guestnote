/**
 * NL, EN and FR from day one.
 *
 * This closes README.md's open question "Is French a launch requirement or a
 * Wallonia-expansion feature?" as: launch requirement. research/04-speclist.md already
 * calls per-guest NL/FR/EN "the best local moat available" -- Weddamo charges EUR 139
 * for a *second* language -- so it is a day-one property of the interface rather than
 * a V3 feature.
 *
 * Kept free of imports so `proxy.ts` can use it without pulling in next-intl.
 */
export const LOCALES = ['nl', 'en', 'fr'] as const

export type Locale = (typeof LOCALES)[number]

/**
 * Dutch, always -- never `Accept-Language` negotiation.
 *
 * coming-soon/ already settled this: browser sniffing "sends Belgian planners running
 * an English OS to the wrong language". The switcher is visible and its choice is
 * remembered in a cookie; the default is never guessed from the request.
 */
export const DEFAULT_LOCALE: Locale = 'nl'

/**
 * Where the dashboard's locale lives, since its URLs carry no language prefix.
 *
 * `NEXT_LOCALE` is next-intl's own convention, so a future switch to its middleware would
 * read the same cookie. At M3 this becomes a column on `users` and the cookie becomes the
 * pre-login fallback only.
 */
export const LOCALE_COOKIE = 'NEXT_LOCALE'

export function isLocale(value: string | undefined): value is Locale {
  return value !== undefined && (LOCALES as readonly string[]).includes(value)
}
