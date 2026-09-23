import { describe, expect, it } from 'vitest'
import { daysUntil, formatTMinus, todayCivil } from './tminus.ts'

/**
 * Noon UTC is 13:00 or 14:00 in Brussels, so every `now` below is the same civil day in both
 * zones -- the boundary cases have their own instants further down.
 */
const at = (iso: string) => new Date(iso)

describe('daysUntil', () => {
  it('counts whole civil days, forward', () => {
    expect(daysUntil('2026-10-01', at('2026-09-21T12:00:00Z'))).toBe(10)
  })

  it('is zero on the day, and negative after it', () => {
    expect(daysUntil('2026-09-21', at('2026-09-21T12:00:00Z'))).toBe(0)
    expect(daysUntil('2026-09-18', at('2026-09-21T12:00:00Z'))).toBe(-3)
  })

  /**
   * Across the last-Sunday-of-October DST change (25 hours long in Brussels). A subtraction of
   * local-time instants gives 6.96 days here and `Math.floor` would report 6; two UTC-midnight
   * civil dates give exactly 7.
   */
  it('is not thrown by a daylight-saving change in the span', () => {
    expect(daysUntil('2026-10-31', at('2026-10-24T12:00:00Z'))).toBe(7)
  })

  /**
   * "Today" is the Brussels date. 22:30 UTC on the 20th is 00:30 on the 21st in Brussels
   * (CEST, UTC+2), so a wedding on the 21st is today and not tomorrow. Reading today in UTC
   * gives 1 here, and the countdown lags by a day for the first two hours of every local day.
   */
  it('takes today from Brussels, not from UTC', () => {
    expect(daysUntil('2026-09-21', at('2026-09-20T22:30:00Z'))).toBe(0)
  })

  /** The mirror: 23:30 UTC in winter (CET, UTC+1) is already the next day in Brussels. */
  it('takes today from Brussels in winter too', () => {
    expect(daysUntil('2027-01-16', at('2027-01-15T23:30:00Z'))).toBe(0)
  })

  it('is null for no date, and for a string that is not a civil date', () => {
    expect(daysUntil(null, at('2026-09-21T12:00:00Z'))).toBeNull()
    expect(daysUntil('next summer', at('2026-09-21T12:00:00Z'))).toBeNull()
    expect(daysUntil('2026-9-1', at('2026-09-21T12:00:00Z'))).toBeNull()
  })
})

describe('formatTMinus', () => {
  it('reads T-n before the day, T-0 on it and T+n after', () => {
    expect(formatTMinus(42)).toBe('T-42')
    expect(formatTMinus(0)).toBe('T-0')
    expect(formatTMinus(-3)).toBe('T+3')
  })
})

describe('todayCivil', () => {
  it('reads today in Brussels, not UTC', () => {
    expect(todayCivil(new Date('2027-03-09T23:30:00Z'))).toBe('2027-03-10')
    expect(todayCivil(new Date('2027-03-10T12:00:00Z'))).toBe('2027-03-10')
  })
})
