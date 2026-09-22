/**
 * What a template row becomes on a given wedding, worked out in the browser so that changing the
 * wedding in the apply panel redraws the "Becomes" column without a round trip.
 *
 * Deliberately not `taskAddDays` from `@guestnote/db`: that module pulls drizzle into a client
 * bundle. The arithmetic is the same one -- a civil date read as UTC midnight plus whole days, so
 * no daylight-saving hour can move it -- and `template-preview.test.ts` pins the two together.
 */

const CIVIL_DATE = /^\d{4}-\d{2}-\d{2}$/
const DAY_MS = 86_400_000

/** `YYYY-MM-DD` plus whole days, or `null` for anything that is not a civil date. */
export function addDaysCivil(date: string | null, days: number): string | null {
  if (date === null || !CIVIL_DATE.test(date)) return null
  const ms = Date.parse(`${date}T00:00:00Z`)
  if (Number.isNaN(ms) || new Date(ms).toISOString().slice(0, 10) !== date) return null
  return new Date(ms + days * DAY_MS).toISOString().slice(0, 10)
}

/** The compact T-minus notation: `T-180` before the day, `T-0` on it, `T+3` after. */
export function formatOffset(dueOffsetDays: number): string {
  if (dueOffsetDays > 0) return `T+${dueOffsetDays}`
  return `T-${Math.abs(dueOffsetDays)}`
}
