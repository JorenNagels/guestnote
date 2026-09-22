import { describe, expect, it, vi } from 'vitest'
import {
  acceptInvitationWith,
  hashInviteToken,
  type InvitationRecord,
  type InvitationStore,
  resolveInvitationWith,
} from './invitations.ts'

/**
 * The mapping from a database row to the five things the invite screen renders, and the
 * hash that keys it. The SQL behind the store is `packages/db/test/invitations.test.ts`;
 * nothing here touches a database.
 */

const ROW: InvitationRecord = {
  weddingId: null,
  email: 'tom@studiowit.be',
  role: 'admin',
  orgName: 'Studio Wit',
  inviterName: 'Ilse Verhoeven',
  status: 'pending',
}

const storeReturning = (row: InvitationRecord | null): InvitationStore => ({
  resolve: async () => row,
  accept: async () => ({ outcome: 'unknown' }),
})

describe('hashInviteToken', () => {
  it('is lower-case hex SHA-256 of the UTF-8 token', () => {
    // The FIPS 180 test vector for "abc". The SQL side stores exactly this format, so a
    // different case or encoding here would make every invitation unresolvable.
    expect(hashInviteToken('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
  })
})

describe('resolveInvitationWith', () => {
  it('maps a pending staff invitation to the staff screen', async () => {
    expect(await resolveInvitationWith(storeReturning(ROW), 't')).toEqual({
      kind: 'staff',
      email: 'tom@studiowit.be',
      inviter: 'Ilse Verhoeven',
      org: 'Studio Wit',
      role: 'admin',
    })
  })

  it('maps a pending invitation that names a wedding to the wedding screen', async () => {
    expect(
      await resolveInvitationWith(storeReturning({ ...ROW, weddingId: 'w1', role: 'couple' }), 't'),
    ).toEqual({ kind: 'wedding', inviter: 'Ilse Verhoeven', org: 'Studio Wit' })
  })

  it('maps expired, carrying who to ask', async () => {
    expect(await resolveInvitationWith(storeReturning({ ...ROW, status: 'expired' }), 't')).toEqual(
      { kind: 'expired', inviter: 'Ilse Verhoeven' },
    )
  })

  it('maps accepted, and lets it outrank a wedding shape', async () => {
    expect(
      await resolveInvitationWith(storeReturning({ ...ROW, status: 'accepted' }), 't'),
    ).toEqual({ kind: 'accepted' })
    expect(
      await resolveInvitationWith(
        storeReturning({ ...ROW, weddingId: 'w1', status: 'accepted' }),
        't',
      ),
    ).toEqual({ kind: 'accepted' })
  })

  it('maps a token that matches nothing to unknown', async () => {
    expect(await resolveInvitationWith(storeReturning(null), 't')).toEqual({ kind: 'unknown' })
  })

  it('falls back to the organisation when the inviter has no name', async () => {
    const out = await resolveInvitationWith(storeReturning({ ...ROW, inviterName: null }), 't')
    expect(out).toMatchObject({ kind: 'staff', inviter: 'Studio Wit' })
    const blank = await resolveInvitationWith(storeReturning({ ...ROW, inviterName: '  ' }), 't')
    expect(blank).toMatchObject({ kind: 'staff', inviter: 'Studio Wit' })
  })

  it('refuses a staff role it does not know rather than rendering it as member', async () => {
    expect(await resolveInvitationWith(storeReturning({ ...ROW, role: 'owner' }), 't')).toEqual({
      kind: 'unknown',
    })
  })

  it('does not query for an empty or oversized token', async () => {
    const resolve = vi.fn(async () => ROW)
    const store = { ...storeReturning(ROW), resolve }
    expect(await resolveInvitationWith(store, '')).toEqual({ kind: 'unknown' })
    expect(await resolveInvitationWith(store, 'x'.repeat(257))).toEqual({ kind: 'unknown' })
    expect(resolve).not.toHaveBeenCalled()
  })
})

describe('acceptInvitationWith', () => {
  it('passes the hash and user through and returns the granted role', async () => {
    const accept = vi.fn(async () => ({ outcome: 'accepted' as const, role: 'member' }))
    const out = await acceptInvitationWith({ ...storeReturning(ROW), accept }, 'tok', 'u1')
    expect(out).toEqual({ outcome: 'accepted', role: 'member' })
    expect(accept).toHaveBeenCalledWith(hashInviteToken('tok'), 'u1')
  })

  it.each(['unknown', 'expired', 'already_accepted', 'wrong_user', 'forbidden'] as const)(
    'passes the refusal %s through',
    async (outcome) => {
      const accept = async () => ({ outcome })
      expect(await acceptInvitationWith({ ...storeReturning(ROW), accept }, 'tok', 'u1')).toEqual({
        outcome,
      })
    },
  )

  it('does not call the store without a user or with an unusable token', async () => {
    const accept = vi.fn(async () => ({ outcome: 'accepted' as const, role: 'member' }))
    const store = { ...storeReturning(ROW), accept }
    expect(await acceptInvitationWith(store, 'tok', '')).toEqual({ outcome: 'unknown' })
    expect(await acceptInvitationWith(store, '', 'u1')).toEqual({ outcome: 'unknown' })
    expect(accept).not.toHaveBeenCalled()
  })
})
