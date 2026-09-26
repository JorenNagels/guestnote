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
   * Cross-wedding Today (spec 0003, S8), which IS the root now: `/` used to redirect to
   * `weddings()`, and the F3 `/today` stub is gone. Still its own builder and not `home()`,
   * so the sidebar reads what it means and a later move of the screen is one line here.
   * Rejected: keeping `/today` as a second address for the same page -- two URLs for one
   * screen splits the sidebar's active state, and nothing had linked to it yet.
   */
  today: () => '/',
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
  /** Spec 0005: the studio's logo and name. Owner and admin; a 404 for anyone else. */
  studio: () => '/studio',
  login: () => '/login',
  /**
   * Self-serve sign-up (spec 0005). One route for every step: the page derives which step to
   * show from the session and the database (`lib/signup-step.ts`), so the only state in the
   * URL is what the database cannot tell -- that the planner chose to skip the invitations, or
   * which of the optional steps after the studio they are on.
   */
  signup: () => '/signup',
  signupOwnStudio: () => '/signup?own=1',
  signupStep: (step: 'wedding' | 'team' | 'ready') => `/signup?step=${step}`,
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
  /**
   * The vendor's own signed link (spec 0003, S10). Same reasoning as `invite`: the token is
   * the whole credential, so it is a path segment, never a query string.
   */
  vendorLink: (token: string) => `/vendor/${encodeURIComponent(token)}`,
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
