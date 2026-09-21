import { describe, expect, it } from 'vitest'
import { isCivilDate, parseEventForm, parseWeddingForm } from './parse.ts'

const form = (entries: Record<string, string>) => {
  const fd = new FormData()
  for (const [k, v] of Object.entries(entries)) fd.set(k, v)
  return fd
}

const GOOD = { coupleDisplayName: 'Marie & Thomas' }

describe('parseWeddingForm', () => {
  it('takes the minimum, and reads the empty fields as null and the status as draft', () => {
    expect(parseWeddingForm(form(GOOD))).toEqual({
      ok: true,
      value: {
        coupleDisplayName: 'Marie & Thomas',
        weddingDate: null,
        venue: null,
        headcount: null,
        notes: null,
        color: null,
        status: 'draft',
      },
    })
  })

  it('trims, and stores the colour upper case', () => {
    const r = parseWeddingForm(
      form({ coupleDisplayName: '  Els  ', color: '#a94f4a', venue: ' Kasteel ', status: 'live' }),
    )
    expect(r.ok && r.value).toMatchObject({
      coupleDisplayName: 'Els',
      color: '#A94F4A',
      venue: 'Kasteel',
      status: 'live',
    })
  })

  it.each([
    ['#abc', 'shorthand'],
    ['A94F4A', 'no hash'],
    ['#GGGGGG', 'not hex'],
    ['#A94F4A ff', 'trailing text'],
    ['red', 'a name'],
  ])('refuses the colour %s (%s)', (color) => {
    const r = parseWeddingForm(form({ ...GOOD, color }))
    expect(r).toEqual({ ok: false, errors: { color: 'invalidColor' } })
  })

  it('requires a couple name and bounds its length', () => {
    expect(parseWeddingForm(form({ coupleDisplayName: '   ' }))).toEqual({
      ok: false,
      errors: { coupleDisplayName: 'required' },
    })
    expect(parseWeddingForm(form({ coupleDisplayName: 'x'.repeat(121) }))).toEqual({
      ok: false,
      errors: { coupleDisplayName: 'tooLong' },
    })
    expect(parseWeddingForm(form({ coupleDisplayName: 'x'.repeat(120) })).ok).toBe(true)
  })

  it('accepts only a whole number of guests from 0 to 100000', () => {
    const ok = (headcount: string) => parseWeddingForm(form({ ...GOOD, headcount }))
    expect(ok('0')).toMatchObject({ ok: true, value: { headcount: 0 } })
    expect(ok('100000')).toMatchObject({ ok: true, value: { headcount: 100000 } })
    for (const bad of ['100001', '-1', '1.5', 'abc', '1e3']) {
      expect(ok(bad)).toEqual({ ok: false, errors: { headcount: 'invalidNumber' } })
    }
  })

  it('accepts a real date only', () => {
    expect(parseWeddingForm(form({ ...GOOD, weddingDate: '2027-06-12' })).ok).toBe(true)
    for (const bad of ['2027-02-30', '12/06/2027', '2027-6-1']) {
      expect(parseWeddingForm(form({ ...GOOD, weddingDate: bad }))).toEqual({
        ok: false,
        errors: { weddingDate: 'invalidDate' },
      })
    }
  })

  it('bounds venue and notes, and refuses an unknown status', () => {
    expect(parseWeddingForm(form({ ...GOOD, venue: 'x'.repeat(201) }))).toEqual({
      ok: false,
      errors: { venue: 'tooLong' },
    })
    expect(parseWeddingForm(form({ ...GOOD, notes: 'x'.repeat(5001) }))).toEqual({
      ok: false,
      errors: { notes: 'tooLong' },
    })
    expect(parseWeddingForm(form({ ...GOOD, status: 'deleted' }))).toEqual({
      ok: false,
      errors: { status: 'invalidStatus' },
    })
  })

  it('reports every bad field at once', () => {
    const r = parseWeddingForm(form({ coupleDisplayName: '', color: 'x', headcount: '-2' }))
    expect(r).toEqual({
      ok: false,
      errors: { coupleDisplayName: 'required', color: 'invalidColor', headcount: 'invalidNumber' },
    })
  })
})

describe('parseEventForm', () => {
  const EVENT = { label: 'Receptie', startsOn: '2027-06-12' }

  it('needs a label and a date; time and venue are optional', () => {
    expect(parseEventForm(form(EVENT))).toEqual({
      ok: true,
      value: { label: 'Receptie', startsOn: '2027-06-12', startsAt: null, venue: null },
    })
    expect(parseEventForm(form({}))).toEqual({
      ok: false,
      errors: { label: 'required', startsOn: 'required' },
    })
  })

  it('reads HH:MM and nothing looser', () => {
    expect(parseEventForm(form({ ...EVENT, startsAt: '15:30' }))).toMatchObject({
      ok: true,
      value: { startsAt: '15:30' },
    })
    for (const bad of ['24:00', '9:30', '15:60', '15:30:00']) {
      expect(parseEventForm(form({ ...EVENT, startsAt: bad }))).toEqual({
        ok: false,
        errors: { startsAt: 'invalidTime' },
      })
    }
  })

  it('bounds label and venue', () => {
    expect(parseEventForm(form({ ...EVENT, label: 'x'.repeat(121) })).ok).toBe(false)
    expect(parseEventForm(form({ ...EVENT, venue: 'x'.repeat(201) })).ok).toBe(false)
  })
})

describe('isCivilDate', () => {
  it('knows leap years', () => {
    expect(isCivilDate('2028-02-29')).toBe(true)
    expect(isCivilDate('2027-02-29')).toBe(false)
  })
})
