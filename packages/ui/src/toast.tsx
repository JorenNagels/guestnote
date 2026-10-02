'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { cx } from './cx.ts'

/** One message on screen. A new `id` is a new toast: it restarts the clock. */
export type ToastItem = {
  readonly id: number
  readonly message: string
  readonly action?: {
    readonly label: string
    readonly onClick: () => void
    /** In flight: the button stays where it is, disabled, and the clock stops. */
    readonly busy?: boolean
  }
}

type Props = {
  /** `null` is "nothing to say". The region stays mounted either way (see below). */
  toast: ToastItem | null
  /** The dismiss button's accessible name. Required because this package holds no copy. */
  dismissLabel: string
  onDismiss: () => void
  /** How long a toast stays, untouched. Spec 0009 C4 says 8 s. */
  duration?: number
}

/**
 * One message at the bottom of the viewport, with at most one action and a dismiss button: what
 * "deleted, Undo" needs (spec 0009 C4). Presentational -- what the message says and what the
 * action does are the caller's.
 *
 * ## The live region is the message, not the card
 *
 * `role="status"` (polite) wraps the TEXT alone, and is in the DOM from first paint, for the
 * reason `LiveRegion` gives: a region inserted at the same moment as its message is often not
 * announced at all. So the card around it is styled into existence rather than mounted, and the
 * buttons are siblings of the region, not inside it -- inside, a screen reader would read
 * "Undo, Dismiss" as part of every announcement. Rejected: `role="alert"`, which interrupts; a
 * deletion the planner just asked for is the expected outcome, not an emergency.
 *
 * ## It never takes focus
 *
 * Nothing here calls `focus()` on arrival: the planner is mid-task, and a toast that pulls focus
 * to the bottom of the page loses their place. The buttons are ordinary tab stops at the end of
 * the document. One exception, which keeps focus rather than takes it: when the action button
 * itself had focus and the next message has no action (an undo that worked), focus moves to the
 * dismiss button in the same card instead of falling to `<body>`.
 *
 * ## The clock stops while someone is looking
 *
 * Hover or focus inside the card pauses it, and leaving restarts the full `duration` rather than
 * the remainder: simpler, and erring towards the toast staying is the safe direction for an
 * Undo. Rejected: a fixed 8 s regardless (WCAG 2.2.1 asks that a time limit can be extended, and
 * pausing on interaction is the usual way to give that).
 */
export function Toast({ toast, dismissLabel, onDismiss, duration = 8000 }: Props) {
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const dismiss = useRef<HTMLButtonElement>(null)
  const card = useRef<HTMLDivElement>(null)
  const actionHadFocus = useRef(false)
  // A ref, so a caller that passes a fresh arrow function every render does not restart the clock.
  const onDismissRef = useRef(onDismiss)
  onDismissRef.current = onDismiss

  const id = toast?.id
  const paused = hovered || focused || toast?.action?.busy === true

  useEffect(() => {
    if (id === undefined || paused) return
    const timer = setTimeout(() => onDismissRef.current(), duration)
    return () => clearTimeout(timer)
  }, [id, paused, duration])

  // Before paint, so focus never visibly lands on <body> in between. Only when focus has
  // actually been lost: if it went anywhere else since, it is the planner's, and stays there.
  useLayoutEffect(() => {
    if (id === undefined || !actionHadFocus.current) return
    actionHadFocus.current = false
    const active = document.activeElement
    if (active === null || active === document.body) dismiss.current?.focus()
  }, [id])

  // `hovered` and `focused` are otherwise cleared only by the card's own leave and blur, and
  // neither fires when what was hovered or focused is unmounted under the pointer or the focus:
  // Dismiss removes the focused button, and a card with no toast is `pointer-events-none`, so
  // no mouseleave can follow. Left alone, the next toast started paused and stayed forever
  // (batch C review, 2026-10-02). So each new toast re-reads where focus really is -- after the
  // repair above, which may have put it on Dismiss -- and no toast is not hovered.
  // Rejected: resetting both to false on every id, which would run the clock while focus sits
  // on a button that survived the change. Hover across two toasts is left as it was: the card
  // stays under the pointer and its mouseleave still fires.
  useLayoutEffect(() => {
    if (id === undefined) setHovered(false)
    setFocused(card.current?.contains(document.activeElement) ?? false)
  }, [id])

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex justify-center px-4 pb-4">
      {/* The handlers only pause the clock; they do not make the card a control, and the two
          controls in it are real buttons. Rejected: `role="group"` to satisfy the rule, which
          Biome then asks to be a `<fieldset>` -- a form element around a status message. */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: hover and focus pause a timer here */}
      <div
        ref={card}
        data-testid="toast"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocus={() => setFocused(true)}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget)) setFocused(false)
        }}
        className={cx(
          'flex w-full max-w-md items-center gap-3 text-sm',
          toast &&
            'pointer-events-auto rounded-[var(--radius-container)] border border-border bg-popover py-2.5 pr-2 pl-4 text-popover-foreground shadow-lg',
        )}
      >
        <div role="status" aria-live="polite" aria-atomic="true" className="min-w-0 flex-1">
          {toast?.message}
        </div>
        {toast?.action && (
          <button
            type="button"
            onClick={toast.action.onClick}
            disabled={toast.action.busy}
            onFocus={() => {
              actionHadFocus.current = true
            }}
            // A blur with somewhere to go is the planner moving on. A blur to nowhere is the
            // button being removed under the focus, which is the case the effect above repairs.
            onBlur={(e) => {
              if (e.relatedTarget !== null) actionHadFocus.current = false
            }}
            className={cx(
              'shrink-0 rounded-[var(--radius)] px-2.5 py-1.5 font-semibold underline-offset-[3px]',
              'enabled:cursor-pointer enabled:hover:underline disabled:opacity-60',
            )}
          >
            {toast.action.label}
          </button>
        )}
        {toast && (
          <button
            ref={dismiss}
            type="button"
            aria-label={dismissLabel}
            onClick={onDismiss}
            className={cx(
              'grid size-8 shrink-0 place-items-center rounded-[var(--radius)] enabled:cursor-pointer',
              'text-[color:var(--gn-muted,var(--muted-foreground))] hover:bg-muted',
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
        )}
      </div>
    </div>
  )
}
