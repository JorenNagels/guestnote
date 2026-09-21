/**
 * Days until a wedding, for the sidebar's countdown.
 *
 * `weddings.wedding_date` is a `date` -- a civil date, the same day to the couple in Brussels
 * or in Bali (the schema says so, and `weddings/[id]/page.tsx` formats it in UTC for that
 * reason). So the arithmetic is done on two civil dates, each read as UTC midnight, and the
 * difference is a whole number of days with no daylight-saving hour in it. Subtracting a
 * local-time `new Date()` from UTC midnight instead is off by a day for part of every day in
 * any zone but Greenwich -- invisible when the developer sits in it.
 *
 * "Today" is the Brussels civil date, not the UTC one. The i18n config pins
 * `timeZone: 'Europe/Brussels'` for every other date on this surface, and a planner opening the
 * app at 00:30 local would otherwise still see yesterday's countdown for the first hour or two
 * of each day. Rejected: `Date.now()` in the runtime's zone -- a Lambda runs in UTC and a
 * laptop does not, so the same wedding would disagree with itself between staging and a dev
 * machine.
 */

const CIVIL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

const BRUSSELS_DAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Brussels',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

const DAY_MS = 86_400_000

function civilMs(iso: string): number | null {
  const m = CIVIL_DATE.exec(iso)
  if (!m) return null
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return Number.isNaN(ms) ? null : ms
}

/**
 * Whole days from today to `weddingDate` (`YYYY-MM-DD`): positive before the day, `0` on it,
 * negative after. `null` for no date, or for a string that is not a civil date -- a countdown
 * that renders `NaN` in a sidebar row is worse than one that is absent.
 */
export function daysUntil(weddingDate: string | null, now: Date = new Date()): number | null {
  if (weddingDate === null) return null
  const target = civilMs(weddingDate)
  const today = civilMs(BRUSSELS_DAY.format(now))
  if (target === null || today === null) return null
  return (target - today) / DAY_MS
}

/**
 * The compact label: `T-42` before the day, `T-0` on it, `T+3` after. Not translated, like
 * `⌘K` -- it is notation, and the accessible phrase beside it (`app.shell.countdown.*`) is
 * what a screen reader gets. ASCII hyphen: the prototype's non-breaking U+2011 is missing from
 * some fallback fonts and renders as a box, and the row is `whitespace-nowrap` anyway.
 */
export function formatTMinus(days: number): string {
  if (days < 0) return `T+${-days}`
  return `T-${days}`
}
