import { taskAddDays } from '@guestnote/db'
import { describe, expect, it } from 'vitest'
import { addDaysCivil, formatOffset } from './template-preview.ts'

describe('addDaysCivil', () => {
  it('adds and subtracts whole days across a month and year boundary', () => {
    expect(addDaysCivil('2027-01-01', -1)).toBe('2026-12-31')
    expect(addDaysCivil('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDaysCivil('2027-07-31', -300)).toBe('2026-10-04')
  })

  it("pins to the repo's own arithmetic (taskAddDays), so the preview cannot drift from apply", () => {
    for (const [date, days] of [
      ['2027-07-31', -300],
      ['2027-07-31', -240],
      ['2026-01-01', 3650],
      ['2030-01-01', -3650],
    ] as const) {
      expect(addDaysCivil(date, days)).toBe(taskAddDays(date, days))
    }
  })

  it('is null-safe: no wedding date means no preview', () => {
    expect(addDaysCivil(null, -10)).toBeNull()
  })

  it('refuses anything that is not a calendar date, rather than let Date.parse roll it over', () => {
    expect(addDaysCivil('2027-02-31', 0)).toBeNull()
    expect(addDaysCivil('31-07-2027', 0)).toBeNull()
    expect(addDaysCivil('not-a-date', 0)).toBeNull()
    expect(addDaysCivil('', 0)).toBeNull()
  })
})

describe('formatOffset', () => {
  it('renders the T-minus notation', () => {
    expect(formatOffset(-180)).toBe('T-180')
    expect(formatOffset(0)).toBe('T-0')
    expect(formatOffset(3)).toBe('T+3')
  })
})
