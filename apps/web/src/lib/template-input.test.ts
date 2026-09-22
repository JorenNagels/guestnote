import { describe, expect, it } from 'vitest'
import {
  EMPTY_ITEM,
  formFromItem,
  type ItemFormValues,
  parseItemInput,
  parseTemplateInput,
  TEMPLATE_LIMITS,
} from './template-input.ts'

describe('parseTemplateInput', () => {
  it('accepts a name and description, trimmed', () => {
    expect(
      parseTemplateInput({ name: '  Full planning  ', description: '  Everything  ' }),
    ).toEqual({ ok: true, input: { name: 'Full planning', description: 'Everything' } })
  })

  it('stores an empty description as null', () => {
    expect(parseTemplateInput({ name: 'Elopement', description: '   ' })).toEqual({
      ok: true,
      input: { name: 'Elopement', description: null },
    })
    expect(parseTemplateInput({ name: 'Elopement', description: undefined })).toEqual({
      ok: true,
      input: { name: 'Elopement', description: null },
    })
  })

  it('refuses a missing or blank name, and a name past the limit', () => {
    expect(parseTemplateInput({ name: '', description: null })).toEqual({
      ok: false,
      error: 'name',
    })
    expect(parseTemplateInput({ name: '   ', description: null })).toEqual({
      ok: false,
      error: 'name',
    })
    expect(parseTemplateInput({ description: null })).toEqual({ ok: false, error: 'name' })
    expect(parseTemplateInput({ name: 'x'.repeat(TEMPLATE_LIMITS.name + 1) })).toEqual({
      ok: false,
      error: 'name',
    })
    // Exactly at the limit passes.
    expect(parseTemplateInput({ name: 'x'.repeat(TEMPLATE_LIMITS.name) }).ok).toBe(true)
  })

  it('refuses a description past the limit', () => {
    expect(
      parseTemplateInput({ name: 'x', description: 'x'.repeat(TEMPLATE_LIMITS.description + 1) }),
    ).toEqual({ ok: false, error: 'description' })
  })

  it('refuses non-objects', () => {
    expect(parseTemplateInput(null)).toEqual({ ok: false, error: 'name' })
    expect(parseTemplateInput('template')).toEqual({ ok: false, error: 'name' })
  })
})

describe('parseItemInput', () => {
  const OK = { title: 'Sign the venue contract', offsetDays: '180', offsetDirection: 'before' }

  it('accepts a full item and resolves the signed offset', () => {
    expect(parseItemInput(OK)).toEqual({
      ok: true,
      input: {
        title: 'Sign the venue contract',
        dueOffsetDays: -180,
        visibility: 'shared',
        assigneeRole: 'planner',
      },
    })
    expect(parseItemInput({ ...OK, offsetDirection: 'after' })).toMatchObject({
      input: { dueOffsetDays: 180 },
    })
  })

  it('coerces an unknown visibility or assignee to the safe default rather than reach the CHECK', () => {
    expect(parseItemInput({ ...OK, visibility: 'whatever' })).toMatchObject({
      input: { visibility: 'shared' },
    })
    expect(parseItemInput({ ...OK, assigneeRole: 'whatever' })).toMatchObject({
      input: { assigneeRole: 'planner' },
    })
    expect(parseItemInput({ ...OK, visibility: 'internal', assigneeRole: 'couple' })).toMatchObject(
      { input: { visibility: 'internal', assigneeRole: 'couple' } },
    )
  })

  it('trims the title and refuses a blank or over-long one', () => {
    expect(parseItemInput({ ...OK, title: '  Sign  ' })).toMatchObject({
      input: { title: 'Sign' },
    })
    expect(parseItemInput({ ...OK, title: '   ' })).toEqual({ ok: false, error: 'title' })
    expect(parseItemInput({ ...OK, title: 'x'.repeat(TEMPLATE_LIMITS.title + 1) })).toEqual({
      ok: false,
      error: 'title',
    })
  })

  it("shares S2's offset rule: whole days, 0 to 3650, nothing else", () => {
    expect(parseItemInput({ ...OK, offsetDays: '0' }).ok).toBe(true)
    expect(parseItemInput({ ...OK, offsetDays: '3650' }).ok).toBe(true)
    expect(parseItemInput({ ...OK, offsetDays: '3651' })).toEqual({ ok: false, error: 'offset' })
    expect(parseItemInput({ ...OK, offsetDays: '-1' })).toEqual({ ok: false, error: 'offset' })
    expect(parseItemInput({ ...OK, offsetDays: '1.5' })).toEqual({ ok: false, error: 'offset' })
    expect(parseItemInput({ ...OK, offsetDays: 'ten' })).toEqual({ ok: false, error: 'offset' })
  })

  it('refuses non-objects', () => {
    expect(parseItemInput(null)).toEqual({ ok: false, error: 'title' })
  })
})

describe('formFromItem', () => {
  it('is the inverse of parseItemInput for the edit form', () => {
    const parsed = parseItemInput({
      title: 'Confirm arrival times',
      offsetDays: '3',
      offsetDirection: 'after',
      assigneeRole: 'couple',
      visibility: 'internal',
    })
    if (!parsed.ok) throw new Error('setup')
    expect(formFromItem(parsed.input)).toEqual({
      title: 'Confirm arrival times',
      offsetDays: '3',
      offsetDirection: 'after',
      assigneeRole: 'couple',
      visibility: 'internal',
    } satisfies ItemFormValues)
  })

  it('reads a zero offset as "before", the same direction EMPTY_ITEM defaults to', () => {
    expect(
      formFromItem({
        title: 'On the day',
        dueOffsetDays: 0,
        visibility: 'shared',
        assigneeRole: 'planner',
      }).offsetDirection,
    ).toBe(EMPTY_ITEM.offsetDirection)
  })
})
