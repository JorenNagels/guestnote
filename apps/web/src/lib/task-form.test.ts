import { describe, expect, it } from 'vitest'
import {
  anchorOption,
  EMPTY_FORM,
  formFromTask,
  offsetFromForm,
  parseTaskForm,
} from './task-form.ts'

const ok = (over: object) => parseTaskForm({ ...EMPTY_FORM, title: 'Book the DJ', ...over })

describe('parseTaskForm', () => {
  it('trims the title and refuses an empty or over-long one', () => {
    expect(ok({ title: '  Book the DJ  ' })).toMatchObject({
      ok: true,
      input: { title: 'Book the DJ' },
    })
    expect(ok({ title: '   ' })).toEqual({ ok: false, error: 'title' })
    expect(ok({ title: 'x'.repeat(201) })).toEqual({ ok: false, error: 'title' })
    expect(ok({ title: 'x'.repeat(200) }).ok).toBe(true)
  })

  it('refuses notes past 4000 and stores blank notes as null', () => {
    expect(ok({ notes: 'x'.repeat(4001) })).toEqual({ ok: false, error: 'notes' })
    expect(ok({ notes: '  ' })).toMatchObject({ input: { notes: null } })
  })

  it('makes "14 before" a negative offset and "3 after" a positive one', () => {
    expect(ok({ dueKind: 'offset', offsetDays: '14', offsetDirection: 'before' })).toMatchObject({
      input: { due: { kind: 'offset', days: -14 } },
    })
    expect(ok({ dueKind: 'offset', offsetDays: '3', offsetDirection: 'after' })).toMatchObject({
      input: { due: { kind: 'offset', days: 3 } },
    })
  })

  it('refuses an offset that is empty, fractional, negative typed, or past ten years', () => {
    for (const offsetDays of ['', '1.5', '-3', 'abc', '3651']) {
      expect(ok({ dueKind: 'offset', offsetDays })).toEqual({ ok: false, error: 'offset' })
    }
    expect(ok({ dueKind: 'offset', offsetDays: '3650' }).ok).toBe(true)
  })

  it('refuses an impossible date, which Date.parse would roll into March', () => {
    expect(ok({ dueKind: 'date', date: '2027-02-31' })).toEqual({ ok: false, error: 'date' })
    expect(ok({ dueKind: 'date', date: '' })).toEqual({ ok: false, error: 'date' })
    expect(ok({ dueKind: 'date', date: '2027-02-28' })).toMatchObject({
      input: { due: { kind: 'date', date: '2027-02-28' } },
    })
  })

  it('ignores a stale offset when the kind is none', () => {
    expect(ok({ dueKind: 'none', offsetDays: '99999', date: 'garbage' })).toMatchObject({
      input: { due: { kind: 'none' } },
    })
  })

  // The wire can send any string; the column has a CHECK, so an unknown one must not reach it.
  it('folds unknown visibility and role to shared and planner', () => {
    expect(ok({ visibility: 'secret', assigneeRole: 'admin' })).toMatchObject({
      input: { visibility: 'shared', assigneeRole: 'planner' },
    })
    expect(ok({ visibility: 'internal', assigneeRole: 'couple' })).toMatchObject({
      input: { visibility: 'internal', assigneeRole: 'couple' },
    })
  })

  it('refuses a body that is not an object', () => {
    expect(parseTaskForm(null)).toEqual({ ok: false, error: 'title' })
    expect(parseTaskForm('x')).toEqual({ ok: false, error: 'title' })
  })
})

describe('offsetFromForm', () => {
  it('returns a plain zero, not -0, for "0 before"', () => {
    expect(Object.is(offsetFromForm('0', 'before'), 0)).toBe(true)
  })
})

describe('formFromTask', () => {
  const base = { title: 'T', notes: null, visibility: 'internal', assigneeRole: 'couple' } as const

  it('round-trips an offset, a fixed date and no date', () => {
    expect(formFromTask({ ...base, dueOffsetDays: -14, dueDate: '2027-05-01' })).toMatchObject({
      dueKind: 'offset',
      offsetDays: '14',
      offsetDirection: 'before',
      visibility: 'internal',
      assigneeRole: 'couple',
    })
    expect(formFromTask({ ...base, dueOffsetDays: 3, dueDate: null })).toMatchObject({
      offsetDays: '3',
      offsetDirection: 'after',
    })
    expect(formFromTask({ ...base, dueOffsetDays: null, dueDate: '2027-05-01' })).toMatchObject({
      dueKind: 'date',
      date: '2027-05-01',
    })
    expect(formFromTask({ ...base, dueOffsetDays: null, dueDate: null }).dueKind).toBe('none')
  })
})

describe('the anchor (spec 0004)', () => {
  const E = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b'
  it('carries the chosen event on an offset, and none for the main day', () => {
    expect(ok({ dueKind: 'offset', offsetDays: '14', anchorEventId: E })).toMatchObject({
      input: { due: { kind: 'offset', days: -14, anchorEventId: E } },
    })
    expect(ok({ dueKind: 'offset', offsetDays: '14', anchorEventId: '' })).toMatchObject({
      input: { due: { kind: 'offset', days: -14, anchorEventId: null } },
    })
  })

  it('refuses a malformed anchor id before it can reach the uuid cast', () => {
    expect(ok({ dueKind: 'offset', offsetDays: '14', anchorEventId: 'x' })).toEqual({
      ok: false,
      error: 'anchorGone',
    })
  })

  it('drops the anchor for a fixed date, whatever the select still held', () => {
    const r = ok({ dueKind: 'date', date: '2027-05-01', anchorEventId: E })
    expect(r).toMatchObject({ input: { due: { kind: 'date', date: '2027-05-01' } } })
    expect(r.ok && r.input.due && 'anchorEventId' in r.input.due).toBe(false)
  })

  it('reads the anchor back into the edit form', () => {
    const base = { title: 'x', notes: null, visibility: 'shared', assigneeRole: 'planner' } as const
    expect(
      formFromTask({ ...base, dueOffsetDays: -14, dueDate: '2027-07-02', anchorEventId: E })
        .anchorEventId,
    ).toBe(E)
    expect(formFromTask({ ...base, dueOffsetDays: -14, dueDate: null }).anchorEventId).toBe('')
  })
})

describe('anchorOption', () => {
  it('keeps only what the select needs, so venue and time stay off the client', () => {
    const e = {
      id: 'e1',
      label: 'Civil',
      startsOn: '2027-07-16',
      venue: 'Stadhuis',
      startsAt: '11:00',
    }
    expect(anchorOption(e)).toEqual({ id: 'e1', label: 'Civil', startsOn: '2027-07-16' })
  })
})
