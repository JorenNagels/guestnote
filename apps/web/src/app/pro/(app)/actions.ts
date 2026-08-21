'use server'

import { revalidatePath } from 'next/cache'
import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getAuth } from '../../../lib/auth.ts'
import {
  DENSITY_COOKIE,
  type Density,
  NAV_COOKIE,
  type NavState,
  ORG_COOKIE,
  PREF_COOKIE_OPTIONS,
  parseDensity,
  parseNavState,
  parseTheme,
  THEME_COOKIE,
  type Theme,
} from '../../../lib/prefs.ts'
import { currentMemberships } from '../../../lib/principal.ts'
import { app } from '../../../lib/routes.ts'

/**
 * ## These are NOT guarded by `(app)/layout.tsx`
 *
 * Worth stating because the file lives inside that route group and it looks like it should
 * be. CLAUDE.md invariant 7 gives the reason: **a Server Function is a POST to its own
 * route**, so the layout's `getSession()` redirect never runs for one. Anybody who can
 * reach the origin can invoke all four.
 *
 * That is acceptable here, and only because of what they do. The three preference writers
 * touch nothing but the CALLER's own cookies -- there is no id, no row and no other user
 * reachable through them, so an unauthenticated POST achieves exactly what clearing your
 * own browser storage achieves. `switchOrg` is the one that needs a principal, and it
 * resolves memberships itself rather than trusting the layout to have done it.
 *
 * The rule that follows for anything added to this file: it does its own authorization, or
 * it does not belong here. Do not read the route group as a guard.
 *
 * Note what is NOT here: `setLocale`. One already exists at
 * `src/components/auth/actions.ts`, written for the sign-in screen's language switcher and
 * tested there, and it writes the same `NEXT_LOCALE` cookie this surface reads. A second
 * copy would be a second place for the cookie's options to drift.
 */

/**
 * Ends the session and returns to sign-in.
 *
 * A Server Action rather than a link to Better Auth's own endpoint, so the cookie is
 * cleared on this response and the redirect happens in the same round trip -- one
 * navigation instead of two, and no window where the page has rendered as signed-out
 * while the cookie is still live.
 */
export async function signOut(): Promise<never> {
  await getAuth().signOut(await headers())
  redirect(app.login())
}

/**
 * `/pro`, and NOT `/`. This is a trap with a rewrite in front of it.
 *
 * `revalidatePath` operates on the route FILE STRUCTURE, not on the URL the planner sees.
 * Next's reference is explicit: with rewrites "you must pass the destination path (the
 * actual route file location), not the source path that appears in the browser's address
 * bar", because "cache entries are tagged based on which route file renders them".
 * `proxy.ts` rewrites `app.guestnote.be/weddings` to `/pro/weddings` -- so the destination
 * is `/pro` and `/` is the source.
 *
 * Written as `'/'` first, and it is wrong in the quietest available way: it invalidates the
 * MARKETING tree, returns without complaint, and a theme toggle then does nothing until a
 * full page load. `lib/routes.ts` states the opposite rule for hrefs -- "a href is always
 * the path the browser shows" -- and this is the one API in the app where that is inverted,
 * which is exactly why it is a named constant and not a literal at four call sites.
 *
 * `'layout'` rather than `'page'`: theme, density and nav width all live on `<html>` in
 * root layout B, and a root layout is not re-rendered by a client-side navigation, so the
 * page type would leave the chrome stale on the transitions this exists to fix.
 */
const DASHBOARD_TREE = '/pro'

/**
 * The switcher's write. **Validates membership before it trusts the id.**
 *
 * The org id arrives from the client, so it is an assertion about what the user wants and
 * not a fact about what they may have. `currentMemberships()` is the fact. An id that is
 * not in it is dropped rather than rejected: there is nothing to tell the planner, because
 * the only ways to get here are a hand-edited cookie -- which grants nothing, the value
 * being a display choice re-derived through `principalForOrg` on every query -- and having
 * been removed from an org, which is not their mistake and not news they should first hear
 * from an error screen. `lib/principal.ts` re-checks it on read regardless, so this
 * function being wrong would be a bug and not a breach.
 *
 * `DASHBOARD_TREE` and not a narrower path: the org decides what the whole shell renders --
 * the head, the switcher's checkmark, the wedding list underneath -- so the layout is the
 * thing that has gone stale, not the page.
 */
export async function switchOrg(orgId: string): Promise<void> {
  const memberships = await currentMemberships()
  if (!memberships?.orgs.some((o) => o.orgId === orgId)) return

  ;(await cookies()).set(ORG_COOKIE, orgId, PREF_COOKIE_OPTIONS)
  revalidatePath(DASHBOARD_TREE, 'layout')
}

/**
 * Theme, density and sidebar width.
 *
 * Three functions rather than one `setPref(key, value)`, and that is deliberate. A generic
 * writer takes the cookie NAME from the client, which turns a preference endpoint into a
 * write primitive for any cookie this app owns -- including, on a bad day, one Better Auth
 * owns. Naming them separately means the set of writable keys is the set of exported
 * functions, which is a thing you can read.
 *
 * Each parses through `lib/prefs.ts` before writing, so an unrecognised value is stored as
 * the default rather than stored as itself and coerced on every subsequent read. The
 * cookie can then never hold a value the layout has to defend against.
 *
 * The parameters are typed as the unions rather than as `string`, and the `parse*` call
 * stays anyway. Both are load-bearing and they guard different things. The type catches the
 * caller-side mistake -- `setNavCollapsed(String(collapsed))` sends `'true'`, which
 * normalises to `'expanded'`, so the sidebar silently never collapses and nothing errors
 * anywhere. The parse catches the wire-side one, because a Server Function is a POST and
 * its argument arrives as whatever the request body said, TypeScript having no presence
 * there at all.
 *
 * All three revalidate `DASHBOARD_TREE` because all three live on `<html>` in root layout B.
 */
export async function setTheme(value: Theme): Promise<void> {
  ;(await cookies()).set(THEME_COOKIE, parseTheme(value), PREF_COOKIE_OPTIONS)
  revalidatePath(DASHBOARD_TREE, 'layout')
}

export async function setDensity(value: Density): Promise<void> {
  ;(await cookies()).set(DENSITY_COOKIE, parseDensity(value), PREF_COOKIE_OPTIONS)
  revalidatePath(DASHBOARD_TREE, 'layout')
}

export async function setNavCollapsed(value: NavState): Promise<void> {
  ;(await cookies()).set(NAV_COOKIE, parseNavState(value), PREF_COOKIE_OPTIONS)
  revalidatePath(DASHBOARD_TREE, 'layout')
}
