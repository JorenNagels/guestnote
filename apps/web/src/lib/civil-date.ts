/**
 * A civil date (`YYYY-MM-DD`, a Postgres `date`) for display: "14 juni 2027", or with
 * `month: 'short'`, "14 jun 2027" for a column of dates.
 *
 * UTC on purpose: a civil date read as UTC midnight renders as the day before in any zone west
 * of Greenwich if formatted locally (`weddings/[id]/page.test.tsx` pins it).
 *
 * One function, `(locale, iso)`. There used to be two with the argument order swapped, and
 * since both are strings a wrong import still typechecked (PR #1 review).
 */
export function formatCivilDate(
  locale: string,
  iso: string,
  month: 'long' | 'short' = 'long',
): string {
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month,
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${iso}T00:00:00Z`))
}

/**
 * A civil date as a short day name, "za 3 okt": the weekday is what a planner checks a date
 * against ("the Saturday, yes"), and the year is noise on a button about one wedding's day.
 * UTC for the reason above.
 */
export function formatCivilDay(locale: string, iso: string): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(`${iso}T00:00:00Z`))
}
