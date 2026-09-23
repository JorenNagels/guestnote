import { describe, expect, it } from 'vitest'
import { formatCivilDate } from './civil-date.ts'

describe('formatCivilDate', () => {
  it('writes the long month by default and the short one on request', () => {
    expect(formatCivilDate('en-GB', '2027-06-14')).toBe('14 June 2027')
    expect(formatCivilDate('en-GB', '2027-06-14', 'short')).toBe('14 Jun 2027')
  })

  it('never moves the day, whatever the runtime zone: the date is formatted in UTC', () => {
    expect(formatCivilDate('en-GB', '2027-01-01')).toBe('1 January 2027')
  })
})
