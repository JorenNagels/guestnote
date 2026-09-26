'use client'

import { cx } from '@guestnote/ui/cx'
import { useParams, usePathname } from 'next/navigation'
import { type ReactNode, Suspense, useEffect, useRef, useState, useTransition } from 'react'
import { setNavCollapsed } from '../../app/pro/(app)/actions.ts'
import type { Locale } from '../../lib/locales.ts'
import type { Density, NavState, Theme } from '../../lib/prefs.ts'
import { app } from '../../lib/routes.ts'
import { type EnrollmentLabels, EnrollmentPrompt } from '../auth/enrollment-prompt.tsx'
import { DemoBanner } from '../banners/demo-banner.tsx'
import { ReportDialog, type ReportLabels } from '../report/report-dialog.tsx'
import { AccountMenu } from './account-menu.tsx'
import {
  BudgetIcon,
  ChecklistIcon,
  CloseIcon,
  CollapseIcon,
  FilesIcon,
  MenuIcon,
  MoodboardIcon,
  OverviewIcon,
  PaymentsIcon,
  PlusIcon,
  RunSheetIcon,
  StudioIcon,
  TeamIcon,
  TemplatesIcon,
  TodayIcon,
  VendorsIcon,
  WeddingsIcon,
} from './icons.tsx'
import { NavAction, NavItem } from './nav-item.tsx'
import { OrgHead, type OrgOption } from './org-head.tsx'
import { Palette, type PaletteLabels } from './palette.tsx'
import { type ShellWedding, WeddingRow, type WeddingRowLabels } from './wedding-row.tsx'

export type { ShellWedding } from './wedding-row.tsx'

export type ShellLabels = {
  nav: string
  /** The org-level list page, and the palette's group name. */
  weddings: string
  today: string
  templates: string
  vendors: string
  team: string
  /** Spec 0005's Studio page. Rendered only when `canManage`. */
  studio: string
  /** The heading over the wedding rows. Not `weddings`: two identical words a row apart. */
  weddingsSection: string
  newWedding: string
  wedding: {
    overview: string
    checklist: string
    budget: string
    payments: string
    vendors: string
    runSheet: string
    files: string
    moodboard: string
  }
  row: WeddingRowLabels
  collapse: string
  expand: string
  openMenu: string
  closeMenu: string
  org: { switch: string; current: string }
  account: Parameters<typeof AccountMenu>[0]['labels']
  palette: PaletteLabels
  enroll: EnrollmentLabels
  /** The words before the product name in the footer; the name itself is not translated. */
  poweredBy: string
  demoBanner: { pill: string; body: string; ask: string; action: string }
  report: ReportLabels
}

/**
 * The dashboard's chrome: a persistent left sidebar, a rail when collapsed, a drawer on a
 * phone.
 *
 * Client because three things here are interaction state -- collapsed, drawer open, and the
 * palette -- and because `usePathname` is the only way a layout can know where it is.
 *
 * Everything the shell can be GIVEN arrives as plain props from `(app)/layout.tsx`, which
 * stays a Server Component -- including, since spec 0003, the wedding list the sidebar shows.
 * One thing cannot be given and is fetched from here through a Server Function: the palette's
 * list, which is a second read of the same rows and is paid for only by a planner who presses
 * the chord. So the client bundle carries markup, event handlers and one POST call site --
 * and no database code, which is the half of the original claim that survived.
 *
 * ## The wedding list is in the layout, and that reverses a 2026-08-21 decision
 *
 * `docs/specs/0001` refused a count badge because listing weddings in the layout costs a
 * `member` one transaction per assigned wedding, and fetched the *current* wedding's name
 * through `weddingHeader` instead. Spec 0003 asks for a row per wedding, which needs the list
 * anyway, and given the list `weddingHeader` is a second round trip for a row already in hand
 * -- so it went. Cost accepted: the layout renders on a hard load and after any
 * `revalidatePath` of the dashboard tree, not on client navigation, and an owner or admin pays
 * one query for it. A `member` pays N, which is the same N the wedding list page already pays.
 * Unread counts stay refused: those are N more per wedding, per render.
 *
 * ## Collapse persists, and why the cookie is not the source of truth here
 *
 * `initialNav` comes from the `gn_nav` cookie, server-rendered, so the first paint is
 * already the right width -- no flash of a wide sidebar snapping narrow, which is the whole
 * reason it is a cookie rather than `localStorage`. After that the local state leads and the
 * cookie is written behind it in a transition. The alternative, re-reading the cookie on
 * every toggle, would make a same-host round trip visible in a control that should feel instant.
 *
 * ## The phone is a drawer, not a narrower rail
 *
 * A 56px rail on a 390px screen spends 14% of the width on navigation, and a rail's labels
 * live in tooltips, which do not exist on touch. So below `md` the sidebar leaves the flow
 * entirely and slides over the content. `inert` while it is open is what traps focus -- one
 * attribute rather than a keydown-cycling focus trap, and it also stops a screen reader
 * wandering into the page behind the drawer.
 *
 * **It goes on the column, not on `<main>`.** It was on `<main>` first, which trapped
 * everything except the one control the drawer is covering: the phone header holding the
 * menu button is a SIBLING of `<main>`, so it stayed tabbable and in the accessibility tree
 * -- you could Tab out of the drawer straight onto the button underneath it. The desktop
 * `<aside>` is safe only incidentally, because `hidden` makes it `display:none`.
 */
export function Shell({
  org,
  orgs,
  weddings,
  user,
  offerPasskey,
  productHref,
  initialNav,
  locale,
  theme,
  density,
  banner,
  canReport,
  canManage,
  labels,
  children,
}: {
  org: OrgOption
  orgs: OrgOption[]
  /** Every wedding this user may see in `org`, soonest first. Resolved by the layout. */
  weddings: ShellWedding[]
  user: { name: string | null; email: string }
  /**
   * Whether this user could still be offered a passkey: the deployment can verify one and
   * they hold none yet. Resolved on the server because only the server can ask the second
   * half -- see `enrollment-prompt.tsx`, which owns the other two gates.
   */
  offerPasskey: boolean
  /** The apex origin, for the footer's product link. Resolved on the server from `env.ts`. */
  productHref: string
  initialNav: NavState
  locale: Locale
  theme: Theme
  density: Density
  /**
   * The one strip above the page (spec 0005): `demo` while billing is off. One slot, not a
   * stack -- at most one banner shows, and the layout decides which.
   */
  banner: 'demo' | null
  /** Whether "Report a problem" has an inbox to send to. False without a Sentry DSN. */
  canReport: boolean
  /**
   * Owner or admin of `org`: computed by the layout with `principalForOrg`. It decides whether
   * the Studio item is drawn, and nothing else -- the page 404s a member and its Server
   * Functions refuse one on their own, so a wrong value here shows a link, never grants a write.
   */
  canManage: boolean
  labels: ShellLabels
  children: ReactNode
}) {
  const [nav, setNav] = useState<NavState>(initialNav)
  // Here and not in the menu: the banner's "Report it" and the account menu's row open the
  // same dialog, and the menu unmounts its panel on close.
  const [reporting, setReporting] = useState(false)
  const openReport = canReport ? () => setReporting(true) : undefined
  const [drawer, setDrawer] = useState(false)
  const [, startTransition] = useTransition()
  const pathname = usePathname()
  const params = useParams<{ id?: string }>()
  const menuButtonRef = useRef<HTMLButtonElement>(null)

  const collapsed = nav === 'collapsed'
  // `useParams` and not a pathname regex: the router already parsed the segment, and a regex
  // here would have to be kept in step with `lib/routes.ts` by hand. It is `undefined` on
  // `/weddings/new`, a static segment, which is what stops the new-wedding form reading as
  // "inside a wedding".
  const weddingId = typeof params?.id === 'string' ? params.id : null

  // Close the drawer on navigation -- without this it stays open over the page you just
  // asked for, which reads as the tap not having worked.
  //
  // Derived during render rather than in an effect keyed on `pathname`. The effect version
  // works but lint is right that it never READS the pathname, only fires on it; React's own
  // guidance for "adjust state when a value changes" is this shape, and it closes the drawer
  // in the same commit as the navigation instead of one paint later.
  const [seenPath, setSeenPath] = useState(pathname)
  if (seenPath !== pathname) {
    setSeenPath(pathname)
    setDrawer(false)
  }

  useEffect(() => {
    if (!drawer) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDrawer(false)
        menuButtonRef.current?.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [drawer])

  const toggleCollapse = () => {
    const next: NavState = collapsed ? 'expanded' : 'collapsed'
    setNav(next)
    startTransition(() => {
      void setNavCollapsed(next)
    })
  }

  // Live weddings first, archived last, each group keeping the repo's soonest-date order.
  // `Array.prototype.sort` is stable, so returning 0 within a group is what keeps that order; a
  // year-old archived wedding is otherwise the first row of every planner's sidebar, above the
  // one happening this weekend.
  const ordered = [...weddings].sort(
    (a, b) => Number(a.status === 'archived') - Number(b.status === 'archived'),
  )

  const orgItems = [
    // Not `exact`, and safe: `NavItem` matches a prefix as `${href}/`, which for `/` is `//`, so
    // this lights on `/` alone. A bare `startsWith('/')` would light it on every page --
    // `shell.test.tsx` fails for that.
    { key: 'today', href: app.today(), icon: <TodayIcon />, label: labels.today, exact: false },
    // `exact`: `/weddings/new` and `/weddings/<id>` are under this path and are not the list.
    {
      key: 'weddings',
      href: app.weddings(),
      icon: <WeddingsIcon />,
      label: labels.weddings,
      exact: true,
    },
    {
      key: 'templates',
      href: app.templates(),
      icon: <TemplatesIcon />,
      label: labels.templates,
      exact: false,
    },
    {
      key: 'vendors',
      href: app.vendors(),
      icon: <VendorsIcon />,
      label: labels.vendors,
      exact: false,
    },
    { key: 'team', href: app.team(), icon: <TeamIcon />, label: labels.team, exact: false },
    // After Team, where spec 0005 puts it ("things about the studio" together). A member does
    // not see it at all rather than a link to a 404: Team is shown to a member because its page
    // explains itself, and a settings page they cannot use has nothing to explain.
    ...(canManage
      ? [
          {
            key: 'studio',
            href: app.studio(),
            icon: <StudioIcon />,
            label: labels.studio,
            exact: false,
          },
        ]
      : []),
  ]

  const sidebar = (
    <nav
      aria-label={labels.nav}
      className={cx(
        'flex h-full flex-col gap-1 p-2.5',
        collapsed ? 'md:w-14' : 'md:w-60',
        'w-64 md:transition-[width] md:duration-200',
      )}
    >
      <OrgHead current={org} orgs={orgs} collapsed={collapsed} labels={labels.org} />

      <div className="mt-1 flex flex-col gap-0.5">
        {/* Search is a sidebar row rather than a header field: there is no header band on
            this surface by decision, and one search implementation beats two. */}
        <Palette labels={labels.palette} collapsed={collapsed} />
      </div>

      {/* Everything that can outgrow the screen scrolls here, and the collapse row and the
          account menu below it do not: the wedding list is the one part of the sidebar with no
          upper bound, and a footer that scrolls away is the account menu going missing.
          `-mx-1 px-1` because a scroll container clips, and a 2px focus outline drawn outside
          the row would be sliced off at both edges. */}
      <div className="-mx-1 flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-1 pt-1 pb-1">
        {orgItems.map((item) => (
          <NavItem
            key={item.key}
            href={item.href}
            icon={item.icon}
            label={item.label}
            collapsed={collapsed}
            exact={item.exact}
            onNavigate={() => setDrawer(false)}
          />
        ))}

        {collapsed ? (
          <hr className="border-border mx-2 my-2" />
        ) : (
          <p className="text-muted-foreground mt-4 px-2.5 pb-1 text-[0.6875rem] font-semibold tracking-[0.08em] uppercase">
            {labels.weddingsSection}
          </p>
        )}

        <ul className="flex flex-col gap-0.5">
          {ordered.map((w) => {
            const current = w.id === weddingId
            return (
              <li key={w.id}>
                <WeddingRow
                  wedding={w}
                  current={current}
                  collapsed={collapsed}
                  locale={locale}
                  labels={labels.row}
                  onNavigate={() => setDrawer(false)}
                />
                {/* The sections of the wedding you are in, and only that one: eight rows per
                    wedding would be a sidebar of sections and no weddings. Every section is a
                    real screen -- a stub still answers, which is why they are listed rather
                    than omitted as `docs/specs/0001` first did. */}
                {current ? (
                  <ul
                    aria-label={w.name}
                    className={cx(
                      'mt-0.5 mb-1 flex flex-col gap-0.5',
                      collapsed ? null : 'border-border ml-3 border-l pl-1.5',
                    )}
                  >
                    {weddingItems(w.id, labels.wedding).map((item) => (
                      <li key={item.key}>
                        <NavItem
                          href={item.href}
                          icon={item.icon}
                          label={item.label}
                          collapsed={collapsed}
                          exact={item.exact}
                          onNavigate={() => setDrawer(false)}
                        />
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            )
          })}
        </ul>

        <NavItem
          href={app.weddingNew()}
          icon={<PlusIcon />}
          label={labels.newWedding}
          collapsed={collapsed}
          exact
          onNavigate={() => setDrawer(false)}
        />
      </div>

      <div className="hidden md:block">
        <NavAction
          icon={
            <CollapseIcon className={cx('size-[1.15em] shrink-0', collapsed && 'rotate-180')} />
          }
          label={collapsed ? labels.expand : labels.collapse}
          collapsed={collapsed}
          onClick={toggleCollapse}
          aria-expanded={!collapsed}
        />
      </div>

      <hr className="border-border" />
      <AccountMenu
        name={user.name}
        email={user.email}
        collapsed={collapsed}
        locale={locale}
        theme={theme}
        density={density}
        onReport={openReport}
        labels={labels.account}
      />
    </nav>
  )

  return (
    <div className="bg-background text-foreground flex min-h-dvh">
      {/* Desktop: in the flow, so the content column is genuinely narrower and nothing
          sits under the sidebar. `print:hidden` because a run sheet printed for a venue
          wants the page and not the navigation. */}
      <aside
        className={cx(
          'border-border hidden shrink-0 border-r md:block print:hidden',
          collapsed ? 'w-14' : 'w-60',
          'transition-[width] duration-200',
        )}
      >
        <div className="sticky top-0 h-dvh">{sidebar}</div>
      </aside>

      {/* `drawer || undefined` and never `drawer`: `inert={false}` renders the attribute as
          `inert="false"`, and any present value is TRUE in HTML, so the boolean-looking form
          would inert the page permanently. */}
      <div className="flex min-w-0 flex-1 flex-col" inert={drawer || undefined}>
        {/* Phone-only header. It exists at no other breakpoint, and it holds the menu
            button and nothing else -- the org name is in the drawer, where the switcher
            that changes it also is. */}
        <header className="border-border flex h-14 items-center gap-2 border-b px-3 md:hidden print:hidden">
          <button
            type="button"
            ref={menuButtonRef}
            onClick={() => setDrawer(true)}
            aria-label={labels.openMenu}
            aria-expanded={drawer}
            className="hover:bg-muted focus-visible:outline-ring grid size-10 cursor-pointer place-items-center rounded-[var(--radius)] outline-none focus-visible:outline-2"
          >
            <MenuIcon />
          </button>
          <span className="min-w-0 truncate text-sm font-semibold">{org.name}</span>
        </header>

        {/* `inert` while the drawer is open: it takes the whole region out of the tab order
            and out of the accessibility tree in one attribute, which is the focus trap. */}
        <main className="min-w-0 flex-1">
          {banner === 'demo' ? (
            <DemoBanner labels={labels.demoBanner} onReport={openReport} />
          ) : null}
          {children}
        </main>

        {/* Mounted only while open: unmounting is how the dialog resets, see its own comment. */}
        {canReport && reporting ? (
          <ReportDialog open onClose={() => setReporting(false)} labels={labels.report} />
        ) : null}

        {/* The post-login passkey offer, and the reason it is a sibling of `<main>` INSIDE
            this column rather than a sibling of the column: the column is what carries
            `inert` while the drawer is open, and a prompt outside it would stay tabbable
            underneath the drawer -- the exact bug the `inert` placement note above records
            about the phone header.

            `Suspense` because `EnrollmentPrompt` calls `useSearchParams`, which Next
            client-side-renders up to the closest boundary; without one a production build
            of any prerendered route above this fails outright. Nothing to show while it
            resolves -- an empty box where an offer might appear is worse than the offer
            arriving a beat late -- so the fallback is `null`.

            Gated on `offerPasskey` here so the component is not even mounted for a planner
            who already has a passkey; its own two gates handle the rest. */}
        {offerPasskey ? (
          <Suspense fallback={null}>
            <EnrollmentPrompt labels={labels.enroll} />
          </Suspense>
        ) : null}

        {/* The one place the product names itself inside the workspace, and it reverses part
            of `docs/specs/0001`: that spec kept our mark out of the signed-in app entirely,
            because planners brand their own service. Decided 2026-09-24 from the planner
            prototype: a quiet "powered by" line UNDER the org's own name, at the foot of the
            page, keeps the hierarchy the spec was protecting -- the org is still the first
            and largest name on every screen -- while the sidebar stays ours-free, which
            `shell.test.tsx` still asserts.

            `target="_blank"`: the link leaves the dashboard for marketing, and a planner
            half-way through a form should not lose it to a click on the fine print. */}
        <footer className="border-border text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-2.5 border-t px-4 py-2 text-[0.6875rem] print:hidden">
          <span className="min-w-0 truncate">{org.name}</span>
          <a
            href={productHref}
            target="_blank"
            rel="noopener"
            className="hover:text-foreground focus-visible:outline-ring ml-auto inline-flex items-center gap-1.5 rounded-sm outline-none focus-visible:outline-2"
          >
            {/* The explicit space: JSX drops the newline, and the link's accessible name
                would read "doorGuestnote" -- the gap class spaces it for the eye only. */}
            {labels.poweredBy}{' '}
            <span className="text-foreground font-semibold tracking-[-0.005em]">Guestnote</span>
          </a>
        </footer>
      </div>

      {drawer ? (
        <div className="fixed inset-0 z-100 md:hidden">
          {/* The backdrop is a pointer convenience, not a control. It was a labelled
              button, which put a SECOND "Menu sluiten" in the accessibility tree beside the
              real close button -- two identical controls to tab through, one of them a
              full-screen rectangle. `aria-hidden` + `tabIndex={-1}` keeps the click target
              and takes it out of the tree; Escape and the X button are the accessible paths,
              and both are asserted. */}
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            onClick={() => {
              setDrawer(false)
              menuButtonRef.current?.focus()
            }}
            className="absolute inset-0 cursor-default bg-black/40"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={labels.nav}
            className="bg-card border-border absolute inset-y-0 left-0 w-64 border-r shadow-xl"
          >
            <div className="flex h-full flex-col">
              <div className="flex justify-end p-2 pb-0">
                <button
                  type="button"
                  onClick={() => {
                    setDrawer(false)
                    menuButtonRef.current?.focus()
                  }}
                  aria-label={labels.closeMenu}
                  className="hover:bg-muted focus-visible:outline-ring grid size-9 cursor-pointer place-items-center rounded-[var(--radius)] outline-none focus-visible:outline-2"
                >
                  <CloseIcon />
                </button>
              </div>
              <div className="min-h-0 flex-1">{sidebar}</div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

/**
 * The sections inside one wedding, in the order a planner works through them.
 *
 * Overview is `exact` because every other section's path sits under it. The rest are prefix
 * matches so a task open at `/tasks/<id>` still marks the checklist -- which is the first
 * caller `NavItem`'s prefix branch has ever had.
 */
function weddingItems(id: string, l: ShellLabels['wedding']) {
  return [
    {
      key: 'overview',
      href: app.wedding(id),
      icon: <OverviewIcon />,
      label: l.overview,
      exact: true,
    },
    {
      key: 'checklist',
      href: app.weddingTasks(id),
      icon: <ChecklistIcon />,
      label: l.checklist,
      exact: false,
    },
    {
      key: 'budget',
      href: app.weddingBudget(id),
      icon: <BudgetIcon />,
      label: l.budget,
      exact: false,
    },
    {
      key: 'payments',
      href: app.weddingPayments(id),
      icon: <PaymentsIcon />,
      label: l.payments,
      exact: false,
    },
    {
      key: 'vendors',
      href: app.weddingVendors(id),
      icon: <VendorsIcon />,
      label: l.vendors,
      exact: false,
    },
    {
      key: 'runSheet',
      href: app.weddingRunSheet(id),
      icon: <RunSheetIcon />,
      label: l.runSheet,
      exact: false,
    },
    { key: 'files', href: app.weddingFiles(id), icon: <FilesIcon />, label: l.files, exact: false },
    {
      key: 'moodboard',
      href: app.weddingMoodboard(id),
      icon: <MoodboardIcon />,
      label: l.moodboard,
      exact: false,
    },
  ]
}
