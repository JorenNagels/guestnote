import { describe, expect, it } from 'vitest'
import {
  addDays,
  bucketOf,
  daysBetween,
  filterCounts,
  groupTasks,
  parseFilter,
  todayCivil,
} from './buckets.ts'
import { task } from './fixture.ts'

const TODAY = '2027-03-10'

describe('bucketOf', () => {
  it('puts yesterday in overdue and today in soon', () => {
    expect(bucketOf(task({ dueDate: '2027-03-09' }), TODAY)).toBe('overdue')
    expect(bucketOf(task({ dueDate: TODAY }), TODAY)).toBe('soon')
  })

  // The boundary that decides which side of the fold a task lands on: +14 is still "soon".
  it('keeps today + 14 in soon and starts later at + 15', () => {
    expect(bucketOf(task({ dueDate: '2027-03-24' }), TODAY)).toBe('soon')
    expect(bucketOf(task({ dueDate: '2027-03-25' }), TODAY)).toBe('later')
  })

  it('puts an open task with no date in undated', () => {
    expect(bucketOf(task({ dueDate: null }), TODAY)).toBe('undated')
  })

  it('puts a done task in done whatever its date, so a finished overdue task is not red', () => {
    expect(bucketOf(task({ status: 'done', dueDate: '2027-01-01' }), TODAY)).toBe('done')
    expect(bucketOf(task({ status: 'done', dueDate: null }), TODAY)).toBe('done')
  })

  it('treats in_progress as open', () => {
    expect(bucketOf(task({ status: 'in_progress', dueDate: '2027-01-01' }), TODAY)).toBe('overdue')
  })
})

describe('parseFilter', () => {
  it('accepts the five names and falls back to all', () => {
    expect(parseFilter('overdue')).toBe('overdue')
    expect(parseFilter('internal')).toBe('internal')
    expect(parseFilter('nonsense')).toBe('all')
    expect(parseFilter(undefined)).toBe('all')
    // A repeated `?filter=a&filter=b` arrives as an array.
    expect(parseFilter(['shared', 'open'])).toBe('shared')
  })
})

describe('filterCounts', () => {
  const tasks = [
    task({ id: 'a', dueDate: '2027-03-01' }),
    task({ id: 'b', dueDate: '2027-04-01', visibility: 'internal' }),
    task({ id: 'c', status: 'done', dueDate: '2027-03-01', visibility: 'internal' }),
    task({ id: 'd', dueDate: null }),
  ]

  it('counts the whole wedding per filter', () => {
    expect(filterCounts(tasks, TODAY)).toEqual({
      all: 4,
      open: 3,
      overdue: 1,
      internal: 2,
      shared: 2,
    })
  })
})

describe('groupTasks', () => {
  const tasks = [
    task({ id: 'late', dueDate: '2027-03-01' }),
    task({ id: 'soon', dueDate: '2027-03-12' }),
    task({ id: 'later', dueDate: '2027-06-01' }),
    task({ id: 'none', dueDate: null }),
    task({ id: 'done', status: 'done', dueDate: '2027-03-12' }),
  ]

  it('orders the buckets and drops the empty ones', () => {
    expect(groupTasks(tasks, 'all', TODAY).map((g) => g.bucket)).toEqual([
      'overdue',
      'soon',
      'later',
      'undated',
      'done',
    ])
    expect(groupTasks(tasks.slice(0, 1), 'all', TODAY).map((g) => g.bucket)).toEqual(['overdue'])
  })

  it('applies the filter before grouping', () => {
    const groups = groupTasks(tasks, 'open', TODAY)
    expect(groups.map((g) => g.bucket)).not.toContain('done')
    expect(groupTasks(tasks, 'overdue', TODAY).flatMap((g) => g.tasks.map((t) => t.id))).toEqual([
      'late',
    ])
  })

  it('keeps the input order inside a bucket', () => {
    const two = [task({ id: 'x', dueDate: '2027-03-11' }), task({ id: 'y', dueDate: '2027-03-12' })]
    expect(groupTasks(two, 'all', TODAY)[0]?.tasks.map((t) => t.id)).toEqual(['x', 'y'])
  })
})

describe('dates', () => {
  it('adds and subtracts whole days across a month and a leap day', () => {
    expect(addDays('2028-02-28', 2)).toBe('2028-03-01')
    expect(addDays('2027-03-01', -1)).toBe('2027-02-28')
    expect(daysBetween('2027-03-10', '2027-03-24')).toBe(14)
    expect(daysBetween('2027-03-10', '2027-03-09')).toBe(-1)
  })

  // 23:30 UTC on 9 March is 00:30 on 10 March in Brussels (CET, UTC+1): the planner's today.
  it('reads today in Brussels, not UTC', () => {
    expect(todayCivil(new Date('2027-03-09T23:30:00Z'))).toBe('2027-03-10')
    expect(todayCivil(new Date('2027-03-10T12:00:00Z'))).toBe('2027-03-10')
  })
})
