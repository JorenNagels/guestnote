import { describe, expect, it } from 'vitest'
import {
  DEFAULT_VENDOR_LINK_TTL_DAYS,
  hashVendorLinkToken,
  MAX_VENDOR_LINK_TTL_DAYS,
  newVendorLinkToken,
} from './vendor-link-token.ts'

/** The vendor-link twin of `invite-token.test.ts`. */
describe('newVendorLinkToken', () => {
  it('returns a random token and its sha256 hash, and the two never match', () => {
    const { token, tokenHash } = newVendorLinkToken()
    expect(token).toMatch(/^[A-Za-z0-9_-]{40,}$/)
    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/)
    expect(tokenHash).not.toBe(token)
    expect(hashVendorLinkToken(token)).toBe(tokenHash)
  })

  it('is different on every call', () => {
    const a = newVendorLinkToken()
    const b = newVendorLinkToken()
    expect(a.token).not.toBe(b.token)
    expect(a.tokenHash).not.toBe(b.tokenHash)
  })
})

describe('hashVendorLinkToken', () => {
  it('is deterministic: the same token always hashes the same', () => {
    expect(hashVendorLinkToken('fixed-token')).toBe(hashVendorLinkToken('fixed-token'))
  })

  it('a different token hashes differently', () => {
    expect(hashVendorLinkToken('a')).not.toBe(hashVendorLinkToken('b'))
  })
})

describe('the TTL constants', () => {
  it('the default is within the cap', () => {
    expect(DEFAULT_VENDOR_LINK_TTL_DAYS).toBeGreaterThan(0)
    expect(DEFAULT_VENDOR_LINK_TTL_DAYS).toBeLessThanOrEqual(MAX_VENDOR_LINK_TTL_DAYS)
  })
})
