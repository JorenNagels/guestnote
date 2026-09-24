import { describe, expect, it } from 'vitest'
import { dueLabel, ruleLabel } from './labels.ts'

const TODAY = '2027-03-10'
const open = { status: 'open', dueOffsetDays: null } as const

describe('dueLabel', () => {
  it('names today, tomorrow, overdue and ahead', () => {
    expect(dueLabel({ ...open, dueDate: TODAY }, TODAY)).toEqual({ key: 'due.today' })
    expect(dueLabel({ ...open, dueDate: '2027-03-11' }, TODAY)).toEqual({ key: 'due.tomorrow' })
    expect(dueLabel({ ...open, dueDate: '2027-03-07' }, TODAY)).toEqual({
      key: 'due.overdueDays',
      values: { days: 3 },
    })
    expect(dueLabel({ ...open, dueDate: '2027-03-20' }, TODAY)).toEqual({
      key: 'due.inDays',
      values: { days: 10 },
    })
  })

  it('says why an offset task has no date, and says nothing extra for a plain undated one', () => {
    expect(dueLabel({ status: 'open', dueOffsetDays: -14, dueDate: null }, TODAY)).toEqual({
      key: 'row.noWeddingDate',
    })
    expect(dueLabel({ ...open, dueDate: null }, TODAY)).toEqual({ key: 'row.noDue' })
  })

  it('is null for a done task', () => {
    expect(
      dueLabel({ status: 'done', dueOffsetDays: null, dueDate: '2027-01-01' }, TODAY),
    ).toBeNull()
  })
})

describe('ruleLabel', () => {
  const at = new Date('2027-03-10T12:00:00Z')
  it('states before, after and on the day', () => {
    expect(ruleLabel({ dueOffsetDays: -14, dueAt: at })).toEqual({
      key: 'rule.before',
      values: { days: 14 },
    })
    expect(ruleLabel({ dueOffsetDays: 3, dueAt: at })).toEqual({
      key: 'rule.after',
      values: { days: 3 },
    })
    expect(ruleLabel({ dueOffsetDays: 0, dueAt: at })).toEqual({ key: 'rule.onDay' })
  })

  it('names the anchor when there is one (spec 0004), on the day as well', () => {
    const anchored = { dueAt: at, anchorLabel: 'Civil' }
    expect(ruleLabel({ ...anchored, dueOffsetDays: -14 })).toEqual({
      key: 'rule.anchorBefore',
      values: { days: 14, anchor: 'Civil' },
    })
    expect(ruleLabel({ ...anchored, dueOffsetDays: 2 })).toEqual({
      key: 'rule.anchorAfter',
      values: { days: 2, anchor: 'Civil' },
    })
    expect(ruleLabel({ ...anchored, dueOffsetDays: 0 })).toEqual({
      key: 'rule.anchorOnDay',
      values: { days: 0, anchor: 'Civil' },
    })
  })

  it('calls a stored date with no offset fixed, and nothing when there is neither', () => {
    expect(ruleLabel({ dueOffsetDays: null, dueAt: at })).toEqual({ key: 'rule.fixed' })
    expect(ruleLabel({ dueOffsetDays: null, dueAt: null })).toBeNull()
  })
})
