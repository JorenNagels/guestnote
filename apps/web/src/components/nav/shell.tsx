'use client'

import { cx } from '@guestnote/ui/cx'
import { useParams, usePathname } from 'next/navigation'
import { type ReactNode, useEffect, useRef, useState, useTransition } from 'react'
import { setNavCollapsed, weddingHeader } from '../../app/pro/(app)/actions.ts'
import type { Locale } from '../../lib/locales.ts'
import type { Density, NavState, Theme } from '../../lib/prefs.ts'
import { app } from '../../lib/routes.ts'
import { AccountMenu } from './account-menu.tsx'
import { CloseIcon, CollapseIcon, MenuIcon, OverviewIcon, WeddingsIcon } from './icons.tsx'
import { NavAction, NavItem } from './nav-item.tsx'
import { OrgHead, type OrgOption } from './org-head.tsx'
import { Palette, type PaletteLabels } from './palette.tsx'

export type ShellLabels = {
  nav: string
  weddings: string
  overview: string
  weddingSection: string
  collapse: string
  expand: string
  openMenu: string
  closeMenu: string
  org: { switch: string; current: string }
  account: Parameters<typeof AccountMenu>[0]['labels']
  palette: PaletteLabels
}

export type ShellWedding = { id: string; name: string; date: string | null }

/**
 * The dashboard's chrome: a persistent left sidebar, a rail when collapsed, a drawer on a
 * phone.
 *
 * Client because three things here are interaction state -- collapsed, drawer open, and the
 * palette -- and because `usePathname` is the only way a layout can know where it is.
 *
 * Everything the shell can be GIVEN arrives as plain props from `(app)/layout.tsx`, which
 * stays a Server Component. Two things cannot be given and are fetched from here through
 * Server Functions, each for a reason argued at its own call site: the wedding heading,
 * because a layout cannot see a param from a segment below it, and the palette's list,
 * because handing it down would cost a `member` N transactions on every page. So the client
 * bundle carries markup, event handlers and two POST call sites -- and no database code,
 * which is the half of the original claim that survived.
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
  user,
  initialNav,
  locale,
  theme,
  density,
  labels,
  children,
}: {
  org: OrgOption
  orgs: OrgOption[]
  user: { name: string | null; email: string }
  initialNav: NavState
  locale: Locale
  theme: Theme
  density: Density
  labels: ShellLabels
  children: ReactNode
}) {
  const [nav, setNav] = useState<NavState>(initialNav)
  const [drawer, setDrawer] = useState(false)
  const [wedding, setWedding] = useState<ShellWedding | null>(null)
  const [, startTransition] = useTransition()
  const pathname = usePathname()
  const params = useParams<{ id?: string }>()
  const menuButtonRef = useRef<HTMLButtonElement>(null)

  const collapsed = nav === 'collapsed'
  const weddingId = typeof params?.id === 'string' ? params.id : null

  /**
   * The wedding-context section's data, fetched per wedding route.
   *
   * `useParams` and not a pathname regex: the router already parsed the segment, and a
   * regex here would have to be kept in step with `lib/routes.ts` by hand.
   *
   * Cleared to `null` the moment the id changes rather than left showing the previous
   * wedding's name while the next one loads -- a heading that lags is worse than a heading
   * that is briefly absent, because it says you are somewhere you are not. `live` guards
   * the out-of-order resolve when a planner jumps between two weddings quickly.
   */
  useEffect(() => {
    if (!weddingId) {
      setWedding(null)
      return
    }
    let live = true
    setWedding(null)
    void weddingHeader(weddingId).then((row) => {
      if (live && row) setWedding({ id: row.id, name: row.name, date: row.date })
    })
    return () => {
      live = false
    }
  }, [weddingId])

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

        {/* No count badge, deliberately. A number here means listing weddings in the
            layout on every page render, which for a `member` is one transaction per
            assigned wedding -- the exact cost `paletteWeddings` was restructured to
            avoid. The destination shows the count for free. */}
        <NavItem
          href={app.weddings()}
          icon={<WeddingsIcon />}
          label={labels.weddings}
          collapsed={collapsed}
          exact
          onNavigate={() => setDrawer(false)}
        />
      </div>

      {/* The wedding-context section, present only while inside one. Unbuilt sections --
          guests, budget, vendors, run sheet, files -- are omitted rather than shown
          disabled: a greyed list of six things you cannot click reads as a demo, and the
          competitor is a spreadsheet that works. docs/specs/0001 records the decision. */}
      {wedding ? (
        <div className="mt-4 flex min-w-0 flex-col gap-0.5">
          {collapsed ? (
            <hr className="border-border mx-2 my-1" />
          ) : (
            <div className="px-2.5 pb-1">
              <p className="text-muted-foreground truncate text-[0.6875rem] font-semibold tracking-[0.08em] uppercase">
                {labels.weddingSection}
              </p>
              <p className="mt-0.5 truncate text-sm font-medium">{wedding.name}</p>
              {/* The date earns the field `weddingHeader` already returns. Without it the
                  round trip fetched a value nothing rendered, which a review caught. */}
              {wedding.date ? (
                <time
                  dateTime={wedding.date}
                  className="text-muted-foreground mt-0.5 block truncate text-xs tabular-nums"
                >
                  {wedding.date}
                </time>
              ) : null}
            </div>
          )}
          <NavItem
            href={app.wedding(wedding.id)}
            icon={<OverviewIcon />}
            label={labels.overview}
            collapsed={collapsed}
            exact
            onNavigate={() => setDrawer(false)}
          />
        </div>
      ) : null}

      <div className="flex-1" />

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
        <main className="min-w-0 flex-1">{children}</main>
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
