import { describe, expect, it } from 'vitest'
import { DEFAULT_VENDOR_LINK_TTL_DAYS, MAX_VENDOR_LINK_TTL_DAYS } from './vendor-link-token.ts'

describe('the TTL constants', () => {
  it('the default is within the cap', () => {
    expect(DEFAULT_VENDOR_LINK_TTL_DAYS).toBeGreaterThan(0)
    expect(DEFAULT_VENDOR_LINK_TTL_DAYS).toBeLessThanOrEqual(MAX_VENDOR_LINK_TTL_DAYS)
  })
})
