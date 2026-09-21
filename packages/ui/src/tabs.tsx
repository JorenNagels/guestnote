'use client'

import { type KeyboardEvent, type ReactNode, useId, useRef, useState } from 'react'
import { Badge } from './badge.tsx'
import { cx } from './cx.ts'

export type TabItem = {
  /** Identifies the tab. Used in element ids, so no whitespace. */
  value: string
  label: ReactNode
  /** Rendered as a `Badge` beside the label. Zero is shown; omit it to show nothing. */
  count?: number
  /** Rendered as the tab's panel while the tab is selected. Omit it if the caller owns the content. */
  panel?: ReactNode
}

type Props = {
  /** The tablist's accessible name. Required: an unnamed tablist is announced as just "tab list". */
  label: string
  items: TabItem[]
  /** Controlled selection. Without it the component keeps its own, starting at `defaultValue`. */
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  className?: string
}

/**
 * In-page tabs with the keyboard contract the ARIA pattern promises: one tab stop for
 * the whole list, arrows move and select, Home and End jump to the ends.
 *
 * Selection follows focus ("automatic activation") because a panel here is cheap to show.
 * The manual variant exists for panels that cost a network round trip, and nothing in
 * this app has one.
 *
 * Only the selected tab's panel is mounted. The alternative, keeping every panel in the
 * DOM and toggling `hidden`, preserves a panel's scroll and half-typed input across a
 * switch at the price of rendering all of them up front. Callers that need the first
 * behaviour should own the content themselves and leave `panel` out.
 *
 * This is not the wedding's route strip (checklist, budget, vendors). Those are links to
 * different pages and want `<a aria-current>`, not `role="tab"`; overloading one
 * component for both is how a link ends up announced as a tab.
 */
export function Tabs({ label, items, value, defaultValue, onValueChange, className }: Props) {
  const base = useId()
  const [own, setOwn] = useState(defaultValue ?? items[0]?.value)
  const buttons = useRef(new Map<string, HTMLButtonElement>())

  const current = value ?? own
  // If the selection names no tab (a stale value from the caller), fall back to the first
  // as the tab stop; otherwise the whole list would be unreachable by keyboard.
  const stop = items.some((i) => i.value === current) ? current : items[0]?.value
  const selected = items.find((i) => i.value === current)

  const select = (next: string) => {
    setOwn(next)
    onValueChange?.(next)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const at = items.findIndex((i) => i.value === stop)
    let to: number
    if (e.key === 'ArrowRight') to = (at + 1) % items.length
    else if (e.key === 'ArrowLeft') to = (at - 1 + items.length) % items.length
    else if (e.key === 'Home') to = 0
    else if (e.key === 'End') to = items.length - 1
    else return
    const next = items[to]
    if (!next) return
    e.preventDefault()
    select(next.value)
    buttons.current.get(next.value)?.focus()
  }

  const tabId = (v: string) => `${base}-tab-${v}`
  const panelId = (v: string) => `${base}-panel-${v}`

  return (
    <div className={className}>
      <div
        role="tablist"
        aria-label={label}
        onKeyDown={onKeyDown}
        className="flex flex-wrap gap-[3px]"
      >
        {items.map((item) => {
          const isSelected = item.value === selected?.value
          return (
            <button
              key={item.value}
              type="button"
              role="tab"
              id={tabId(item.value)}
              ref={(el) => {
                if (el) buttons.current.set(item.value, el)
                else buttons.current.delete(item.value)
              }}
              aria-selected={isSelected}
              aria-controls={
                isSelected && item.panel !== undefined ? panelId(item.value) : undefined
              }
              tabIndex={item.value === stop ? 0 : -1}
              onClick={() => select(item.value)}
              className={cx(
                'inline-flex h-[var(--control-h)] items-center gap-1.5 rounded-full border px-3.5',
                'text-sm transition-colors enabled:cursor-pointer',
                // Selected is bolder AND boxed, not just tinted: the same "never colour
                // alone" rule as the pills, since the tint is a step of neutral.
                isSelected
                  ? 'border-[var(--gn-input,var(--input))] bg-secondary font-semibold text-[color:var(--gn-fg,var(--foreground))]'
                  : 'border-transparent text-[color:var(--gn-muted,var(--muted-foreground))] hover:bg-muted',
              )}
            >
              {item.label}
              {item.count !== undefined && <Badge>{item.count}</Badge>}
            </button>
          )
        })}
      </div>
      {selected?.panel !== undefined && (
        // Focusable on purpose, and it is the ARIA pattern's own advice: a panel with no
        // focusable child would otherwise be unreachable for a keyboard user who has just
        // arrowed onto its tab. Biome's rule does not know `tabpanel` is interactive.
        <div
          role="tabpanel"
          id={panelId(selected.value)}
          aria-labelledby={tabId(selected.value)}
          // biome-ignore lint/a11y/noNoninteractiveTabindex: see above
          tabIndex={0}
        >
          {selected.panel}
        </div>
      )}
    </div>
  )
}
