'use client'

import type { RunSheetItem, RunSheetOwner, RunSheetVendor, WeddingEvent } from '@guestnote/db'
import { Button } from '@guestnote/ui/button'
import { Card } from '@guestnote/ui/card'
import { cx } from '@guestnote/ui/cx'
import { InlineError } from '@guestnote/ui/inline-error'
import { Table, TableBody, TableCell, TableHead, TableHeaderCell } from '@guestnote/ui/table'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Fragment, useState, useTransition } from 'react'
import { shiftRunSheetItem } from '../../app/pro/(app)/weddings/[id]/run-sheet/actions.ts'
import { formatCivilDate } from '../../lib/civil-date.ts'
import { app } from '../../lib/routes.ts'
import {
  computeSchedule,
  formatDuration,
  GAP_WARN_MIN,
  nextStartClock,
  type ScheduleRow,
} from '../../lib/run-sheet.ts'
import { safeColor } from '../nav/wedding-row.tsx'
import { ItemSheet } from './item-sheet.tsx'
import { MoveButtons } from './move-buttons.tsx'

type Translate = ReturnType<typeof useTranslations>

/**
 * The tint on a row the viewer owns (spec 0004), which amends spec 0003's "never a background
 * behind text" for this one use. 12% is chosen as the largest mix that keeps `--muted-foreground`
 * at AA for any hex the native input allows: the worst cases, pure black on the light card and
 * pure white on the dark one, compute to 4.91:1 and 5.09:1 (7.05 and 7.03 on the plain card;
 * computed from `design-system/tokens.css` by script in commit review, 2026-09-24, not measured in
 * a browser). 15% drops the light case to 4.46:1 and fails. Do not raise it without re-running
 * that check. No colour set: `--muted`, the neutral tint.
 *
 * A custom property and not `style.background`, so the `print:` reset in the class can win -- an
 * inline background would beat any class, and a sheet printed for the venue is black and white.
 */
function ownTint(color: string | null): React.CSSProperties {
  const hex = safeColor(color)
  return {
    '--row-tint': hex ? `color-mix(in oklab, ${hex} 12%, var(--card))` : 'var(--muted)',
  } as React.CSSProperties
}
const TINTED = 'bg-[var(--row-tint)] print:bg-transparent'

/**
 * Who a row is for: the vendor who does it and the staff member who answers for it, both when
 * there are both; "Planner" when neither is named, as before owners existed.
 */
function whoOf(item: RunSheetItem, planner: string): string {
  return [item.vendorName, item.ownerName].filter((x) => x).join(' · ') || planner
}

/**
 * The run sheet screen: an event picker (tabs when there is more than one), the chosen event's
 * items in order, and the side sheet that adds or edits one.
 *
 * One component draws both the desktop table and the phone list -- the SPEC's "the phone is the
 * same page, not a second mode" -- so a warning, a vendor name or a bug fix cannot exist on one
 * and not the other. Tailwind's breakpoints pick which markup is visible; the data and the event
 * handlers underneath are the same read of `schedule`.
 */
export function RunSheetView({
  weddingId,
  coupleName,
  locale,
  events,
  selectedEventId,
  items,
  vendors,
  owners = [],
  viewerId = null,
  color = null,
}: {
  weddingId: string
  coupleName: string
  locale: string
  events: WeddingEvent[]
  selectedEventId: string | null
  items: RunSheetItem[]
  vendors: RunSheetVendor[]
  /** Who the viewer may name as a row's owner (spec 0004). */
  owners?: RunSheetOwner[]
  /** The signed-in user: their own rows are tinted. */
  viewerId?: string | null
  /** The wedding's `#RRGGBB`, the tint's hue. */
  color?: string | null
}) {
  const t = useTranslations('app.runSheet')
  const list = useTranslations('app.runSheet.list')
  const ev = useTranslations('app.runSheet.event')
  const [sheetItem, setSheetItem] = useState<RunSheetItem | null | 'new'>(null)
  const [moveError, setMoveError] = useState(false)
  const [, startMove] = useTransition()

  const selectedEvent = events.find((e) => e.id === selectedEventId) ?? null
  const schedule = computeSchedule(items)
  const tint = ownTint(color)
  const mine = (item: RunSheetItem) => viewerId !== null && item.ownerUserId === viewerId
  const base = app.weddingRunSheet(weddingId)

  const move = (itemId: string, direction: 'up' | 'down') => {
    setMoveError(false)
    startMove(async () => {
      const result = await shiftRunSheetItem(weddingId, itemId, direction)
      if (!result.ok) setMoveError(true)
    })
  }

  const editingIndex =
    sheetItem !== 'new' && sheetItem ? items.findIndex((i) => i.id === sheetItem.id) : -1

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <header className="mb-5">
        <p className="text-muted-foreground text-xs font-semibold tracking-[0.09em] uppercase">
          {coupleName}
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{t('title')}</h1>
      </header>

      {events.length === 0 ? (
        <Card className="max-w-xl">
          <h2 className="text-base font-semibold">{ev('noEvents.title')}</h2>
          <p className="text-muted-foreground mt-1.5 text-sm leading-relaxed">
            {ev('noEvents.body')}
          </p>
          <div className="mt-4 max-w-56">
            <Link
              href={app.weddingSettings(weddingId)}
              className="border-input hover:border-foreground inline-flex h-11 w-full items-center justify-center rounded-[var(--radius)] border px-4 text-sm font-medium"
            >
              {ev('noEvents.action')}
            </Link>
          </div>
        </Card>
      ) : (
        <>
          {events.length > 1 && (
            <nav aria-label={t('days.label')} className="-mx-1 overflow-x-auto">
              <ul className="m-0 flex min-w-max list-none gap-1.5 p-0 px-1">
                {events.map((e) => {
                  const active = e.id === selectedEvent?.id
                  return (
                    <li key={e.id}>
                      <Link
                        href={`${base}?event=${e.id}`}
                        aria-current={active ? 'page' : undefined}
                        className={cx(
                          'inline-flex h-[var(--control-h)] items-center gap-2 rounded-full border px-3.5 text-sm',
                          active
                            ? 'border-input bg-secondary font-semibold'
                            : 'border-transparent text-muted-foreground hover:bg-muted',
                        )}
                      >
                        {e.label}
                        <span className="font-mono text-xs tabular-nums opacity-80">
                          {formatCivilDate(locale, e.startsOn)}
                        </span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </nav>
          )}

          {selectedEvent && (
            <p
              className={cx(
                'text-muted-foreground flex flex-wrap items-center gap-x-2 text-sm',
                events.length > 1 ? 'mt-3' : 'mt-1',
              )}
            >
              <span className="text-foreground font-medium">{selectedEvent.label}</span>
              <span aria-hidden="true">·</span>
              <time dateTime={selectedEvent.startsOn}>
                {formatCivilDate(locale, selectedEvent.startsOn)}
              </time>
              <span aria-hidden="true">·</span>
              <span>{selectedEvent.startsAt ?? ev('noTime')}</span>
            </p>
          )}

          {moveError && (
            <div className="mt-3">
              <InlineError>{t('errors.failed')}</InlineError>
            </div>
          )}

          {selectedEvent &&
            (items.length === 0 ? (
              <Card className="mt-5 max-w-xl">
                <h2 className="text-base font-semibold">{list('emptyTitle')}</h2>
                <p className="text-muted-foreground mt-1.5 text-sm leading-relaxed">
                  {list('emptyBody')}
                </p>
                <div className="mt-4 max-w-56">
                  <Button onClick={() => setSheetItem('new')}>{list('emptyAction')}</Button>
                </div>
              </Card>
            ) : (
              <div className="mt-5">
                <div className="mb-3 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-muted-foreground text-sm">
                    {list('summary', {
                      count: items.length,
                      from: items[0]?.startsAt ?? '',
                      to: schedule[schedule.length - 1]?.endClock ?? '',
                    })}
                  </p>
                  <div className="w-full sm:w-44">
                    <Button onClick={() => setSheetItem('new')}>{list('add')}</Button>
                  </div>
                </div>

                {/* Desktop: a real table, one row per item, a warning as a full-width row before
                    the row it applies to. */}
                <div className="hidden md:block">
                  <Table caption={list('caption', { event: selectedEvent.label })}>
                    <TableHead>
                      <tr>
                        <TableHeaderCell>{list('colTime')}</TableHeaderCell>
                        <TableHeaderCell>{list('colLength')}</TableHeaderCell>
                        <TableHeaderCell>{list('colWhat')}</TableHeaderCell>
                        <TableHeaderCell>{list('colWho')}</TableHeaderCell>
                        <TableHeaderCell>{list('colWhere')}</TableHeaderCell>
                        <TableHeaderCell className="sr-only">{list('colOrder')}</TableHeaderCell>
                      </tr>
                    </TableHead>
                    <TableBody>
                      {schedule.map((row, i) => (
                        <Fragment key={row.item.id}>
                          {i > 0 && <DesktopWarning row={row} list={list} />}
                          <tr
                            className={mine(row.item) ? TINTED : undefined}
                            style={mine(row.item) ? tint : undefined}
                          >
                            <TableCell className="font-mono text-[13px] font-semibold tabular-nums">
                              {row.item.startsAt}
                              <DayMark day={row.startDay} label={list('nextDay')} />
                            </TableCell>
                            <TableCell className="text-muted-foreground text-[12.5px]">
                              {formatDuration(row.item.durationMin, list)}
                            </TableCell>
                            <TableCell className="max-w-0">
                              <span className="block truncate">{row.item.title}</span>
                            </TableCell>
                            <TableCell className="text-muted-foreground truncate text-[12.5px]">
                              {whoOf(row.item, list('planner'))}
                            </TableCell>
                            <TableCell className="text-muted-foreground truncate text-[12.5px]">
                              {row.item.place ?? ''}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center justify-end gap-1.5">
                                <MoveButtons
                                  size="sm"
                                  upLabel={list('moveUp', { title: row.item.title })}
                                  downLabel={list('moveDown', { title: row.item.title })}
                                  canMoveUp={i > 0}
                                  canMoveDown={i < schedule.length - 1}
                                  onMove={(direction) => move(row.item.id, direction)}
                                />
                                <button
                                  type="button"
                                  aria-label={list('edit', { title: row.item.title })}
                                  onClick={() => setSheetItem(row.item)}
                                  className="border-input text-foreground enabled:hover:border-foreground focus-visible:outline-ring inline-flex size-9 cursor-pointer items-center justify-center rounded-[var(--radius)] border outline-none focus-visible:outline-2"
                                >
                                  <EditIcon />
                                </button>
                              </div>
                            </TableCell>
                          </tr>
                        </Fragment>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Phone: a stacked list, the whole row a button; reorder moves to the editor's
                    own buttons there (SPEC), so the row stays uncluttered. */}
                <ul className="border-border bg-card divide-y overflow-hidden rounded-[var(--radius)] border md:hidden">
                  {schedule.map((row, i) => (
                    <li
                      key={row.item.id}
                      className={mine(row.item) ? TINTED : undefined}
                      style={mine(row.item) ? tint : undefined}
                    >
                      {i > 0 && <PhoneWarning row={row} list={list} />}
                      <button
                        type="button"
                        onClick={() => setSheetItem(row.item)}
                        aria-label={list('edit', { title: row.item.title })}
                        className="flex min-h-14 w-full cursor-pointer items-center gap-3.5 px-4 py-3 text-left"
                      >
                        <span className="w-14 flex-none font-mono text-[15px] font-semibold tabular-nums">
                          {row.item.startsAt}
                          <DayMark day={row.startDay} label={list('nextDay')} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[15px]">{row.item.title}</span>
                          <span className="text-muted-foreground mt-0.5 block truncate text-[13px]">
                            {whoOf(row.item, list('planner'))}
                            {row.item.place ? ` · ${row.item.place}` : ''}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
        </>
      )}

      {sheetItem !== null && selectedEvent && (
        <ItemSheet
          key={sheetItem === 'new' ? 'new' : sheetItem.id}
          weddingId={weddingId}
          eventId={selectedEvent.id}
          item={sheetItem === 'new' ? null : sheetItem}
          defaultStart={nextStartClock(items)}
          vendors={vendors}
          owners={owners}
          canMoveUp={editingIndex > 0}
          canMoveDown={editingIndex !== -1 && editingIndex < items.length - 1}
          onClose={() => setSheetItem(null)}
        />
      )}
    </div>
  )
}

type Warning = { tone: 'alert' | 'awaiting'; message: string }

/**
 * Words and an icon, never colour alone (SPEC): a planner reading this in black and white, or
 * with a colour filter, still gets the information. An overlap warns regardless of how small
 * (two vendors really can double-book by a minute) and reads as an alert; a gap is a milder
 * `awaiting` tone from `GAP_WARN_MIN` up, a shorter pause being just a pause and not shown.
 */
function warningOf(row: ScheduleRow<RunSheetItem>, list: Translate): Warning | null {
  if (row.overlapMin !== null) {
    return {
      tone: 'alert',
      message: list('overlap', { length: formatDuration(row.overlapMin, list) }),
    }
  }
  if (row.gapMin !== null && row.gapMin >= GAP_WARN_MIN) {
    return { tone: 'awaiting', message: list('gap', { length: formatDuration(row.gapMin, list) }) }
  }
  return null
}

/** The overlap or gap note, as a full-width row above the item it warns about. */
function DesktopWarning({ row, list }: { row: ScheduleRow<RunSheetItem>; list: Translate }) {
  const warning = warningOf(row, list)
  if (warning === null) return null
  return (
    <tr>
      <td
        colSpan={6}
        className={cx(
          'border-border border-b p-0',
          warning.tone === 'alert' ? 'bg-st-alert-bg' : 'bg-st-awaiting-bg',
        )}
      >
        <WarningText warning={warning} />
      </td>
    </tr>
  )
}

function PhoneWarning({ row, list }: { row: ScheduleRow<RunSheetItem>; list: Translate }) {
  const warning = warningOf(row, list)
  if (warning === null) return null
  return (
    <div className={warning.tone === 'alert' ? 'bg-st-alert-bg' : 'bg-st-awaiting-bg'}>
      <WarningText warning={warning} />
    </div>
  )
}

function WarningText({ warning }: { warning: Warning }) {
  return (
    <p
      className={cx(
        'flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium',
        warning.tone === 'alert' ? 'text-st-alert-fg' : 'text-st-awaiting-fg',
      )}
    >
      <WarningIcon />
      {warning.message}
    </p>
  )
}

function WarningIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="size-3.5 shrink-0"
    >
      <path d="M8 2 1 14h14L8 2Z" />
      <path d="M8 6.5v3" />
      <circle cx="8" cy="11.5" r="0.4" fill="currentColor" />
    </svg>
  )
}

function EditIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="size-4"
    >
      <path d="M11 2.5 13.5 5 5 13.5H2.5V11L11 2.5Z" />
    </svg>
  )
}

/** The small "+1" a rolled-over item, and its end time, carry (SPEC: "marked +1"). */
function DayMark({ day, label }: { day: number; label: string }) {
  if (day <= 0) return null
  return (
    <>
      <sup aria-hidden="true" className="text-muted-foreground ml-0.5 text-[10px] font-semibold">
        +{day}
      </sup>
      <span className="sr-only"> ({label})</span>
    </>
  )
}
