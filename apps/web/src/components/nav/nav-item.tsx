'use client'

import { cx } from '@guestnote/ui/cx'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'

/**
 * One row of the sidebar, and the only reason any of this is a Client Component.
 *
 * A layout receives no pathname -- there is no prop for it and there is deliberately no
 * way to read one on the server, because a layout that varied by path would defeat the
 * partial rendering layouts exist for. So the active state comes from `usePathname`, which
 * makes this the client boundary. It is drawn as tightly as possible: everything above it
 * stays a Server Component, and this file ships no data, only a string comparison.
 *
 * ## `aria-current="page"`, and which item gets it
 *
 * `exact` on both call sites today, and the prefix branch therefore has no caller. It stays
 * because it is what the prop MEANS -- and the interesting case is why nothing uses it:
 * inside a wedding, prefix matching would light `Bruiloften` as well as `Overzicht`, and
 * marking both says two places are one place. `docs/specs/0001` settles that the wedding
 * section is where you are. When a section grows sub-pages, that section's own item wants
 * the prefix branch; until then no test can discriminate it, which is why this paragraph
 * exists rather than an assertion.
 */
export function NavItem({
  href,
  icon,
  label,
  collapsed,
  exact = false,
  onNavigate,
}: {
  href: string
  icon: ReactNode
  label: string
  collapsed: boolean
  exact?: boolean
  onNavigate?: () => void
}) {
  const pathname = usePathname()
  const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`)

  return (
    <a
      href={href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      // The accessible name moves onto the element when the label is not rendered. A
      // tooltip is decoration and is not reachable by touch or by a screen reader, so it
      // can never be the only thing naming a target.
      aria-label={collapsed ? label : undefined}
      title={collapsed ? label : undefined}
      className={cx(
        'group relative flex items-center gap-2.5 rounded-[var(--radius)] text-sm',
        'transition-colors outline-none focus-visible:outline-ring focus-visible:outline-2',
        collapsed ? 'justify-center px-0' : 'px-2.5',
        // Height from the density token rather than a literal, so `compact` moves the nav
        // with the tables. It is the same reading session.
        'h-[calc(var(--control-h)+2px)]',
        active
          ? 'bg-muted font-medium text-foreground'
          : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
      )}
    >
      {icon}
      {collapsed ? null : <span className="min-w-0 flex-1 truncate">{label}</span>}
    </a>
  )
}

/**
 * A sidebar row that runs an action instead of navigating -- search, collapse, the menus.
 *
 * Separate from `NavItem` rather than a `href?: string` union, because the two differ in
 * more than the tag: this one has no active state, takes no badge, and must be a `button`
 * so that Space activates it and a screen reader announces it as an action rather than a
 * destination. Collapsing them into one component with three optional props would hide
 * exactly that distinction.
 */
export function NavAction({
  icon,
  label,
  collapsed,
  onClick,
  hint,
  ...aria
}: {
  icon: ReactNode
  label: string
  collapsed: boolean
  onClick?: () => void
  hint?: string
  'aria-expanded'?: boolean
  'aria-controls'?: string
  'aria-haspopup'?: 'dialog' | 'menu' | true
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={collapsed ? label : undefined}
      title={collapsed ? label : undefined}
      {...aria}
      className={cx(
        'group flex w-full cursor-pointer items-center gap-2.5 rounded-[var(--radius)] text-sm',
        'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
        'transition-colors outline-none focus-visible:outline-ring focus-visible:outline-2',
        collapsed ? 'justify-center px-0' : 'px-2.5',
        'h-[calc(var(--control-h)+2px)]',
      )}
    >
      {icon}
      {collapsed ? null : (
        <>
          <span className="min-w-0 flex-1 truncate text-left">{label}</span>
          {hint === undefined ? null : (
            // Not `aria-hidden`. It was, on the reasoning that a screen-reader user does
            // not need a mouse user's chord -- which is wrong twice: the chord works for
            // everyone, and lint flags aria-hidden inside a focusable control because it
            // hides content from the very users most likely to want a keyboard shortcut.
            <kbd className="border-border text-muted-foreground shrink-0 rounded border px-1 font-mono text-[0.6875rem]">
              {hint}
            </kbd>
          )}
        </>
      )}
    </button>
  )
}
