import type { AssignedTaskRow, WeddingSummary } from '@guestnote/db'
import { describe, expect, it } from 'vitest'
import { task } from '../tasks/fixture.ts'
import { orderWeddings, todaySections, weddingLoads } from './sections.ts'

const TODAY = '2026-09-21'

let n = 0
const row = (over: Partial<AssignedTaskRow> = {}): AssignedTaskRow => ({
  ...task({ id: `t${++n}`, title: `Task ${n}` }),
  weddingName: 'Emma & Joren',
  weddingDate: '2027-07-31',
  ...over,
})

const ids = (rows: readonly AssignedTaskRow[]) => rows.map((r) => r.id)

describe('todaySections', () => {
  it('puts today and anything earlier under needs-you, most overdue first', () => {
    const late = row({ id: 'late', dueDate: '2026-09-10' })
    const now = row({ id: 'now', dueDate: TODAY })
    const later = row({ id: 'later', dueDate: '2026-09-19' })
    const s = todaySections([now, later, late], TODAY)
    expect(ids(s.needsYou)).toEqual(['late', 'later', 'now'])
    expect(s.dueWeek).toEqual([])
  })

  it('starts the week tomorrow and ends it at today + 7, both inclusive', () => {
    const s = todaySections(
      [
        row({ id: 'today', dueDate: '2026-09-21' }),
        row({ id: 'tomorrow', dueDate: '2026-09-22' }),
        row({ id: 'day7', dueDate: '2026-09-28' }),
        row({ id: 'day8', dueDate: '2026-09-29' }),
      ],
      TODAY,
    )
    expect(ids(s.needsYou)).toEqual(['today'])
    expect(ids(s.dueWeek)).toEqual(['tomorrow', 'day7'])
    expect(ids(s.next)).toEqual(['day8'])
  })

  it('shows only the next five beyond the week, soonest first', () => {
    const far = Array.from({ length: 8 }, (_, i) =>
      row({ id: `f${i}`, dueDate: `2026-10-${String(10 + (7 - i)).padStart(2, '0')}` }),
    )
    expect(ids(todaySections(far, TODAY).next)).toEqual(['f7', 'f6', 'f5', 'f4', 'f3'])
  })

  it('counts undated tasks instead of listing them', () => {
    const s = todaySections(
      [row({ dueDate: null }), row({ dueDate: null, dueOffsetDays: -10 }), row({ dueDate: TODAY })],
      TODAY,
    )
    expect(s.undated).toBe(2)
    expect(s.needsYou).toHaveLength(1)
  })

  it('drops a done task even if the caller passed one', () => {
    const s = todaySections([row({ status: 'done', dueDate: '2026-09-01' })], TODAY)
    expect(s.needsYou).toEqual([])
    expect(s.undated).toBe(0)
  })

  it('breaks a date tie by title, then id, so a reload never reshuffles', () => {
    const s = todaySections(
      [
        row({ id: 'b', title: 'Same', dueDate: TODAY }),
        row({ id: 'a', title: 'Same', dueDate: TODAY }),
        row({ id: 'c', title: 'Alpha', dueDate: TODAY }),
      ],
      TODAY,
    )
    expect(ids(s.needsYou)).toEqual(['c', 'a', 'b'])
  })

  // The repo resolves an offset task's date from the wedding, and `dueAt` may be stale. The
  // screen must read `dueDate` and never the stored instant.
  it('trusts the resolved dueDate over a stale dueAt', () => {
    const stale = row({
      id: 'moved',
      dueOffsetDays: -7,
      dueAt: new Date('2027-07-24T12:00:00Z'),
      dueDate: '2026-09-22',
    })
    const s = todaySections([stale], TODAY)
    expect(ids(s.dueWeek)).toEqual(['moved'])
    expect(s.next).toEqual([])
  })
})

describe('weddingLoads', () => {
  it('counts open and overdue per wedding, and leaves a wedding with none out', () => {
    const loads = weddingLoads(
      [
        row({ weddingId: 'w1', dueDate: '2026-09-01' }),
        row({ weddingId: 'w1', dueDate: TODAY }),
        row({ weddingId: 'w1', dueDate: null }),
        row({ weddingId: 'w2', dueDate: '2026-12-01' }),
        row({ weddingId: 'w2', status: 'done', dueDate: '2026-09-01' }),
      ],
      TODAY,
    )
    expect(loads).toEqual({ w1: { overdue: 1, open: 3 }, w2: { overdue: 0, open: 1 } })
  })
})

const wedding = (over: Partial<WeddingSummary>): WeddingSummary => ({
  id: 'w',
  slug: 'w',
  status: 'draft',
  coupleDisplayName: 'W',
  weddingDate: null,
  color: null,
  ...over,
})

describe('orderWeddings', () => {
  it('leaves archived weddings out', () => {
    const list = orderWeddings(
      [wedding({ id: 'a', status: 'archived', weddingDate: '2027-01-01' }), wedding({ id: 'b' })],
      TODAY,
    )
    expect(list.map((w) => w.id)).toEqual(['b'])
  })

  it('orders ahead-soonest, then undated, then past most-recent-first', () => {
    const list = orderWeddings(
      [
        wedding({ id: 'past-old', weddingDate: '2026-03-01' }),
        wedding({ id: 'undated' }),
        wedding({ id: 'later', weddingDate: '2027-07-31' }),
        wedding({ id: 'past-new', weddingDate: '2026-09-12' }),
        wedding({ id: 'today', weddingDate: TODAY }),
        wedding({ id: 'soon', weddingDate: '2026-10-03' }),
      ],
      TODAY,
    )
    expect(list.map((w) => w.id)).toEqual([
      'today',
      'soon',
      'later',
      'undated',
      'past-new',
      'past-old',
    ])
  })
})
