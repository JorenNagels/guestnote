'use client'

import type { WeddingSummary } from '@guestnote/db'
import { cx } from '@guestnote/ui/cx'
import { type ReactNode, useCallback, useEffect, useId, useRef, useState } from 'react'
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

/**
 * The sections of the wedding you are in (spec 0009 A1). Handed in by the shell, which already
 * holds the wedding list and the labels -- so they cost no fetch and show before the weddings do.
 */
export type PaletteSection = {
  /** The wedding's name, which heads the group: "Budget" alone does not say whose. */
  name: string
  items: { key: string; href: string; label: string; icon: ReactNode }[]
}

type Row = { id: string; label: string; hint: string | null; href: string; icon: ReactNode }

/**
 * Jump to a wedding by typing -- or, inside one, to any of its sections. The sidebar's search
 * row and the dialog behind it.
 *
 * ## Sections, since spec 0009 A1
 *
 * The sidebar stopped listing the open wedding's sections on 2026-10-02, leaving the tab strip
 * as the pointer route and this as the keyboard one. The sections come after the weddings, not
 * before: once the weddings have loaded, Enter with nothing typed opens the first wedding, as it
 * always has, and typing "draai" filters the weddings away so the run sheet is first anyway.
 * Rejected: a section group for every wedding ("Els & Jan -- Budget"), which is eight rows per
 * wedding to scroll past for a planner who only wanted to switch.
 *
 * The sections need no fetch, so they show -- and take the arrow keys -- while the weddings are
 * still on their way. When the weddings land they are drawn ABOVE the sections, so the highlight
 * is held by the row's identity and not its index: held at its index it would silently move from
 * the section the planner had arrowed to onto whichever wedding now sits there, and Enter would
 * open another couple's wedding (found in review, 2026-10-02). Rejected: sending the highlight
 * back to the first row on arrival, the first fix -- safe, but it threw away the place the
 * planner had arrowed to (batch B review, 2026-10-02). A highlight nobody has moved is "the first
 * row", whatever that is, so with nothing touched Enter still opens the first wedding; a row
 * that has gone (filtered out) falls back to the first row the same way.
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
  sections = null,
}: {
  labels: PaletteLabels
  collapsed: boolean
  hint?: string
  sections?: PaletteSection | null
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [weddings, setWeddings] = useState<WeddingSummary[] | null>(null)
  // The highlighted row's `Row.id`, or null for "the first row". By identity -- see "Sections".
  const [activeId, setActiveId] = useState<string | null>(null)

  const listId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  const close = useCallback(() => {
    setOpen(false)
    setQuery('')
    setActiveId(null)
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
      // The rows above the highlight change here; it is held by id, so it stays on its row.
      if (live) setWeddings(rows)
    })
    return () => {
      live = false
    }
  }, [open, weddings])

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  const q = query.trim().toLowerCase()
  const weddingRows: Row[] = (weddings ?? [])
    .filter((w) => {
      if (!q) return true
      // Slug as well as display name, because a planner who has typed `els-en-jan` into a
      // URL bar all week will type that.
      return w.coupleDisplayName.toLowerCase().includes(q) || w.slug.toLowerCase().includes(q)
    })
    .map((w) => ({
      id: w.id,
      label: w.coupleDisplayName,
      hint: w.weddingDate ?? labels.dateUnknown,
      href: app.wedding(w.id),
      icon: <WeddingsIcon className="size-4 shrink-0 opacity-70" />,
    }))
  // Prefixed ids: an option's DOM id is built from this, and a section key must never be able
  // to collide with a wedding's uuid in `aria-activedescendant`.
  const sectionRows: Row[] = (sections?.items ?? [])
    .filter((s) => !q || s.label.toLowerCase().includes(q))
    .map((s) => ({
      id: `section-${s.key}`,
      label: s.label,
      hint: null,
      href: s.href,
      icon: s.icon,
    }))
  // One flat list for the arrow keys and Enter, in the order the groups are drawn.
  const rows = [...weddingRows, ...sectionRows]
  const groups = [
    { key: 'weddings', title: labels.weddings, rows: weddingRows },
    { key: 'sections', title: sections?.name ?? '', rows: sectionRows },
  ].filter((g) => g.rows.length > 0)

  const clamped = Math.max(
    rows.findIndex((r) => r.id === activeId),
    0,
  )
  const step = (by: number) => {
    if (rows.length === 0) return
    setActiveId(rows[(clamped + by + rows.length) % rows.length]?.id ?? null)
  }

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
      step(1)
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      step(-1)
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
            className="bg-popover border-border w-full max-w-lg overflow-hidden rounded-[var(--radius-container)] border shadow-2xl"
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
                  setActiveId(null)
                }}
                onKeyDown={onKeyDown}
                placeholder={labels.placeholder}
                className="placeholder:text-muted-foreground h-12 w-full bg-transparent text-sm outline-none"
              />
            </div>

            <div className="max-h-[52vh] overflow-y-auto p-1.5">
              {rows.length === 0 ? (
                // Loading only while there is nothing to show yet. Rendering `empty` in the
                // not-yet-fetched branch would tell every planner "Niets gevonden." for the
                // length of the round trip; the sections, which need no fetch, show at once.
                <p className="text-muted-foreground px-2 py-6 text-center text-sm">
                  {weddings === null ? labels.loading : labels.empty}
                </p>
              ) : (
                /* `div` and not `ul`/`li`. The ARIA combobox pattern wants
                   `listbox`/`option`, and lint refuses an interactive role on a
                   non-interactive element -- which is a real rule catching a real
                   mistake most of the time. A div carries the role with no implicit
                   semantics to override, so this is the shape that is both correct ARIA
                   and honestly typed. Each group is a `group` labelled by its heading, the
                   one other child a listbox may own. */
                <div role="listbox" id={listId} aria-label={labels.title}>
                  {groups.map((g) => (
                    // biome-ignore lint/a11y/useSemanticElements: a `<fieldset>` is a group of form controls, and these options are not inputs
                    <div key={g.key} role="group" aria-labelledby={`${listId}-${g.key}`}>
                      <p
                        id={`${listId}-${g.key}`}
                        className="text-muted-foreground px-2 pt-1 pb-1.5 text-[0.6875rem] font-semibold tracking-[0.08em] uppercase"
                      >
                        {g.title}
                      </p>
                      {g.rows.map((row) => {
                        const i = rows.indexOf(row)
                        return (
                          /* `tabIndex={-1}` because an option in this pattern is
                             deliberately NOT focusable: focus stays in the input the whole
                             time and `aria-activedescendant` is what moves. */
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
                            onMouseEnter={() => setActiveId(row.id)}
                            className={cx(
                              'flex cursor-pointer items-center gap-2.5 rounded-[calc(var(--radius)-2px)] px-2 py-2 text-sm',
                              i === clamped ? 'bg-muted text-foreground' : 'text-muted-foreground',
                            )}
                          >
                            {row.icon}
                            <span className="min-w-0 flex-1 truncate">{row.label}</span>
                            {row.hint === null ? null : (
                              <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                                {row.hint}
                              </span>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
