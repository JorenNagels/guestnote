import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * `inviteCoupleAction`'s own checks (spec 0008): both fields are validated before either is
 * sent, a bad address is named by its field, the same address twice is refused, and the trial
 * guard runs first. The invite itself is `lib/couple-invite.ts` and the database's.
 */
const assertWritable = vi.fn()
const inviteCouple = vi.fn()
const currentWeddingScope = vi.fn()
vi.mock('../../../../../../lib/trial.ts', () => ({
  assertWritable: (...a: unknown[]) => assertWritable(...a),
}))
vi.mock('../../../../../../lib/couple-invite.ts', () => ({
  inviteCouple: (...a: unknown[]) => inviteCouple(...a),
  resendCoupleInvite: vi.fn(),
}))
vi.mock('../../../../../../lib/wedding-scope.ts', () => ({
  currentWeddingScope: (id: unknown) => currentWeddingScope(id),
}))
vi.mock('../../../../../../lib/principal.ts', () => ({
  currentOrgId: async () => 'o1',
  currentOrgs: async () => [{ id: 'o1', name: 'Studio Wit' }],
  currentSession: async () => ({ userId: 'u1', name: 'Ilse', email: 'ilse@wit.be' }),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@guestnote/db', () => ({
  markCoupleActivitySeen: vi.fn(),
  removeCouplePartner: vi.fn(),
  revokeCoupleInvite: vi.fn(),
  setCoupleModules: vi.fn(),
}))

const { inviteCoupleAction } = await import('./actions.ts')

beforeEach(() => {
  vi.clearAllMocks()
  currentWeddingScope.mockResolvedValue({ scope: true })
  inviteCouple.mockResolvedValue([])
})

describe('inviteCoupleAction', () => {
  it('refuses two blank fields as the first field', async () => {
    expect(await inviteCoupleAction('w', ['', '  '])).toEqual({
      ok: false,
      reason: 'invalidEmail',
      index: 0,
    })
  })

  it('names the second field when only the second address is bad, and sends neither', async () => {
    expect(await inviteCoupleAction('w', ['anna@x.be', 'tom@'])).toEqual({
      ok: false,
      reason: 'invalidEmail',
      index: 1,
    })
    expect(inviteCouple).not.toHaveBeenCalled()
  })

  it('refuses the same address twice, case and spaces aside', async () => {
    expect(await inviteCoupleAction('w', ['Anna@x.be', ' anna@x.be '])).toEqual({
      ok: false,
      reason: 'sameEmail',
    })
  })

  it('sends one address when the second is blank, normalised, with the studio and inviter', async () => {
    await inviteCoupleAction('w', ['  Anna@X.be ', ''])
    expect(inviteCouple).toHaveBeenCalledWith(
      { scope: true },
      { inviter: 'Ilse', studio: 'Studio Wit', emails: ['anna@x.be'] },
    )
  })

  it('runs the trial guard before anything else', async () => {
    assertWritable.mockRejectedValueOnce(new Error('trial ended'))
    await expect(inviteCoupleAction('w', ['anna@x.be'])).rejects.toThrow('trial ended')
    expect(inviteCouple).not.toHaveBeenCalled()
  })
})
