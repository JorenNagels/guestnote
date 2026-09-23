import { describe, expect, it } from 'vitest'
import { resolveTaskDueDate, taskAddDays, taskDueColumns } from './task-dates.ts'
import { compareTasks, type TaskRow } from './tasks.ts'

describe('taskAddDays', () => {
  it('crosses month, year and leap-day boundaries in UTC', () => {
    expect(taskAddDays('2027-07-31', -30)).toBe('2027-07-01')
    expect(taskAddDays('2027-01-01', -1)).toBe('2026-12-31')
    expect(taskAddDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(taskAddDays('2027-02-28', 1)).toBe('2027-03-01')
  })

  it('does not drift over a European daylight-saving change', () => {
    // 2027-03-28 is the spring-forward Sunday; a local-time day would be 23 hours long.
    expect(taskAddDays('2027-03-27', 2)).toBe('2027-03-29')
  })

  it('refuses a date that only exists after rolling over', () => {
    expect(() => taskAddDays('2027-02-31', 0)).toThrow(/not a calendar date/)
    expect(() => taskAddDays('27-02-01', 0)).toThrow(/not a calendar date/)
  })
})

describe('resolveTaskDueDate', () => {
  const stale = new Date('2020-01-01T12:00:00Z')

  it('lets the offset beat a stored due_at, so a moved wedding takes its tasks with it', () => {
    expect(resolveTaskDueDate({ dueOffsetDays: -7, dueAt: stale }, '2027-07-31')).toBe('2027-07-24')
  })

  it('has no date for an offset when the wedding has none, rather than the stale due_at', () => {
    expect(resolveTaskDueDate({ dueOffsetDays: -7, dueAt: stale }, null)).toBeNull()
  })

  it('reads a fixed date off due_at in UTC', () => {
    expect(resolveTaskDueDate({ dueOffsetDays: null, dueAt: stale }, '2027-07-31')).toBe(
      '2020-01-01',
    )
    expect(resolveTaskDueDate({ dueOffsetDays: null, dueAt: null }, '2027-07-31')).toBeNull()
  })

  it('treats an offset of zero as an offset, not as absent', () => {
    expect(resolveTaskDueDate({ dueOffsetDays: 0, dueAt: stale }, '2027-07-31')).toBe('2027-07-31')
  })
})

describe('taskDueColumns', () => {
  it('writes offset and due_at together for an offset, at noon UTC', () => {
    expect(taskDueColumns({ kind: 'offset', days: -30 }, '2027-07-31')).toEqual({
      dueOffsetDays: -30,
      dueAt: new Date('2027-07-01T12:00:00Z'),
    })
  })

  it('writes no offset for a fixed date, so it stays put', () => {
    expect(taskDueColumns({ kind: 'date', date: '2027-02-28' }, '2027-07-31')).toEqual({
      dueOffsetDays: null,
      dueAt: new Date('2027-02-28T12:00:00Z'),
    })
  })

  it('clears both for none', () => {
    expect(taskDueColumns({ kind: 'none' }, '2027-07-31')).toEqual({
      dueOffsetDays: null,
      dueAt: null,
    })
  })

  it('rejects a fractional or absurd offset before it reaches the database', () => {
    expect(() => taskDueColumns({ kind: 'offset', days: 1.5 }, null)).toThrow(/whole number/)
    expect(() => taskDueColumns({ kind: 'offset', days: 36500 }, null)).toThrow(/whole number/)
  })
})

describe('compareTasks', () => {
  const row = (title: string, dueDate: string | null) => ({ title, dueDate }) as TaskRow

  it('puts the earlier date first, undated last, then orders by title', () => {
    const sorted = [
      row('b', null),
      row('z', '2027-01-02'),
      row('a', '2027-01-02'),
      row('m', '2027-01-01'),
    ].sort(compareTasks)
    expect(sorted.map((r) => r.title)).toEqual(['m', 'a', 'z', 'b'])
  })
})
