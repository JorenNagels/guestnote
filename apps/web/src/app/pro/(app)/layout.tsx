import { listWeddings, type WeddingSummary } from '@guestnote/db'
import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import type { ReactNode } from 'react'
import { Shell, type ShellWedding } from '../../../components/nav/shell.tsx'
import { apexOrigin } from '../../../lib/app-url.ts'
import { getAuth } from '../../../lib/auth.ts'
import { billingMode } from '../../../lib/billing-mode.ts'
import { getDb } from '../../../lib/db.ts'
import { DEFAULT_LOCALE, isLocale } from '../../../lib/locales.ts'
import { feedbackAvailable } from '../../../lib/observability.ts'
import {
  DENSITY_COOKIE,
  NAV_COOKIE,
  parseDensity,
  parseNavState,
  parseTheme,
  THEME_COOKIE,
} from '../../../lib/prefs.ts'
import { currentMemberships, currentOrgId, currentOrgs } from '../../../lib/principal.ts'
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
  const requestHeaders = await headers()
  const session = await getAuth().getSession(requestHeaders)
  if (!session) redirect(app.loginAfterExpiry())

  const [orgId, orgs, memberships, store, locale, t, shellT, authT, bannerT, reportT, hasPasskey] =
    await Promise.all([
      currentOrgId(),
      currentOrgs(),
      currentMemberships(),
      cookies(),
      getLocale(),
      getTranslations('app'),
      getTranslations('app.shell'),
      getTranslations('auth'),
      getTranslations('app.banners'),
      getTranslations('app.report'),
      /**
       * Whether this user already holds a passkey -- the half of the enrollment offer's gate
       * that only the server can answer, and the one rung 2 of sign-in could never ask.
       *
       * In the `Promise.all` and not behind an `if (welcome)`: a layout cannot read search
       * params at all (Next gives them to pages only), so the marker that decides whether the
       * prompt is *shown* is read client-side in `enrollment-prompt.tsx`. The cost is one
       * extra query per dashboard render, paid by everyone who has no passkey yet and
       * disappearing for good the moment they enrol -- and it is concurrent with four reads
       * already happening, so it adds a round trip's latency to none of them.
       *
       * Rejected: `beginPasskeyEnrollment` failing loudly instead. Every passkey failure on
       * this path renders as nothing, by design, so "offer it and find out" means offering
       * something that silently does nothing to the people who least need it.
       */
      getAuth().hasPasskey(requestHeaders),
    ])

  const current = orgs.find((o) => o.id === orgId)
  if (!orgId || !current) return children

  // After the no-org return, and not in the `Promise.all` above: it needs `orgId`, and a
  // planner with no org has nothing to list. `listWeddings` derives its own principal from
  // `memberships` and scopes through RLS, so this is not a place the layout decides anything --
  // an org the user has no standing in returns `[]`, indistinguishable from an empty one.
  // `.raw`, not a formatted read: these four are templates with a `{days}` the browser fills
  // in per row, and formatting them here throws FORMATTING_ERROR for the missing variable.
  // Found in the browser, not by a test -- the component tests hand the labels in as props, so
  // nothing there can see how the layout produces them.
  const raw = (key: string) => String(shellT.raw(key))

  const weddings = memberships ? await listWeddings(getDb(), memberships, orgId) : []

  return (
    <Shell
      org={current}
      orgs={orgs}
      weddings={weddings.map(toShellWedding)}
      user={{ name: session.name, email: session.email }}
      offerPasskey={getAuth().passkeysAvailable() && !hasPasskey}
      productHref={apexOrigin()}
      initialNav={parseNavState(store.get(NAV_COOKIE)?.value)}
      // Narrowed through `isLocale`, not cast. `getLocale()` is typed `string`, and
      // next-intl can only ever return a configured locale -- but `as Locale` was a bare
      // assertion in a repo where `any` and non-null assertions are lint errors, so it read
      // as an oversight. This costs one comparison and the reader nothing.
      locale={isLocale(locale) ? locale : DEFAULT_LOCALE}
      theme={parseTheme(store.get(THEME_COOKIE)?.value)}
      density={parseDensity(store.get(DENSITY_COOKIE)?.value)}
      // Spec 0005: while billing is off the product is a demo and says so on every page. The
      // trial banner will take this slot once billing is on ("Trial banner"); until it is
      // built, billing on shows no banner at all.
      banner={billingMode().on ? null : 'demo'}
      canReport={feedbackAvailable()}
      labels={{
        nav: t('nav.label'),
        weddings: t('weddings.title'),
        today: shellT('nav.today'),
        templates: shellT('nav.templates'),
        vendors: shellT('nav.vendors'),
        team: shellT('nav.team'),
        weddingsSection: shellT('nav.weddingsSection'),
        newWedding: shellT('nav.newWedding'),
        wedding: {
          overview: t('nav.overview'),
          checklist: shellT('nav.checklist'),
          budget: shellT('nav.budget'),
          payments: shellT('nav.payments'),
          vendors: shellT('nav.vendors'),
          runSheet: shellT('nav.runSheet'),
          files: shellT('nav.files'),
          moodboard: shellT('nav.moodboard'),
        },
        row: {
          noDate: shellT('nav.noDate'),
          archived: t('weddings.status.archived'),
          today: shellT('countdown.today'),
          untilOne: raw('countdown.untilOne'),
          untilOther: raw('countdown.untilOther'),
          sinceOne: raw('countdown.sinceOne'),
          sinceOther: raw('countdown.sinceOther'),
        },
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
          report: reportT('menu'),
          signOut: t('signOut'),
        },
        // Reused verbatim from the sign-in surface rather than duplicated under `app.*`:
        // it is the same offer in the same words, and the copy correction that widened it
        // beyond "face or fingerprint" should never have to be made twice.
        enroll: {
          title: authT('enroll.title'),
          body: authT('enroll.body'),
          confirm: authT('enroll.confirm'),
          dismiss: authT('enroll.dismiss'),
          busy: authT('busy.enrolling'),
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
        poweredBy: shellT('footer.poweredBy'),
        demoBanner: {
          pill: bannerT('demo.pill'),
          body: bannerT('demo.body'),
          ask: bannerT('demo.ask'),
          action: bannerT('demo.action'),
        },
        report: {
          title: reportT('title'),
          close: reportT('close'),
          category: reportT('category'),
          categories: {
            bug: reportT('categories.bug'),
            idea: reportT('categories.idea'),
            question: reportT('categories.question'),
          },
          message: reportT('message'),
          screenshot: reportT('screenshot'),
          chooseScreenshot: reportT('chooseScreenshot'),
          screenshotAdded: reportT('screenshotAdded'),
          removeScreenshot: reportT('removeScreenshot'),
          send: reportT('send'),
          sending: reportT('sending'),
          sent: reportT('sent'),
          errors: {
            forbidden: reportT('errors.forbidden'),
            empty: reportT('errors.empty'),
            tooLong: reportT('errors.tooLong'),
            badScreenshot: reportT('errors.badScreenshot'),
            tooLarge: reportT('errors.tooLarge'),
            rateLimited: reportT('errors.rateLimited'),
            unavailable: reportT('errors.unavailable'),
          },
        },
      }}
    >
      {children}
    </Shell>
  )
}

/**
 * The summary the repo returns, narrowed to what the sidebar draws.
 *
 * `color` is read defensively because `weddings.color` arrives with F1's migration and the
 * repo's `WeddingSummary` grows the field with it. `'color' in w` is true from that day on and
 * false before, so this compiles and behaves correctly on both sides of it -- and the sidebar
 * shows a neutral dot until then rather than needing a second change here. Whatever string
 * arrives is validated as a hex again where it is used (`wedding-row.tsx`).
 */
function toShellWedding(w: WeddingSummary): ShellWedding {
  return {
    id: w.id,
    name: w.coupleDisplayName,
    date: w.weddingDate,
    status: w.status,
    color: 'color' in w && typeof w.color === 'string' ? w.color : null,
  }
}
