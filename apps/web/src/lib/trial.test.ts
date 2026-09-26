import { describe, expect, it } from 'vitest'
import { addOneMonth, brusselsToday, trialLastDay } from './trial.ts'

describe('addOneMonth', () => {
  it('lands on the same day next month', () => {
    expect(addOneMonth('2026-09-26')).toBe('2026-10-26')
  })

  it('crosses the year', () => {
    expect(addOneMonth('2026-12-15')).toBe('2027-01-15')
  })

  it('clamps to the end of a shorter month, as Postgres does', () => {
    expect(addOneMonth('2027-01-31')).toBe('2027-02-28')
    expect(addOneMonth('2028-01-31')).toBe('2028-02-29')
    expect(addOneMonth('2026-03-31')).toBe('2026-04-30')
  })
})

describe('trialLastDay', () => {
  it('counts from the day billing starts for a studio made during the demo', () => {
    expect(trialLastDay('2026-09-26', '2027-01-01')).toBe('2027-02-01')
  })

  it('counts from creation once billing is already on', () => {
    expect(trialLastDay('2027-03-10', '2027-01-01')).toBe('2027-04-10')
  })
})

describe('brusselsToday', () => {
  it('is the Brussels date, not the UTC one', () => {
    // 23:30 UTC on 30 June is already 1 July in Brussels (UTC+2 in summer).
    expect(brusselsToday(new Date('2026-06-30T23:30:00Z'))).toBe('2026-07-01')
  })
})
