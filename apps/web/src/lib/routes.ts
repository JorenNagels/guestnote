import { DEFAULT_LOCALE, type Locale } from './locales.ts'

/**
 * Href builders. The substitute for `typedRoutes`, which is off in `next.config.ts`.
 *
 * The dashboard is served from `app.guestnote.be` and rewritten by `proxy.ts` to
 * `/pro/*`, so its public paths (`/weddings`) are not routes in the file tree. Typed
 * routes would reject every `<Link>` on the surface that has all of them, and writing
 * the internal path instead would put `/pro` in the user's URL bar.
 *
 * So the compiler cannot help here, and this module is the compensation: one place to
 * grep when a path changes, and no bare string literals scattered through components.
 *
 * The rule these functions encode: **a href is always the path the browser shows**,
 * never the internal rewrite target.
 */

/** Dashboard paths. No `/pro`, and no locale prefix -- both are invisible to the user. */
export const app = {
  home: () => '/',
  weddings: () => '/weddings',
  wedding: (weddingId: string) => `/weddings/${weddingId}`,
  weddingTasks: (weddingId: string) => `/weddings/${weddingId}/tasks`,
  login: () => '/login',
  /**
   * Where a lapsed session sends the planner. The reason is a query rather than a
   * separate route because it is the same screen -- a second route would be a second
   * place for the sign-in flow to drift.
   */
  loginAfterExpiry: () => '/login?reason=session-expired',
  /**
   * Invitation acceptance. The token is the whole credential, so it is a path segment
   * and never a query: query strings turn up in referrers, in server logs and in
   * analytics, and a path segment at least stays out of the `Referer` header on
   * cross-origin navigation.
   */
  invite: (token: string) => `/invite/${encodeURIComponent(token)}`,
} as const

/** Marketing paths. The locale IS part of the URL here, always. */
export const marketing = {
  home: (locale: Locale = DEFAULT_LOCALE) => `/${locale}`,
  pricing: (locale: Locale = DEFAULT_LOCALE) => `/${locale}/prijzen`,
} as const

/**
 * Guest-site paths, relative to the tenant's own subdomain. PH4.
 *
 * Note there is no tenant segment: on `els-en-jan.guestnote.be` the story page is
 * `/story`, and the `/sites/els-en-jan` prefix exists only inside the router.
 */
export const guestSite = {
  home: () => '/',
  rsvp: () => '/rsvp',
} as const
