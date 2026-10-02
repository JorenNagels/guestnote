import { describe, expect, it } from 'vitest'
import {
  fold,
  type ListedWedding,
  matchesQuery,
  parseQuery,
  parseView,
  viewOf,
  weddingList,
} from './wedding-list.ts'

const TODAY = '2026-10-02'

type Row = ListedWedding & { readonly id: string }
const row = (
  id: string,
  weddingDate: string | null,
  status = 'live',
  coupleDisplayName = id,
  venue: string | null = null,
): Row => ({ id, coupleDisplayName, weddingDate, status, venue })

const ids = (rows: readonly Row[]) => rows.map((r) => r.id)

describe('viewOf', () => {
  it('puts today itself in upcoming, and yesterday in past', () => {
    expect(viewOf(row('a', TODAY), TODAY)).toBe('upcoming')
    expect(viewOf(row('a', '2026-10-01'), TODAY)).toBe('past')
    expect(viewOf(row('a', '2026-10-03'), TODAY)).toBe('upcoming')
  })

  it('puts a wedding with no date in upcoming', () => {
    expect(viewOf(row('a', null), TODAY)).toBe('upcoming')
  })

  it('puts an archived wedding in archived whatever its date', () => {
    expect(viewOf(row('a', '2027-01-01', 'archived'), TODAY)).toBe('archived')
    expect(viewOf(row('a', '2020-01-01', 'archived'), TODAY)).toBe('archived')
    expect(viewOf(row('a', null, 'archived'), TODAY)).toBe('archived')
  })

  it('treats a draft like a live wedding', () => {
    expect(viewOf(row('a', '2020-01-01', 'draft'), TODAY)).toBe('past')
  })
})

describe('parseView and parseQuery', () => {
  it('reads the four views and falls back to upcoming for anything else', () => {
    expect(parseView('past')).toBe('past')
    expect(parseView('archived')).toBe('archived')
    expect(parseView('all')).toBe('all')
    expect(parseView(['past', 'all'])).toBe('past')
    expect(parseView('voorbij')).toBe('upcoming')
    expect(parseView('')).toBe('upcoming')
    expect(parseView(undefined)).toBe('upcoming')
  })

  it('trims the query and takes the first of a repeated one', () => {
    expect(parseQuery('  Janssens ')).toBe('Janssens')
    expect(parseQuery(['a', 'b'])).toBe('a')
    expect(parseQuery(undefined)).toBe('')
  })
})

describe('matchesQuery', () => {
  const therese = row('t', null, 'live', 'Thérèse & Joël', 'Kasteel van Gaasbeek')

  it('ignores accents and case in either direction', () => {
    expect(fold('Thérèse')).toBe('therese')
    expect(matchesQuery(therese, 'therese')).toBe(true)
    expect(matchesQuery(therese, 'THÉRÈSE')).toBe(true)
    expect(matchesQuery(row('x', null, 'live', 'THERESE'), 'thérèse')).toBe(true)
  })

  it('matches every word anywhere, across the name and the venue', () => {
    expect(matchesQuery(therese, 'joel therese')).toBe(true)
    expect(matchesQuery(therese, 'gaasbeek')).toBe(true)
    expect(matchesQuery(therese, 'joel gaasbeek')).toBe(true)
    expect(matchesQuery(therese, 'joel brugge')).toBe(false)
  })

  it('matches everything on an empty or blank query', () => {
    expect(matchesQuery(therese, '')).toBe(true)
    expect(matchesQuery(therese, '   ')).toBe(true)
  })

  it('does not match a word split across the name and the venue', () => {
    // "joël" ends the name and "kasteel" starts the venue: joined without a separator they
    // would read "joelkasteel", and a query of "elka" would match a wedding it has nothing to do with.
    expect(matchesQuery(therese, 'elka')).toBe(false)
  })
})

describe('weddingList', () => {
  const book = [
    row('soon', '2026-10-10'),
    row('today', TODAY),
    row('undated', null),
    row('later', '2027-06-12'),
    row('yesterday', '2026-10-01'),
    row('lastYear', '2025-09-20'),
    row('archivedOld', '2024-05-01', 'archived'),
    row('archivedNew', '2026-08-01', 'archived'),
    row('archivedUndated', null, 'archived'),
  ]
  const list = (view: 'upcoming' | 'past' | 'archived' | 'all', query = '') =>
    weddingList(book, { view, query, today: TODAY })

  it('upcoming: soonest first, today included, no date last', () => {
    expect(ids(list('upcoming').rows)).toEqual(['today', 'soon', 'later', 'undated'])
  })

  it('past: most recent first', () => {
    expect(ids(list('past').rows)).toEqual(['yesterday', 'lastYear'])
  })

  it('archived: most recent first, no date last', () => {
    expect(ids(list('archived').rows)).toEqual(['archivedNew', 'archivedOld', 'archivedUndated'])
  })

  it('all: upcoming, then past, then archived, each in its own order', () => {
    expect(ids(list('all').rows)).toEqual([
      'today',
      'soon',
      'later',
      'undated',
      'yesterday',
      'lastYear',
      'archivedNew',
      'archivedOld',
      'archivedUndated',
    ])
  })

  it('counts every view, whichever one is shown', () => {
    expect(list('past').counts).toEqual({ upcoming: 4, past: 2, archived: 3, all: 9 })
  })

  it('counts and shows only what the search matches', () => {
    const rows = [
      row('a', '2026-12-01', 'live', 'Thérèse & Joël'),
      row('b', '2025-01-01', 'live', 'Therese & Tom'),
      row('c', '2026-12-01', 'live', 'Marie & Thomas'),
    ]
    const result = weddingList(rows, { view: 'upcoming', query: 'therese', today: TODAY })
    expect(ids(result.rows)).toEqual(['a'])
    expect(result.counts).toEqual({ upcoming: 1, past: 1, archived: 0, all: 2 })
  })
})
