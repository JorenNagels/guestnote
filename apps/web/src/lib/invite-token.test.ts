import { describe, expect, it } from 'vitest'
import { hashInviteToken, INVITE_TTL_DAYS, newInviteToken } from './invite-token.ts'

describe('newInviteToken', () => {
  it('is 32 random bytes as base64url, and the hash is lower-case hex SHA-256 of it', () => {
    const { token, tokenHash } = newInviteToken()
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/)
    expect(hashInviteToken(token)).toBe(tokenHash)
  })

  it('never repeats', () => {
    expect(newInviteToken().token).not.toBe(newInviteToken().token)
  })

  it('hashes to the well-known SHA-256 vector, so a SQL-side sha256 agrees', () => {
    expect(hashInviteToken('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
  })

  it('lives seven days', () => {
    expect(INVITE_TTL_DAYS).toBe(7)
  })
})
