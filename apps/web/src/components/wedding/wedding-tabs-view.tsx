import { cx } from '@guestnote/ui/cx'
import Link from 'next/link'
import { app } from '../../lib/routes.ts'

/**
 * The row of links under a wedding's heading, so a planner moves between the screens of one
 * wedding without going back to the sidebar. Rendered once, by `weddings/[id]/layout.tsx`, through
 * `wedding-tabs-nav.tsx`; it used to be rendered by each screen under its own heading, which made
 * the whole header part of every tab's loading skeleton (changed 2026-09-24).
 *
 * ## Links, not ARIA tabs
 *
 * `role="tablist"` promises one page whose panels swap with arrow keys and no navigation.
 * These are separate routes, so they are a `nav` of links with `aria-current="page"`, which is
 * what a screen reader announces correctly and what the browser's Back button already
 * understands. Rejected: `packages/ui`'s `Tabs`, for the same reason -- it is the other kind.
 *
 * The strip scrolls sideways on a phone rather than wrapping: eight short words wrap into three
 * rows, and a planner on a venue floor wants the strip to stay one thumb tall.
 *
 * ## One Geld tab for two routes (spec 0009 A1)
 *
 * Budget and Betalingen were two tabs until 2026-10-02. They are one subject -- what it costs
 * and what has been paid -- and with the sidebar's section rows gone the strip is the wedding's
 * only menu, so it lost a word rather than gained one. `money` links to the budget and is current
 * on both `/budget` and `/payments` (`wedding-tabs-nav.tsx` maps both segments to it); the
 * two-link switch at the top of each page (`components/money/money-switch.tsx`) moves between
 * them. Both routes stay, so links and bookmarks to either keep working. Rejected: merging the
 * two pages into one, which would put two tables and two sheets on one screen for a change
 * that is about the menu.
 */
export type WeddingTab =
  | 'overview'
  | 'tasks'
  | 'money'
  | 'vendors'
  | 'runSheet'
  | 'files'
  | 'moodboard'
  | 'settings'

/** The order the sidebar's section rows had, with Instellingen last because it is the rare one. */
const TABS: readonly { key: WeddingTab; href: (id: string) => string }[] = [
  { key: 'overview', href: app.wedding },
  { key: 'tasks', href: app.weddingTasks },
  { key: 'money', href: app.weddingBudget },
  { key: 'vendors', href: app.weddingVendors },
  { key: 'runSheet', href: app.weddingRunSheet },
  { key: 'files', href: app.weddingFiles },
  { key: 'moodboard', href: app.weddingMoodboard },
  { key: 'settings', href: app.weddingSettings },
]

export type WeddingTabLabels = Readonly<Record<WeddingTab, string>>

export function WeddingTabsView({
  weddingId,
  current,
  labels,
  navLabel,
}: {
  weddingId: string
  current: WeddingTab
  labels: WeddingTabLabels
  navLabel: string
}) {
  return (
    <nav aria-label={navLabel} className="border-border -mx-1 mt-4 overflow-x-auto border-b">
      <ul className="m-0 flex min-w-max list-none gap-1 p-0 px-1">
        {TABS.map(({ key, href }) => {
          const active = key === current
          return (
            <li key={key}>
              <Link
                href={href(weddingId)}
                aria-current={active ? 'page' : undefined}
                className={cx(
                  'relative inline-flex h-[calc(var(--control-h)+2px)] items-center px-3 text-sm',
                  'outline-none focus-visible:outline-ring focus-visible:outline-2',
                  'transition-colors',
                  active
                    ? 'text-foreground font-medium after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:bg-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {labels[key]}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
