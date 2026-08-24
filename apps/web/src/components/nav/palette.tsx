'use client'

import type { WeddingSummary } from '@guestnote/db'
import { cx } from '@guestnote/ui/cx'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { paletteWeddings } from '../../app/pro/(app)/actions.ts'
import { app } from '../../lib/routes.ts'
import { SearchIcon, WeddingsIcon } from './icons.tsx'
import { NavAction } from './nav-item.tsx'

export type PaletteLabels = {
  open: string
  title: string
  placeholder: string
  weddings: string
  empty: string
  loading: string
  dateUnknown: string
}

type Row = { id: string; label: string; hint: string | null; href: string }

/**
 * Jump to a wedding by typing. The sidebar's search row and the dialog behind it.
 *
 * ## Why the trigger lives in this file
 *
 * The row in the sidebar and the dialog share one piece of state -- whether it is open --
 * and there is exactly one owner of that. Splitting them would mean lifting `open` into the
 * shell and threading it through two components that have nothing else to say to each other.
 *
 * ## The keyboard contract
 *
 * Cmd-K on Apple, Ctrl-K elsewhere, matched on `metaKey || ctrlKey` rather than sniffing the
 * platform: both chords work everywhere, which is what a planner who moves between a laptop
 * and a venue desktop actually wants. `preventDefault` because Ctrl-K is Firefox's search
 * bar and Chrome's address-bar shortcut -- without it the browser wins and the palette never
 * opens, which reads as the feature being broken.
 *
 * The listener is on `document` and not on the input, since the whole point is that it works
 * from anywhere on the page.
 *
 * ## Combobox, not a list of links in a box
 *
 * `role="combobox"` on the input with `aria-activedescendant` pointing at the highlighted
 * option, and the options in a `role="listbox"`. That is what makes a screen reader announce
 * the option as the arrow keys move, which a div full of anchors does not. Focus stays in
 * the input the entire time -- moving DOM focus to each option would fight the typing.
 */
export function Palette({
  labels,
  collapsed,
  hint = 'K',
}: {
  labels: PaletteLabels
  collapsed: boolean
  hint?: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [weddings, setWeddings] = useState<WeddingSummary[] | null>(null)
  const [active, setActive] = useState(0)

  const listId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  const close = useCallback(() => {
    setOpen(false)
    setQuery('')
    setActive(0)
    triggerRef.current?.focus()
  }, [])

  // Cmd/Ctrl-K from anywhere, and Escape from anywhere INSIDE.
  //
  // Escape lives here rather than only on the input's `onKeyDown`, and that was a bug a
  // test caught: clicking an option moves focus off the input, and Escape then did nothing
  // at all -- the dialog looked stuck. A document listener has one owner for the key and
  // works wherever focus has ended up. It is registered only while open, so it cannot
  // swallow Escape from anything else on the page.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((was) => !was)
        return
      }
      if (open && e.key === 'Escape') {
        e.preventDefault()
        close()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, close])

  // Fetch once, on first open, and keep it for the life of the page. `weddings === null`
  // means "never fetched" and is distinct from `[]`, which means "fetched, none" -- collapse
  // the two and an org with no weddings re-fetches on every open forever.
  useEffect(() => {
    if (!open || weddings !== null) return
    let live = true
    void paletteWeddings().then((rows) => {
      if (live) setWeddings(rows)
    })
    return () => {
      live = false
    }
  }, [open, weddings])

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  const rows: Row[] = (weddings ?? [])
    .filter((w) => {
      const q = query.trim().toLowerCase()
      if (!q) return true
      // Slug as well as display name, because a planner who has typed `els-en-jan` into a
      // URL bar all week will type that.
      return w.coupleDisplayName.toLowerCase().includes(q) || w.slug.toLowerCase().includes(q)
    })
    .map((w) => ({
      id: w.id,
      label: w.coupleDisplayName,
      hint: w.weddingDate,
      href: app.wedding(w.id),
    }))

  const clamped = Math.min(active, Math.max(rows.length - 1, 0))

  const choose = (row: Row | undefined) => {
    if (!row) return
    close()
    window.location.assign(row.href)
  }

  // Escape is deliberately NOT handled here -- the document listener above owns it, so
  // there is one place it can be wrong rather than two that can disagree.
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => (rows.length === 0 ? 0 : (i + 1) % rows.length))
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => (rows.length === 0 ? 0 : (i - 1 + rows.length) % rows.length))
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      choose(rows[clamped])
    }
  }

  return (
    <>
      <NavAction
        icon={<SearchIcon />}
        label={labels.open}
        // `collapsed` was hard-coded `false` here, which meant the rail showed this row's
        // full label and its ⌘K badge while every other row shrank -- and, worse, left it
        // with no `aria-label`, so on the rail it was the one target named by nothing. The
        // sidebar's own "every target keeps a name" test enumerated two rows by hand and
        // did not look at this one.
        collapsed={collapsed}
        // No keyboard badge on the rail: there is no room, and the chord still works.
        {...(collapsed ? {} : { hint: `⌘${hint}` })}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      />

      {open ? (
        <div
          // The backdrop is the dismiss target. `onPointerDown` rather than `onClick` so a
          // drag that starts on a row and ends on the backdrop does not close it.
          className="fixed inset-0 z-100 flex items-start justify-center bg-black/40 px-4 pt-[12vh]"
          onPointerDown={(e) => {
            if (e.target === e.currentTarget) close()
          }}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label={labels.title}
            className="bg-popover border-border w-full max-w-lg overflow-hidden rounded-[var(--radius)] border shadow-2xl"
          >
            <div className="border-border flex items-center gap-2.5 border-b px-3.5">
              <SearchIcon className="text-muted-foreground size-4 shrink-0" />
              <input
                ref={inputRef}
                type="text"
                role="combobox"
                aria-expanded="true"
                aria-controls={listId}
                aria-autocomplete="list"
                aria-activedescendant={rows[clamped] ? `${listId}-${rows[clamped]?.id}` : undefined}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value)
                  setActive(0)
                }}
                onKeyDown={onKeyDown}
                placeholder={labels.placeholder}
                className="placeholder:text-muted-foreground h-12 w-full bg-transparent text-sm outline-none"
              />
            </div>

            <div className="max-h-[52vh] overflow-y-auto p-1.5">
              {weddings === null ? (
                <p className="text-muted-foreground px-2 py-6 text-center text-sm">
                  {labels.loading}
                </p>
              ) : rows.length === 0 ? (
                <p className="text-muted-foreground px-2 py-6 text-center text-sm">
                  {labels.empty}
                </p>
              ) : (
                <>
                  <p
                    id={`${listId}-group`}
                    className="text-muted-foreground px-2 pt-1 pb-1.5 text-[0.6875rem] font-semibold tracking-[0.08em] uppercase"
                  >
                    {labels.weddings}
                  </p>
                  {/* `div` and not `ul`/`li`. The ARIA combobox pattern wants
                      `listbox`/`option`, and lint refuses an interactive role on a
                      non-interactive element -- which is a real rule catching a real
                      mistake most of the time. A div carries the role with no implicit
                      semantics to override, so this is the shape that is both correct ARIA
                      and honestly typed. `tabIndex={-1}` because an option in this pattern
                      is deliberately NOT focusable: focus stays in the input the whole
                      time and `aria-activedescendant` is what moves. */}
                  <div role="listbox" id={listId} aria-labelledby={`${listId}-group`}>
                    {rows.map((row, i) => (
                      <div
                        key={row.id}
                        id={`${listId}-${row.id}`}
                        role="option"
                        tabIndex={-1}
                        aria-selected={i === clamped}
                        // `pointerdown`, not `click`: the backdrop's dismiss also runs on
                        // pointerdown, and a click here would fire after it had closed.
                        onPointerDown={(e) => {
                          e.preventDefault()
                          choose(row)
                        }}
                        onMouseEnter={() => setActive(i)}
                        className={cx(
                          'flex cursor-pointer items-center gap-2.5 rounded-[calc(var(--radius)-2px)] px-2 py-2 text-sm',
                          i === clamped ? 'bg-muted text-foreground' : 'text-muted-foreground',
                        )}
                      >
                        <WeddingsIcon className="size-4 shrink-0 opacity-70" />
                        <span className="min-w-0 flex-1 truncate">{row.label}</span>
                        <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                          {row.hint ?? labels.dateUnknown}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
