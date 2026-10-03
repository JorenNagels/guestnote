/**
 * Days until a wedding, for the countdown in the sidebar, on Today and in the wedding header.
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

/** Today as `YYYY-MM-DD` in Brussels. The one place that decides what "today" is. */
export function todayCivil(now: Date = new Date()): string {
  return BRUSSELS_DAY.format(now)
}

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
  const today = civilMs(todayCivil(now))
  if (target === null || today === null) return null
  return (target - today) / DAY_MS
}

/**
 * The countdown in words: "Over 42 dagen", "Morgen", "Vandaag", "3 dagen geleden" -- "In 42
 * days" and "Dans 42 jours" in the other two locales. One form everywhere it is shown (the
 * sidebar row, the Today card, the wedding header), so a planner reads the same phrase for the
 * same wedding wherever she meets it, and the visible text is the accessible text.
 *
 * This replaced the `T-42` / `T-0` / `T+3` notation on 2026-10-04, at the user's request: it is
 * jargon a couple or a new planner has to learn, and it needed a second, screen-reader-only
 * phrase beside it, so every site carried two strings that could drift apart.
 *
 * `Intl.RelativeTimeFormat` with `numeric: 'auto'`, not message-catalogue templates: it gets the
 * plural right in every locale and names the near days ("morgen", "overmorgen", "gisteren") for
 * nothing, and it is in the browser already, so the sidebar -- a client component -- carries no
 * ICU runtime for it. The cost is that the wording is CLDR's rather than ours, and that a
 * browser's ICU could phrase a day differently from Node's; the sidebar's node is
 * `suppressHydrationWarning` for the midnight case already, which covers that too.
 *
 * Days only, never weeks or months: tasks fall due on days, and "over 5 maanden" would make a
 * 140-day and a 160-day wedding read the same while every due date under them differs.
 *
 * `inline` is for a phrase set inside other text (the header puts it after the date, in
 * brackets), where CLDR's lower case is right. Everywhere else the phrase starts its own line,
 * so its first letter is raised.
 */
const RELATIVE = new Map<string, Intl.RelativeTimeFormat>()

export function formatCountdown(days: number, locale: string, inline = false): string {
  let format = RELATIVE.get(locale)
  if (format === undefined) {
    format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
    RELATIVE.set(locale, format)
  }
  const phrase = format.format(days, 'day')
  return inline ? phrase : phrase.charAt(0).toLocaleUpperCase(locale) + phrase.slice(1)
}
