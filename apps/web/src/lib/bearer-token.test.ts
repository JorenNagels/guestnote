import { describe, expect, it } from 'vitest'
import { hashBearerToken, newBearerToken } from './bearer-token.ts'

describe('newBearerToken', () => {
  it('is 32 random bytes as base64url, and the hash is lower-case hex SHA-256 of it', () => {
    const { token, tokenHash } = newBearerToken()
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/)
    expect(hashBearerToken(token)).toBe(tokenHash)
  })

  it('never repeats', () => {
    expect(newBearerToken().token).not.toBe(newBearerToken().token)
  })

  it('hashes to the well-known SHA-256 vector, so a SQL-side sha256 agrees', () => {
    expect(hashBearerToken('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
  })
})
