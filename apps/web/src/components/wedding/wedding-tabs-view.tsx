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
 * The strip scrolls sideways on a phone rather than wrapping: nine short words wrap into three
 * rows, and a planner on a venue floor wants the strip to stay one thumb tall.
 */
export type WeddingTab =
  | 'overview'
  | 'tasks'
  | 'budget'
  | 'payments'
  | 'vendors'
  | 'runSheet'
  | 'files'
  | 'moodboard'
  | 'settings'

/** Order is the sidebar's, with Instellingen last because it is the rare one. */
const TABS: readonly { key: WeddingTab; href: (id: string) => string }[] = [
  { key: 'overview', href: app.wedding },
  { key: 'tasks', href: app.weddingTasks },
  { key: 'budget', href: app.weddingBudget },
  { key: 'payments', href: app.weddingPayments },
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
