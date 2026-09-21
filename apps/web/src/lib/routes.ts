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
  /**
   * Cross-wedding "due this week" (spec 0003, S8). Its own path for now because `/` still
   * redirects to `weddings()`, and a nav item pointing at `/` would bounce to the list.
   * When S8 retires the redirect it decides whether this stays or becomes `home()`; the
   * nav reads this function either way, so that is a one-line change here.
   */
  today: () => '/today',
  weddings: () => '/weddings',
  /**
   * A static segment beside `[id]`, which is why it needs no reservation: Next matches a
   * static segment before a dynamic one, so `/weddings/new` never reaches `[id]`. The cost
   * is that a wedding whose id is the string `new` is unreachable -- ids are UUIDv7
   * (invariant 9), so none exists.
   */
  weddingNew: () => '/weddings/new',
  wedding: (weddingId: string) => `/weddings/${weddingId}`,
  weddingSettings: (weddingId: string) => `/weddings/${weddingId}/settings`,
  // `tasks` and not `checklist`: the path predates the screen name and the route already
  // existed in this file. The nav label is what the planner reads; the path they rarely do.
  weddingTasks: (weddingId: string) => `/weddings/${weddingId}/tasks`,
  weddingTask: (weddingId: string, taskId: string) => `/weddings/${weddingId}/tasks/${taskId}`,
  weddingBudget: (weddingId: string) => `/weddings/${weddingId}/budget`,
  weddingPayments: (weddingId: string) => `/weddings/${weddingId}/payments`,
  weddingVendors: (weddingId: string) => `/weddings/${weddingId}/vendors`,
  weddingRunSheet: (weddingId: string) => `/weddings/${weddingId}/run-sheet`,
  weddingFiles: (weddingId: string) => `/weddings/${weddingId}/files`,
  weddingMoodboard: (weddingId: string) => `/weddings/${weddingId}/moodboard`,
  /** The org-level directory. `weddingVendors` is the per-wedding view of the same people. */
  vendors: () => '/vendors',
  templates: () => '/templates',
  template: (templateId: string) => `/templates/${templateId}`,
  team: () => '/team',
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
