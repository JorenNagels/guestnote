'use client'

import { cx } from '@guestnote/ui/cx'
import { type ReactNode, useCallback, useEffect, useId, useRef, useState } from 'react'

/**
 * The one popover behind both the org head and the account menu.
 *
 * Written rather than installed. The two menus here need: open on click, close on Escape,
 * close on outside click, close on choose, return focus to the trigger, and roving focus
 * over the items. That is this file. A headless menu library brings a focus-management
 * engine, a portal layer and a positioning engine, and the positioning engine is the part
 * worth naming -- both menus anchor to a fixed-width sidebar edge, so there is nothing to
 * collide with and nothing to flip. `packages/ui`'s own `cx` makes the same argument about
 * `clsx` + `tailwind-merge`.
 *
 * What that costs, stated: no collision detection, so a menu taller than the viewport will
 * clip rather than reposition. Both menus here are short and bounded -- an org list plus
 * five account rows -- and the day one is not, this needs a real popover.
 *
 * ## Not `<dialog>`, and not the `menu` role
 *
 * `<dialog popover>` would give light-dismiss for free but also a top-layer element that
 * escapes the sidebar's stacking context, which is a fight, not a saving.
 *
 * The role is deliberately NOT `menu`/`menuitem`. Those imply an application-style menu
 * bar where arrow keys are the only navigation and Tab exits the whole widget; screen
 * readers then announce "menu, 4 items" and suppress the links' own semantics. These are
 * a list of destinations and a list of settings, so they stay a plain group of buttons and
 * links, Tab-navigable, with the trigger carrying `aria-expanded`. ARIA's own advice is
 * that a menu role is for application menus and not for disclosure of ordinary controls.
 */
export function Menu({
  trigger,
  children,
  align = 'start',
  side = 'top',
}: {
  trigger: (props: {
    onClick: () => void
    'aria-expanded': boolean
    'aria-haspopup': true
    'aria-controls': string
    ref: React.Ref<HTMLButtonElement>
  }) => ReactNode
  children: (close: () => void) => ReactNode
  align?: 'start' | 'end'
  side?: 'top' | 'bottom'
}) {
  const [open, setOpen] = useState(false)
  // `useId` and not a random string in a ref: this renders on the server first, and a
  // random id would differ between the server HTML and the client's first render, which is
  // a hydration mismatch React reports as an error and then papers over by re-rendering.
  const id = useId()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  // Focus the panel on open so the first Tab lands inside it rather than after the
  // trigger, and return focus to the trigger on close so a keyboard user does not get
  // dropped at the top of the document. Both halves are required; doing only the first is
  // the common bug and it is worse than doing neither.
  useEffect(() => {
    if (!open) return
    const panel = panelRef.current
    // Not `first?.focus() ?? panel?.focus()`: `focus()` returns undefined, so `??` would
    // always evaluate its right side and move focus twice, landing on the panel every time.
    const first = panel?.querySelector<HTMLElement>('[data-menu-first]')
    if (first) first.focus()
    else panel?.focus()
  }, [open])

  // Memoised because the Escape/outside-click effect depends on it. Without that the
  // effect re-subscribes on every render, which works and is wasteful, and lint is right
  // to say the dependency is real rather than let it be omitted.
  const close = useCallback((returnFocus = true) => {
    setOpen(false)
    if (returnFocus) triggerRef.current?.focus()
  }, [])

  useEffect(() => {
    if (!open) return

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        close()
      }
    }
    // `pointerdown` and not `click`: a click listener fires after the button's own handler
    // has already toggled, so clicking the trigger while open closes and immediately
    // reopens. Pointerdown lets the trigger check be authoritative.
    const onPointer = (e: PointerEvent) => {
      const t = e.target as Node
      if (panelRef.current?.contains(t) || triggerRef.current?.contains(t)) return
      close(false)
    }

    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointer)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointer)
    }
  }, [open, close])

  return (
    <div className="relative">
      {trigger({
        onClick: () => (open ? close(false) : setOpen(true)),
        'aria-expanded': open,
        'aria-haspopup': true,
        'aria-controls': id,
        ref: triggerRef,
      })}

      {open ? (
        <div
          id={id}
          ref={panelRef}
          // No `role="group"` and no `aria-label`. A group role on a div needs a name to be
          // worth anything, `aria-label` on a roleless div is ignored, and lint objects to
          // both -- correctly. What actually associates this panel with its trigger is the
          // trigger's own `aria-expanded` + `aria-controls`, and every row inside is a
          // button carrying its own name. A wrapper role would add a level of nesting to
          // announce and no information.
          tabIndex={-1}
          className={cx(
            'bg-popover border-border absolute z-50 min-w-56 rounded-[var(--radius)] border p-1 shadow-lg outline-none',
            side === 'top' ? 'bottom-full mb-1.5' : 'top-full mt-1.5',
            align === 'start' ? 'left-0' : 'right-0',
          )}
        >
          {children(() => close())}
        </div>
      ) : null}
    </div>
  )
}

/** A row inside a `Menu`. `data-menu-first` marks the one that takes focus on open. */
export function MenuRow({
  children,
  onClick,
  selected = false,
  first = false,
}: {
  children: ReactNode
  onClick?: () => void
  selected?: boolean
  first?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-menu-first={first ? '' : undefined}
      // `aria-pressed` rather than `aria-selected`: outside a listbox or a tablist,
      // `aria-selected` is ignored, and a checkmark that is only a glyph tells a screen
      // reader nothing. research/08's rule that a state is never carried by hue alone is
      // the same argument one layer up.
      aria-pressed={selected || undefined}
      className={cx(
        'flex w-full cursor-pointer items-center gap-2 rounded-[calc(var(--radius)-2px)] px-2 py-1.5',
        'text-left text-sm transition-colors outline-none',
        'hover:bg-muted focus-visible:outline-ring focus-visible:outline-2',
        selected ? 'text-foreground font-medium' : 'text-muted-foreground',
      )}
    >
      {children}
    </button>
  )
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return (
    <p className="text-muted-foreground px-2 pt-1.5 pb-1 text-[0.6875rem] font-semibold tracking-[0.08em] uppercase">
      {children}
    </p>
  )
}

export function MenuSeparator() {
  return <hr className="border-border -mx-1 my-1" />
}
