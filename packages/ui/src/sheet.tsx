'use client'

import { type KeyboardEvent, type ReactNode, useEffect, useId, useRef } from 'react'
import { cx } from './cx.ts'

type Props = {
  open: boolean
  onClose: () => void
  /** The dialog's accessible name and its visible heading. */
  title: ReactNode
  /** The close button's accessible name. Required because this package holds no copy. */
  closeLabel: string
  children: ReactNode
  /** Pinned under the scrolling body: the save and cancel row. */
  footer?: ReactNode
  className?: string
}

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

/**
 * A modal panel that slides in from the right edge. For editing one thing without leaving
 * the list it belongs to.
 *
 * Built on `role="dialog"` rather than the native `<dialog>`. `showModal()` would give the
 * focus trap and the Escape key for free, but jsdom does not implement it, which would
 * leave the keyboard contract here untestable in the component project -- and an untested
 * focus trap is the kind that quietly stops working. The price is the ~15 lines below.
 *
 * What it does for the person at the keyboard: focus moves into the panel on open (the
 * first field, not the close button), Tab wraps inside it, Escape closes, and focus goes
 * back to whatever opened it. The page behind is not made `inert`, so a screen reader
 * relies on `aria-modal`; that is the accepted gap, and the scrim swallows pointer input.
 *
 * Not portalled. A portal needs `document` and so a mounted-state dance to stay
 * hydration-safe; the cost of skipping it is that a transformed ancestor would trap the
 * `fixed` positioning. Render the sheet near the top of a route, not inside a transform.
 *
 * Unmounted when closed, so its form state does not survive a close. That is the right
 * default for an editor: reopening shows the saved row, not last time's abandoned draft.
 */
export function Sheet({ open, onClose, title, closeLabel, children, footer, className }: Props) {
  const titleId = useId()
  const panel = useRef<HTMLDivElement>(null)
  const body = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const returnTo = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const first = body.current?.querySelector<HTMLElement>(FOCUSABLE)
    ;(first ?? panel.current)?.focus()
    // The page behind must not scroll under a modal, or the panel's own scrolling and the
    // page's fight over the wheel.
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = overflow
      returnTo?.focus()
    }
  }, [open])

  if (!open) return null

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      onClose()
      return
    }
    if (e.key !== 'Tab' || !panel.current) return
    const stops = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)]
    const first = stops[0]
    const last = stops[stops.length - 1]
    if (!first || !last) {
      e.preventDefault()
      panel.current.focus()
      return
    }
    const active = document.activeElement
    if (e.shiftKey && (active === first || active === panel.current)) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && active === last) {
      e.preventDefault()
      first.focus()
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* A pointer affordance only. Escape is the keyboard way out, so this needs no key handler. */}
      <div aria-hidden="true" onClick={onClose} className="absolute inset-0 bg-black/40" />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        // On the dialog and not the wrapper: focus is always inside the panel while it is
        // open, so every key event that matters bubbles through here.
        onKeyDown={onKeyDown}
        className={cx(
          'relative flex h-full w-full max-w-md flex-col border-l border-border',
          'bg-popover text-popover-foreground shadow-xl outline-none',
          className,
        )}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-5 py-3.5">
          <h2 id={titleId} className="text-base font-semibold">
            {title}
          </h2>
          <button
            type="button"
            aria-label={closeLabel}
            onClick={onClose}
            className={cx(
              'grid size-8 place-items-center rounded-[var(--radius)] enabled:cursor-pointer',
              'text-[color:var(--gn-muted,var(--muted-foreground))] transition-colors',
              'hover:bg-muted hover:text-[color:var(--gn-fg,var(--foreground))]',
            )}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              aria-hidden="true"
              className="size-4"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        <div ref={body} className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {children}
        </div>
        {footer && <div className="shrink-0 border-t border-border px-5 py-3.5">{footer}</div>}
      </div>
    </div>
  )
}
