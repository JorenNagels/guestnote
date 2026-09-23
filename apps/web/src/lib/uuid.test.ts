import { describe, expect, it } from 'vitest'
import { isUuid } from './uuid.ts'

describe('isUuid', () => {
  it('accepts a hyphenated uuid, either case', () => {
    expect(isUuid('0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b')).toBe(true)
    expect(isUuid('0190A1B2-C3D4-7E5F-8A9B-0C1D2E3F4A5B')).toBe(true)
  })

  it('refuses anything Postgres would throw on, and non-strings', () => {
    expect(isUuid('0190a1b2c3d47e5f8a9b0c1d2e3f4a5b')).toBe(false)
    expect(isUuid('0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b ')).toBe(false)
    expect(isUuid('')).toBe(false)
    expect(isUuid('new')).toBe(false)
    expect(isUuid("' or 1=1 --")).toBe(false)
    expect(isUuid(undefined)).toBe(false)
    expect(isUuid(42)).toBe(false)
  })
})
