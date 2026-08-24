import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import type { ReactNode } from 'react'
import { Shell } from '../../../components/nav/shell.tsx'
import { getAuth } from '../../../lib/auth.ts'
import { DEFAULT_LOCALE, isLocale } from '../../../lib/locales.ts'
import {
  DENSITY_COOKIE,
  NAV_COOKIE,
  parseDensity,
  parseNavState,
  parseTheme,
  THEME_COOKIE,
} from '../../../lib/prefs.ts'
import { currentOrgId, currentOrgs } from '../../../lib/principal.ts'
import { app } from '../../../lib/routes.ts'

/**
 * The authenticated branch of root layout B, and now the shell itself. Its sibling
 * `(public)` holds sign-in.
 *
 * Route groups add no URL segment, so this guards `/` on `app.guestnote.be` without
 * appearing in the path. Everything below it can assume a session exists.
 *
 * ## Why the redirect lives here and not in proxy.ts
 *
 * proxy.ts says it deliberately does NOT do "redirect to /login when the cookie is
 * missing": an expired-but-present cookie still reaches the layout, so this check has to
 * exist regardless, and a copy in the proxy would add a second place to be wrong while
 * removing nothing.
 *
 * ## Still not authorization
 *
 * `getSession()` answers "who are you". research/07 section 3 is emphatic that "who may do
 * what" resolves from `org_members` and `wedding_members` joined against the wedding in the
 * URL -- never from the session, and never from `app.org_id`. Nothing here reads a role or
 * decides anything from one. `currentOrgId()` picks which org to DISPLAY; every query below
 * re-derives its principal.
 *
 * ## The shell is rendered only when there is an organisation
 *
 * A signed-in user with no memberships is a real reachable state, not an error: the
 * email-OTP plugin creates the account on first verification, so anyone who can receive
 * mail can reach a session, and until somebody invites them they are staff nowhere. They
 * get the page alone -- an org head with no org above a nav with no links is chrome whose
 * only content is the news that there is nothing here. `docs/specs/0001` names the two
 * rejected alternatives.
 */
export default async function AppShellLayout({ children }: { children: ReactNode }) {
  const session = await getAuth().getSession(await headers())
  if (!session) redirect(app.loginAfterExpiry())

  const [orgId, orgs, store, locale, t] = await Promise.all([
    currentOrgId(),
    currentOrgs(),
    cookies(),
    getLocale(),
    getTranslations('app'),
  ])

  const current = orgs.find((o) => o.id === orgId)
  if (!orgId || !current) return children

  return (
    <Shell
      org={current}
      orgs={orgs}
      user={{ name: session.name, email: session.email }}
      initialNav={parseNavState(store.get(NAV_COOKIE)?.value)}
      // Narrowed through `isLocale`, not cast. `getLocale()` is typed `string`, and
      // next-intl can only ever return a configured locale -- but `as Locale` was a bare
      // assertion in a repo where `any` and non-null assertions are lint errors, so it read
      // as an oversight. This costs one comparison and the reader nothing.
      locale={isLocale(locale) ? locale : DEFAULT_LOCALE}
      theme={parseTheme(store.get(THEME_COOKIE)?.value)}
      density={parseDensity(store.get(DENSITY_COOKIE)?.value)}
      labels={{
        nav: t('nav.label'),
        weddings: t('weddings.title'),
        overview: t('nav.overview'),
        weddingSection: t('nav.weddingSection'),
        collapse: t('nav.collapse'),
        expand: t('nav.expand'),
        openMenu: t('nav.openMenu'),
        closeMenu: t('nav.closeMenu'),
        org: { switch: t('org.switch'), current: t('org.label') },
        account: {
          account: t('account.label'),
          language: t('account.language'),
          theme: t('account.theme'),
          themeLight: t('account.themeLight'),
          themeDark: t('account.themeDark'),
          density: t('account.density'),
          densityComfortable: t('account.densityComfortable'),
          densityCompact: t('account.densityCompact'),
          signOut: t('signOut'),
        },
        palette: {
          open: t('nav.search'),
          title: t('palette.title'),
          placeholder: t('palette.placeholder'),
          weddings: t('weddings.title'),
          empty: t('palette.empty'),
          loading: t('palette.loading'),
          dateUnknown: t('weddings.dateUnknown'),
        },
      }}
    >
      {children}
    </Shell>
  )
}
