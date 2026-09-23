import type { RunSheetInput } from '@guestnote/db'
import { isUuid } from './uuid.ts'

/**
 * The run sheet's arithmetic and its input parsing, kept pure so the same rules run in the
 * view (what a warning says) and in the Server Function (what a save accepts).
 *
 * Imports only TYPES from `@guestnote/db`: this file is reached from a client component, and a
 * value import would pull drizzle into the browser bundle (the note in `lib/vendor-input.ts`).
 */

const DAY = 24 * 60

/** Minutes after midnight for `HH:MM`, or `null` for anything else (including `24:00`). */
export function clockToMinutes(clock: string): number | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(clock)
  return m ? Number(m[1]) * 60 + Number(m[2]) : null
}

/** `HH:MM` for a minute count. Wraps at midnight: 25:10 is 01:10, and the `+1` is the caller's. */
export function minutesToClock(minutes: number): string {
  const wrapped = ((minutes % DAY) + DAY) % DAY
  const h = Math.floor(wrapped / 60)
  const m = wrapped % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** A pause this long or longer between two items is worth saying; shorter ones are just a pause. */
export const GAP_WARN_MIN = 30

export type ScheduleInput = { readonly startsAt: string; readonly durationMin: number }

export type ScheduleRow<T extends ScheduleInput> = {
  readonly item: T
  /** Minutes from the first day's midnight. 1560 is 02:00 the next day. */
  readonly startAbs: number
  readonly endAbs: number
  readonly endClock: string
  /** Whole days past the first midnight the item starts, and ends. */
  readonly startDay: number
  readonly endDay: number
  /** Minutes free between everything above ending and this starting, or `null`. */
  readonly gapMin: number | null
  /** Minutes this starts before everything above has ended, or `null`. */
  readonly overlapMin: number | null
}

/**
 * The list with its end times and the pauses between rows, read in the order given.
 *
 * Order is the caller's (the stored `position`), and the clock is only used to detect midnight:
 * a start earlier than the one before it means the sheet has run past midnight, exactly as
 * `repos/run-sheet.ts` reads it. The gap and overlap are measured against the LATEST end so far
 * and not the previous item's, so a long item that spans the next two is still caught. Rejected:
 * comparing neighbours only, which calls a 12:00 to 15:00 lunch "clear" of a 14:00 speech
 * because the item between them ended at 12:30.
 *
 * An unreadable time is treated as continuing the previous item's clock. The repo only stores
 * `HH:MM`, so this is defence against a row written some other way, not a case to design for.
 */
export function computeSchedule<T extends ScheduleInput>(items: readonly T[]): ScheduleRow<T>[] {
  const rows: ScheduleRow<T>[] = []
  let day = 0
  let prevClock = -1
  let latestEnd: number | null = null

  for (const item of items) {
    const clock = clockToMinutes(item.startsAt) ?? Math.max(prevClock, 0)
    if (prevClock !== -1 && clock < prevClock) day += 1
    prevClock = clock

    const startAbs = day * DAY + clock
    const endAbs = startAbs + item.durationMin
    const free = latestEnd === null ? null : startAbs - latestEnd
    rows.push({
      item,
      startAbs,
      endAbs,
      endClock: minutesToClock(endAbs),
      startDay: day,
      endDay: Math.floor(endAbs / DAY),
      gapMin: free !== null && free > 0 ? free : null,
      overlapMin: free !== null && free < 0 ? -free : null,
    })
    latestEnd = latestEnd === null ? endAbs : Math.max(latestEnd, endAbs)
  }
  return rows
}

/** The clock a new item after `items` should start at: where the last one ends. */
export function nextStartClock(items: readonly ScheduleInput[]): string {
  const rows = computeSchedule(items)
  const last = rows[rows.length - 1]
  return last ? last.endClock : '09:00'
}

/** Hours and minutes of a length, for the view to word: `{ h: 1, m: 30 }` for 90. */
export function splitDuration(minutes: number): { h: number; m: number } {
  return { h: Math.floor(minutes / 60), m: minutes % 60 }
}

export const RUN_SHEET_LIMITS = { title: 120, place: 120, maxDuration: DAY } as const

/** What the item sheet posts. Everything is text: a Server Function argument is whatever the body said. */
export type RunSheetFormValues = {
  eventId: string
  startsAt: string
  durationMin: string
  title: string
  place: string
  /** A `wedding_vendors` id, or empty for none. */
  weddingVendorId: string
}

export type RunSheetError =
  | 'event'
  | 'time'
  | 'duration'
  | 'title'
  | 'place'
  | 'vendor'
  | 'notFound'
  | 'failed'

export type RunSheetActionResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: RunSheetError }

const text = (x: unknown) => (typeof x === 'string' ? x : '')

/** `{ error }` names the field to fix. The first problem wins, in the order the form reads. */
export function parseRunSheetForm(
  raw: unknown,
): { readonly eventId: string; readonly input: RunSheetInput } | { readonly error: RunSheetError } {
  if (typeof raw !== 'object' || raw === null) return { error: 'failed' }
  const v = raw as Record<string, unknown>

  const eventId = text(v.eventId).trim()
  if (!isUuid(eventId)) return { error: 'event' }

  const startsAt = text(v.startsAt).trim()
  if (clockToMinutes(startsAt) === null) return { error: 'time' }

  const durationText = text(v.durationMin).trim()
  const durationMin = /^\d{1,4}$/.test(durationText) ? Number(durationText) : 0
  if (durationMin < 1 || durationMin > RUN_SHEET_LIMITS.maxDuration) return { error: 'duration' }

  const title = text(v.title).trim()
  if (title === '' || title.length > RUN_SHEET_LIMITS.title) return { error: 'title' }

  const place = text(v.place).trim()
  if (place.length > RUN_SHEET_LIMITS.place) return { error: 'place' }

  const vendorId = text(v.weddingVendorId).trim()
  if (vendorId !== '' && !isUuid(vendorId)) return { error: 'vendor' }

  return {
    eventId,
    input: {
      startsAt,
      durationMin,
      title,
      place: place === '' ? null : place,
      weddingVendorId: vendorId === '' ? null : vendorId,
    },
  }
}
