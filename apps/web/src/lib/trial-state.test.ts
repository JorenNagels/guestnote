import { describe, expect, it } from 'vitest'
import { addOneMonth, brusselsToday, trialEndsOn, trialLastDay, trialState } from './trial-state.ts'

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

const ON = { on: true, from: '2027-01-01' } as const
const at = (iso: string) => new Date(iso)
const facts = (createdAt: string, extra: Partial<Parameters<typeof trialState>[0]> = {}) => ({
  type: 'planner',
  createdAt: at(createdAt),
  trialEndsAt: null,
  billingStatus: null,
  ...extra,
})

describe('trialEndsOn', () => {
  it('gives a demo-era studio its month from the day billing starts', () => {
    expect(trialEndsOn(facts('2026-09-26T10:00:00Z'), '2027-01-01')).toBe('2027-02-01')
  })

  it('ends a studio made on 31 January on the last day of February, leap or not', () => {
    expect(trialEndsOn(facts('2027-01-31T10:00:00Z'), '2027-01-01')).toBe('2027-02-28')
    expect(trialEndsOn(facts('2028-01-31T10:00:00Z'), '2027-01-01')).toBe('2028-02-29')
  })

  it('reads the creation day in Brussels across the spring DST change', () => {
    // Clocks went forward at 01:00 UTC on 28 March 2027, so 23:30 UTC that day is 01:30 on the
    // 29th in Brussels (CEST, +2); read as UTC it would be the 28th and end on 28 April.
    expect(trialEndsOn(facts('2027-03-28T23:30:00Z'), '2027-01-01')).toBe('2027-04-29')
    // In autumn, the night before clocks go back: 22:30 UTC on 30 October is 00:30 on the 31st.
    expect(trialEndsOn(facts('2027-10-30T22:30:00Z'), '2027-01-01')).toBe('2027-11-30')
  })

  it('lets trial_ends_at override the computed end, read as its Brussels date', () => {
    const f = facts('2027-02-10T10:00:00Z', { trialEndsAt: at('2027-06-30T22:30:00Z') })
    expect(trialEndsOn(f, '2027-01-01')).toBe('2027-07-01')
  })
})

describe('trialState', () => {
  const made = facts('2027-03-10T10:00:00Z') // last day 2027-04-10

  it('is off while billing is off, whatever the dates say', () => {
    expect(trialState(made, { on: false }, at('2030-01-01T00:00:00Z'))).toEqual({ kind: 'off' })
  })

  it('runs, neutral, until three days before the last day', () => {
    expect(trialState(made, ON, at('2027-04-07T12:00:00Z'))).toEqual({
      kind: 'running',
      endsOn: '2027-04-10',
      daysLeft: 3,
    })
  })

  it('turns amber for the last three days, the last day included', () => {
    expect(trialState(made, ON, at('2027-04-08T12:00:00Z'))).toMatchObject({
      kind: 'lastDays',
      daysLeft: 2,
    })
    expect(trialState(made, ON, at('2027-04-10T21:59:00Z'))).toMatchObject({
      kind: 'lastDays',
      daysLeft: 0,
    })
  })

  it('ends at Brussels midnight after the last day, not UTC midnight', () => {
    // 22:30 UTC on 10 April is 00:30 on the 11th in Brussels (CEST, +2).
    expect(trialState(made, ON, at('2027-04-10T22:30:00Z'))).toEqual({
      kind: 'ended',
      endsOn: '2027-04-10',
    })
  })

  it('is paid for active and past_due, and ended for canceled', () => {
    const late = at('2027-09-01T00:00:00Z')
    expect(trialState({ ...made, billingStatus: 'active' }, ON, late)).toEqual({ kind: 'paid' })
    expect(trialState({ ...made, billingStatus: 'past_due' }, ON, late)).toEqual({ kind: 'paid' })
    expect(
      trialState({ ...made, billingStatus: 'canceled' }, ON, at('2027-03-20T00:00:00Z')),
    ).toMatchObject({ kind: 'ended' })
  })

  it('never puts a non-planner org on the clock', () => {
    const late = at('2030-01-01T00:00:00Z')
    expect(trialState({ ...made, type: 'venue' }, ON, late)).toEqual({ kind: 'off' })
    expect(trialState(made, ON, late)).toMatchObject({ kind: 'ended' })
  })

  it('keeps a demo-era studio running when billing starts', () => {
    const old = facts('2026-05-01T10:00:00Z')
    expect(trialState(old, ON, at('2027-01-01T08:00:00Z'))).toMatchObject({
      kind: 'running',
      endsOn: '2027-02-01',
    })
  })
})
