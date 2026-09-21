import { schema } from '@guestnote/db'
import { describe, expect, it } from 'vitest'
import {
  LIMITS,
  parseId,
  parseNotes,
  parseStatus,
  parseVendorInput,
  VENDOR_STATUSES,
} from './vendor-input.ts'

const OK = {
  name: 'Bloemen Anna',
  category: 'Bloemen',
  email: 'anna@example.com',
  phone: '0470 12 34 56',
  notes: 'Pioenen',
}

describe('VENDOR_STATUSES', () => {
  /** The list is copied so a client component need not import drizzle; this is the tether. */
  it('is the schema list, in the same order', () => {
    expect([...VENDOR_STATUSES]).toEqual([...schema.WEDDING_VENDOR_STATUSES])
  })
})

describe('parseVendorInput', () => {
  it('accepts a full vendor and trims text', () => {
    expect(parseVendorInput({ ...OK, name: '  Bloemen Anna  ' })).toEqual(OK)
  })

  it('stores empty optional fields as null', () => {
    expect(
      parseVendorInput({ name: 'A', category: 'B', email: '  ', phone: '', notes: undefined }),
    ).toEqual({
      name: 'A',
      category: 'B',
      email: null,
      phone: null,
      notes: null,
    })
  })

  it('requires name and category', () => {
    expect(parseVendorInput({ ...OK, name: '   ' })).toBeNull()
    expect(parseVendorInput({ ...OK, category: '' })).toBeNull()
    expect(parseVendorInput({ ...OK, name: undefined })).toBeNull()
  })

  it('refuses a malformed email but not a missing one', () => {
    expect(parseVendorInput({ ...OK, email: 'no-at-sign' })).toBeNull()
    expect(parseVendorInput({ ...OK, email: 'a@b' })).toBeNull()
    expect(parseVendorInput({ ...OK, email: null })?.email).toBeNull()
  })

  it('refuses text past its limit, and exactly at the limit passes', () => {
    expect(parseVendorInput({ ...OK, name: 'x'.repeat(LIMITS.name + 1) })).toBeNull()
    expect(parseVendorInput({ ...OK, name: 'x'.repeat(LIMITS.name) })).not.toBeNull()
    expect(parseVendorInput({ ...OK, notes: 'x'.repeat(LIMITS.notes + 1) })).toBeNull()
  })

  it('refuses non-string fields and non-objects', () => {
    expect(parseVendorInput({ ...OK, phone: 123 })).toBeNull()
    expect(parseVendorInput(null)).toBeNull()
    expect(parseVendorInput('vendor')).toBeNull()
  })
})

describe('parseStatus', () => {
  it('accepts each status and nothing else', () => {
    for (const s of VENDOR_STATUSES) expect(parseStatus(s)).toBe(s)
    expect(parseStatus('signed')).toBeNull()
    expect(parseStatus(undefined)).toBeNull()
  })
})

describe('parseNotes', () => {
  it('wraps the value so an empty string can mean "clear"', () => {
    expect(parseNotes('hi')).toEqual({ value: 'hi' })
    expect(parseNotes('  ')).toEqual({ value: null })
    expect(parseNotes(5)).toBeNull()
    expect(parseNotes('x'.repeat(LIMITS.notes + 1))).toBeNull()
  })
})

describe('parseId', () => {
  it('accepts a uuid and refuses everything Postgres would throw on', () => {
    expect(parseId('0195f3a2-7b1c-7d2e-8a3b-1c2d3e4f5a6b')).not.toBeNull()
    expect(parseId('not-a-uuid')).toBeNull()
    expect(parseId('')).toBeNull()
    expect(parseId(undefined)).toBeNull()
  })
})
