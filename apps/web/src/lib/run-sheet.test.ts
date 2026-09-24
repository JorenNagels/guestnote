import { describe, expect, it } from 'vitest'
import {
  clockToMinutes,
  computeSchedule,
  GAP_WARN_MIN,
  minutesToClock,
  nextStartClock,
  parseRunSheetForm,
  splitDuration,
} from './run-sheet.ts'

const E = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b'
const V = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5c'

const at = (startsAt: string, durationMin: number) => ({ startsAt, durationMin })

describe('clock maths', () => {
  it('reads HH:MM and nothing looser', () => {
    expect(clockToMinutes('00:00')).toBe(0)
    expect(clockToMinutes('15:30')).toBe(930)
    expect(clockToMinutes('23:59')).toBe(1439)
    for (const bad of ['24:00', '9:30', '15:60', '15:30:00', '', 'noon']) {
      expect(clockToMinutes(bad)).toBeNull()
    }
  })

  it('writes minutes back as a clock that wraps at midnight', () => {
    expect(minutesToClock(930)).toBe('15:30')
    expect(minutesToClock(25 * 60 + 10)).toBe('01:10')
    expect(minutesToClock(24 * 60)).toBe('00:00')
  })

  it('splits a length into hours and minutes', () => {
    expect(splitDuration(40)).toEqual({ h: 0, m: 40 })
    expect(splitDuration(90)).toEqual({ h: 1, m: 30 })
    expect(splitDuration(120)).toEqual({ h: 2, m: 0 })
  })
})

describe('computeSchedule', () => {
  it('computes the end of each item', () => {
    const [a, b] = computeSchedule([at('15:30', 40), at('16:10', 20)])
    expect(a?.endClock).toBe('16:10')
    expect(b?.endClock).toBe('16:30')
  })

  it('says nothing about the first row, or about back-to-back rows', () => {
    const [a, b] = computeSchedule([at('15:30', 40), at('16:10', 20)])
    expect(a).toMatchObject({ gapMin: null, overlapMin: null })
    expect(b).toMatchObject({ gapMin: null, overlapMin: null })
  })

  it('reports the gap in minutes', () => {
    const [, b] = computeSchedule([at('15:30', 30), at('16:45', 20)])
    expect(b).toMatchObject({ gapMin: 45, overlapMin: null })
  })

  it('reports an overlap in minutes', () => {
    const [, b] = computeSchedule([at('15:30', 40), at('15:50', 20)])
    expect(b).toMatchObject({ overlapMin: 20, gapMin: null })
  })

  it('measures against the latest end so far, not the previous row', () => {
    // The lunch runs to 15:00; the 14:00 speech is inside it even though the row between
    // them ended at 12:30, so comparing neighbours only would call it clear.
    const rows = computeSchedule([at('12:00', 180), at('12:15', 15), at('14:00', 10)])
    expect(rows[2]).toMatchObject({ overlapMin: 60, gapMin: null })
  })

  it('reads a start earlier than the one above as after midnight', () => {
    const rows = computeSchedule([at('21:00', 60), at('23:30', 30), at('00:15', 30)])
    expect(rows.map((r) => r.startDay)).toEqual([0, 0, 1])
    // 23:30 + 30 ends at midnight, so 00:15 is a quarter of an hour clear, not 23 hours early.
    expect(rows[2]).toMatchObject({ startAbs: 24 * 60 + 15, endClock: '00:45', gapMin: 15 })
  })

  it('marks an item that ends after midnight, and leaves the start on the first day', () => {
    const [a] = computeSchedule([at('23:30', 60)])
    expect(a).toMatchObject({ startDay: 0, endDay: 1, endClock: '00:30' })
  })

  it('a rollover does not raise a false overlap or a false gap', () => {
    // 23:30 + 30 ends at exactly midnight, and the next item starts at 00:00 the next day.
    const [, b] = computeSchedule([at('23:30', 30), at('00:00', 15)])
    expect(b).toMatchObject({ gapMin: null, overlapMin: null, startDay: 1 })
  })

  it('exposes the threshold the view uses to call a pause a warning', () => {
    expect(GAP_WARN_MIN).toBe(30)
  })
})

describe('nextStartClock', () => {
  it('is where the last item ends, and 09:00 for an empty sheet', () => {
    expect(nextStartClock([at('15:30', 40)])).toBe('16:10')
    expect(nextStartClock([])).toBe('09:00')
  })
})

describe('parseRunSheetForm', () => {
  const ok = {
    eventId: E,
    startsAt: '15:30',
    durationMin: '40',
    title: '  Ceremony ',
    place: '',
    weddingVendorId: '',
  }

  it('accepts a full form and normalises it', () => {
    expect(parseRunSheetForm(ok)).toEqual({
      eventId: E,
      input: {
        startsAt: '15:30',
        durationMin: 40,
        title: 'Ceremony',
        place: null,
        weddingVendorId: null,
      },
    })
    expect(parseRunSheetForm({ ...ok, place: ' Garden ', weddingVendorId: V })).toMatchObject({
      input: { place: 'Garden', weddingVendorId: V },
    })
  })

  it('names the field that is wrong', () => {
    expect(parseRunSheetForm({ ...ok, eventId: 'nope' })).toEqual({ error: 'event' })
    expect(parseRunSheetForm({ ...ok, startsAt: '25:00' })).toEqual({ error: 'time' })
    expect(parseRunSheetForm({ ...ok, startsAt: '' })).toEqual({ error: 'time' })
    expect(parseRunSheetForm({ ...ok, title: '   ' })).toEqual({ error: 'title' })
    expect(parseRunSheetForm({ ...ok, title: 'x'.repeat(121) })).toEqual({ error: 'title' })
    expect(parseRunSheetForm({ ...ok, place: 'x'.repeat(121) })).toEqual({ error: 'place' })
    expect(parseRunSheetForm({ ...ok, weddingVendorId: 'nope' })).toEqual({ error: 'vendor' })
  })

  it('takes a length of 1 to 1440 whole minutes', () => {
    expect(parseRunSheetForm({ ...ok, durationMin: '1' })).toMatchObject({
      input: { durationMin: 1 },
    })
    expect(parseRunSheetForm({ ...ok, durationMin: '1440' })).toMatchObject({
      input: { durationMin: 1440 },
    })
    for (const bad of ['0', '-5', '1441', '12.5', '', 'abc', '99999']) {
      expect(parseRunSheetForm({ ...ok, durationMin: bad })).toEqual({ error: 'duration' })
    }
  })

  it('refuses a body that is not an object, and non-string fields', () => {
    expect(parseRunSheetForm(null)).toEqual({ error: 'failed' })
    expect(parseRunSheetForm('x')).toEqual({ error: 'failed' })
    expect(parseRunSheetForm({ ...ok, title: 5 })).toEqual({ error: 'title' })
  })
})

describe('parseRunSheetForm, the owner (spec 0004)', () => {
  const ok = {
    eventId: E,
    startsAt: '15:30',
    durationMin: '40',
    title: 'Ceremony',
    place: '',
    weddingVendorId: '',
  }
  const input = (over: object) => {
    const r = parseRunSheetForm({ ...ok, ...over })
    return 'input' in r ? r.input : r
  }

  it('leaves the owner out when the form did not send one, so an update keeps it', () => {
    expect('ownerUserId' in (input({}) as object)).toBe(false)
  })

  it('reads empty as nobody, trims a uuid, and refuses anything else', () => {
    expect(input({ ownerUserId: '' })).toMatchObject({ ownerUserId: null })
    expect(input({ ownerUserId: `  ${E}  ` })).toMatchObject({ ownerUserId: E })
    expect(parseRunSheetForm({ ...ok, ownerUserId: 'x' })).toEqual({ error: 'owner' })
  })
})
