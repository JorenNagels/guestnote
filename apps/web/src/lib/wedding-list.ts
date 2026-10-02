import type { WeddingSummary } from '@guestnote/db'

/**
 * The weddings list's views and search (spec 0009 C3), pure: rows in, rows out.
 *
 * ## Why here and not in `listWeddings`
 *
 * The repo's read is shared with the sidebar, the palette, Today and the template picker, and
 * for a `member` it is one transaction per assigned wedding (`repos/weddings.ts` argues why), so
 * there is no single `where` to add a search to. A planner's book is tens of weddings, not
 * thousands, and filtering the list they already loaded costs nothing measurable. Rejected: a
 * second, filtered read in the repo -- it would need both tenancy paths written twice, and a
 * test:db run for what is a presentation concern.
 *
 * ## "Today" is an argument
 *
 * The page reads the clock once with `todayCivil()` (Brussels) and passes it in, as
 * `components/tasks/buckets.ts` does: a clock read in here makes the same wedding change view
 * between a UTC Lambda and a laptop. Wedding dates are civil `YYYY-MM-DD` strings, so "before
 * today" is a string comparison -- the format sorts lexicographically by construction.
 */

export const WEDDING_VIEWS = ['upcoming', 'past', 'archived', 'all'] as const
export type WeddingView = (typeof WEDDING_VIEWS)[number]

/** The default, and what an unknown `?view=` falls back to. */
export const DEFAULT_VIEW: WeddingView = 'upcoming'

/**
 * What the helper needs of a row. `venue` stays optional so the tests' rows can leave it out;
 * the repo's `WeddingSummary` always carries it (null when unbooked).
 */
export type ListedWedding = Pick<WeddingSummary, 'coupleDisplayName' | 'weddingDate' | 'status'> & {
  readonly venue?: string | null
}

/** `?view=` to a view. Anything else -- missing, repeated, misspelt -- is the default. */
export function parseView(raw: string | string[] | undefined): WeddingView {
  const value = Array.isArray(raw) ? raw[0] : raw
  return (WEDDING_VIEWS as readonly string[]).includes(value ?? '')
    ? (value as WeddingView)
    : DEFAULT_VIEW
}

/** `?q=` to a trimmed query; repeated takes the first. Empty means no search. */
export function parseQuery(raw: string | string[] | undefined): string {
  return (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? ''
}

/**
 * Lower case with the accents taken off, so "therese" finds "Thérèse" and "Thérèse" finds
 * "THERESE". NFD splits an accented letter into the letter and a combining mark, and `\p{M}`
 * drops the mark. Rejected: `Intl.Collator` with `sensitivity: 'base'` -- it compares whole
 * strings and has no substring search, which is what a search box does.
 */
export function fold(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
}

/**
 * Every word of the query appears somewhere in the couple's name or the venue. Word by word, so
 * "marie thomas" finds "Marie & Thomas", which one substring of the whole query would not.
 */
export function matchesQuery(w: ListedWedding, query: string): boolean {
  const words = fold(query).split(/\s+/).filter(Boolean)
  if (words.length === 0) return true
  const haystack = fold(`${w.coupleDisplayName}\n${w.venue ?? ''}`)
  return words.every((word) => haystack.includes(word))
}

/**
 * The one view a wedding belongs to, `all` aside. Archived wins over the date: an archived
 * wedding next month is not "coming" to anyone. No date counts as coming -- it is a wedding still
 * being planned, which is what this list is mostly for.
 */
export function viewOf(w: ListedWedding, today: string): Exclude<WeddingView, 'all'> {
  if (w.status === 'archived') return 'archived'
  if (w.weddingDate !== null && w.weddingDate < today) return 'past'
  return 'upcoming'
}

// No date sorts as the far future: last when ascending. Descending, `byDateDesc` puts it last
// explicitly rather than by flipping this, which would put it first.
const FAR = '9999-12-31'
const byDateAsc = (a: ListedWedding, b: ListedWedding) =>
  (a.weddingDate ?? FAR).localeCompare(b.weddingDate ?? FAR)
const byDateDesc = (a: ListedWedding, b: ListedWedding) => {
  if (a.weddingDate === null || b.weddingDate === null) {
    return Number(a.weddingDate === null) - Number(b.weddingDate === null)
  }
  return b.weddingDate.localeCompare(a.weddingDate)
}

export type WeddingListResult<T> = {
  readonly rows: readonly T[]
  /** Per view, after the search: where the matches are, not how big the book is. */
  readonly counts: Readonly<Record<WeddingView, number>>
}

/**
 * The rows one view shows, searched and sorted, and every view's count under the same search.
 *
 * The counts follow the search on purpose. A planner who types a name on *Komend* and sees
 * nothing should see *Voorbij 1* beside it, which is where the wedding is; a count of the whole
 * book there would answer a question they did not ask.
 *
 * Coming: soonest first, no date last. Past: most recent first, the one just done is the one
 * still being invoiced. Archived: most recent first, like past. All: coming, then past, then
 * archived, each in its own order -- the sidebar already puts archived last (`components/nav/
 * SPEC.md`), and one date order across all three would bury next week's wedding under ten years
 * of finished ones.
 */
export function weddingList<T extends ListedWedding>(
  all: readonly T[],
  { view, query, today }: { view: WeddingView; query: string; today: string },
): WeddingListResult<T> {
  const upcoming: T[] = []
  const past: T[] = []
  const archived: T[] = []
  for (const w of all) {
    if (!matchesQuery(w, query)) continue
    const bucket = viewOf(w, today)
    ;(bucket === 'upcoming' ? upcoming : bucket === 'past' ? past : archived).push(w)
  }
  upcoming.sort(byDateAsc)
  past.sort(byDateDesc)
  archived.sort(byDateDesc)

  const rows =
    view === 'upcoming'
      ? upcoming
      : view === 'past'
        ? past
        : view === 'archived'
          ? archived
          : [...upcoming, ...past, ...archived]

  return {
    rows,
    counts: {
      upcoming: upcoming.length,
      past: past.length,
      archived: archived.length,
      all: upcoming.length + past.length + archived.length,
    },
  }
}
