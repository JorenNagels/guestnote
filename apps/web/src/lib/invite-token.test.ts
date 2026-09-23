import { describe, expect, it } from 'vitest'
import { INVITE_TTL_DAYS } from './invite-token.ts'

describe('INVITE_TTL_DAYS', () => {
  it('lives seven days', () => {
    expect(INVITE_TTL_DAYS).toBe(7)
  })
})
