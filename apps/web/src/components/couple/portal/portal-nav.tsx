'use client'

import { cx } from '@guestnote/ui/cx'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

export type PortalNavItem = { readonly href: string; readonly label: string }

/**
 * The portal's navigation (spec 0008): one row of pills that scrolls sideways on a phone, only
 * the modules the planner switched on. The home item is active on its exact path only; every
 * other item on its own path and below it (a board under Moodboards).
 */
export function PortalNav({ items, label }: { items: readonly PortalNavItem[]; label: string }) {
  const pathname = usePathname()
  const home = items[0]?.href
  return (
    <nav aria-label={label} className="-mx-4 overflow-x-auto px-4 print:hidden">
      <ul className="m-0 flex list-none gap-2 p-0">
        {items.map((item) => {
          const active =
            item.href === home ? pathname === item.href : pathname.startsWith(item.href)
          return (
            <li key={item.href} className="flex-none">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cx(
                  'inline-flex h-10 items-center rounded-full px-4 text-sm whitespace-nowrap',
                  'outline-none focus-visible:outline-2 focus-visible:outline-ring',
                  active
                    ? 'bg-primary text-primary-foreground font-medium'
                    : 'bg-surface-container hover:bg-muted',
                )}
              >
                {item.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
