import { afterAll, describe, expect, it } from 'vitest'
import { formatCivilDate, formatCivilDay } from './civil-date.ts'

/**
 * **This file runs in New York, on purpose**, for the reason `weddings/[id]/page.test.tsx` gives
 * at length: the `timeZone: 'UTC'` pin only matters WEST of Greenwich, and this machine is on
 * Europe/Brussels, where UTC midnight never renders as the day before. Without the pin here the
 * "never moves the day" assertions below pass with the pin deleted. Restored afterwards, with
 * `delete` when `TZ` was unset (assigning `undefined` back writes the string and lands in UTC).
 */
const REAL_TZ = process.env.TZ
process.env.TZ = 'America/New_York'
afterAll(() => {
  if (REAL_TZ === undefined) delete process.env.TZ
  else process.env.TZ = REAL_TZ
})

describe('formatCivilDate', () => {
  it('writes the long month by default and the short one on request', () => {
    expect(formatCivilDate('en-GB', '2027-06-14')).toBe('14 June 2027')
    expect(formatCivilDate('en-GB', '2027-06-14', 'short')).toBe('14 Jun 2027')
  })

  it('never moves the day, whatever the runtime zone: the date is formatted in UTC', () => {
    expect(formatCivilDate('en-GB', '2027-01-01')).toBe('1 January 2027')
  })
})

describe('formatCivilDay', () => {
  it('names the weekday of the civil date, whatever the runtime zone', () => {
    // 2026-10-03 is a Saturday. Formatted in New York's own zone, UTC midnight is Friday evening.
    expect(formatCivilDay('en-US', '2026-10-03')).toBe('Sat, Oct 3')
    expect(formatCivilDay('nl-BE', '2026-10-03')).toBe('za 3 okt')
  })
})
