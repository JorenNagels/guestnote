/**
 * The dashboard's preference cookies: what they are called, and what a bad value means.
 *
 * Import-free on purpose, exactly like `lib/locales.ts` next door. Root layout B reads
 * these before anything else runs, a Server Function writes them, and a unit test asserts
 * the parsers -- three callers in three different execution contexts, so the module they
 * share cannot drag next-intl or the database in behind it.
 *
 * ## Why cookies and not a `users` column
 *
 * `lib/locales.ts` and `app/pro/layout.tsx` both used to promise that "at M3 this reads
 * the user row instead". M3 is this feature and the promise is not being kept, so both
 * comments have been corrected rather than left standing.
 *
 * The reason is where the read happens. Three of these decide `<html lang>`, `class` and
 * `data-density`, so they are needed in ROOT LAYOUT B -- before the session, before
 * memberships, before anything is rendered. (`gn_nav` is the fourth and is read one layer
 * down, in `(app)/layout.tsx`, because only the sidebar cares.) A cookie costs nothing there. A user row costs
 * a database round trip in front of every single dashboard render, on the critical path of
 * every navigation, to personalise chrome. That trade was invisible when the promise was
 * written and obvious once the layout existed.
 *
 * What it costs, stated: preferences do not follow a planner to a second device. A
 * `user_preferences` table is the right long-term shape and
 * `docs/specs/0001-moving-around-the-dashboard.md` records it as deferred with its reason,
 * not forgotten.
 *
 * ## The rule every parser here follows
 *
 * **The value you get by forgetting must be the safe one** -- CLAUDE.md invariant 6. These
 * are all attacker-writable: a cookie is client state, so every one of them is validated
 * against a closed set on read and falls back to the default on anything unrecognised.
 * None of them is a permission; `gn_org` is the closest and it is still only a *display*
 * choice, re-derived through `principalForOrg` on every request. See `lib/principal.ts`.
 */

/** Light or dark. Dark is a `.dark` CLASS, never `prefers-color-scheme` -- tokens.css:21. */
export const THEMES = ['light', 'dark'] as const
export type Theme = (typeof THEMES)[number]

/**
 * Row height and control padding, switched together.
 *
 * `comfortable` is the default because a planner meeting a couple reads this on a laptop,
 * not because it is the more common need later: a 300-guest list is unusable at comfortable
 * spacing, and `design-system/tokens.css:100` exists for that. Defaulting to `compact`
 * would optimise the screen nobody has built yet at the cost of the one they have.
 */
export const DENSITIES = ['comfortable', 'compact'] as const
export type Density = (typeof DENSITIES)[number]

/** Sidebar width. `expanded` is the default -- a collapsed nav teaches nobody the product. */
export const NAV_STATES = ['expanded', 'collapsed'] as const
export type NavState = (typeof NAV_STATES)[number]

export const THEME_COOKIE = 'gn_theme'
export const DENSITY_COOKIE = 'gn_density'
export const NAV_COOKIE = 'gn_nav'

/**
 * The organisation the dashboard is currently ACTING IN, as chosen by the switcher.
 *
 * Not validated here, because this module cannot: the only thing that makes a value legal
 * is an `org_members` row, which is a database read. `lib/principal.ts` checks it against
 * the resolved memberships and silently falls back to `landingOrgId` when it is absent,
 * stale, or names an org the user has been removed from. Being removed from an org is not
 * the planner's mistake to be told about.
 *
 * Deliberately NOT `__Host-` prefixed, unlike the session cookie. `__Host-` forbids a
 * `Domain` attribute, which is right for a credential and wrong here: this is a display
 * preference, and pinning it to one host would silently reset the choice on any future
 * surface served from a sibling subdomain.
 */
export const ORG_COOKIE = 'gn_org'

const oneOf = <T extends string>(allowed: readonly T[], fallback: T) => {
  return (value: string | undefined): T =>
    value !== undefined && (allowed as readonly string[]).includes(value) ? (value as T) : fallback
}

export const parseTheme = oneOf(THEMES, 'light')
export const parseDensity = oneOf(DENSITIES, 'comfortable')
export const parseNavState = oneOf(NAV_STATES, 'expanded')

/**
 * What every preference cookie is written with.
 *
 * `httpOnly: false` on purpose and it is the one choice here worth arguing. These are read
 * by the server on every render, so the server does not need script access -- but a future
 * pre-paint theme script would, and more importantly marking a non-secret preference
 * `httpOnly` implies to the next reader that it carries something worth protecting. It does
 * not. The session cookie is where that argument belongs, and Better Auth owns it.
 *
 * `sameSite: 'lax'` rather than `strict`: the dashboard is reached by following a link from
 * the marketing apex (`app-entry-link.tsx`), and `strict` would drop the cookie on exactly
 * that navigation, so a planner's theme would flicker back to default on arrival.
 *
 * `secure: true` unconditionally, with no `NODE_ENV` branch -- and it is free rather than
 * merely correct. Every `*.localhost` name is a *potentially trustworthy origin* (RFC 6761
 * plus the secure-context rules), which is the same property `env.ts` already leans on to
 * explain why `__Host-` prefixed session cookies work over plain http in development. So
 * `npm run dev` keeps these, and a third reader of `NODE_ENV` -- which invariant 6 caps at
 * two, both dev-only refusals -- is not needed.
 *
 * The cost, named: serving the app over plain http on a host that is NOT localhost (a bare
 * IP in a container, say) silently drops every preference. That is a shape nothing here
 * uses, and a shape the session cookie would already have broken first.
 *
 * A year, because the alternative to remembering is guessing.
 */
export const PREF_COOKIE_OPTIONS = {
  path: '/',
  sameSite: 'lax',
  httpOnly: false,
  secure: true,
  maxAge: 60 * 60 * 24 * 365,
} as const
