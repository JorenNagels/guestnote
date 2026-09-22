import { describe, expect, it } from 'vitest'
import { clockInsertIndex, firstRolloverIndex } from './run-sheet.ts'

describe('firstRolloverIndex', () => {
  it('is the length when the clock only goes forward, equal times included', () => {
    expect(firstRolloverIndex([])).toBe(0)
    expect(firstRolloverIndex(['09:00'])).toBe(1)
    expect(firstRolloverIndex(['09:00', '09:00', '10:30'])).toBe(3)
  })

  it('is the first item whose clock is earlier than the one before it', () => {
    expect(firstRolloverIndex(['20:00', '23:30', '01:15', '02:00'])).toBe(2)
  })
})

describe('clockInsertIndex', () => {
  it('goes before the first item that starts later', () => {
    expect(clockInsertIndex(['09:00', '11:00', '14:00'], '10:00')).toBe(1)
    expect(clockInsertIndex(['09:00', '11:00', '14:00'], '08:00')).toBe(0)
  })

  it('goes after items that start at the same time, so a typed run keeps its order', () => {
    expect(clockInsertIndex(['09:00', '09:00', '11:00'], '09:00')).toBe(2)
  })

  it('goes at the end when nothing starts later, and into an empty list', () => {
    expect(clockInsertIndex(['09:00', '11:00'], '12:00')).toBe(2)
    expect(clockInsertIndex([], '12:00')).toBe(0)
  })

  it('does not look past the first midnight rollover', () => {
    // 22:30 belongs after the 21:00 and before the 01:30 that is already after midnight. Nothing
    // is "later" than 22:30, so a search over the whole list would fall off the end and answer 3;
    // stopping at the rollover is what makes it 2.
    expect(clockInsertIndex(['20:00', '21:00', '01:30'], '22:30')).toBe(2)
    // Before the rollover it still sorts normally.
    expect(clockInsertIndex(['20:00', '21:00', '01:30'], '20:30')).toBe(1)
  })

  it('puts a time earlier than the whole evening at the very start', () => {
    // Ambiguous by nature (07:00 prep, or 01:00 after midnight); the start is the default and
    // the planner moves it down. The SPEC says so.
    expect(clockInsertIndex(['20:00', '21:00', '01:30'], '01:00')).toBe(0)
  })
})
