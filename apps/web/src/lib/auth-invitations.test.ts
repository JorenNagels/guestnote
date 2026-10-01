import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The invitation store's one rule of its own (spec 0005 + 0008): a staff acceptance moves the
 * studio's seat count, a couple's never does. The SQL behind it is `packages/db`'s.
 */
const acceptInvitationByHash = vi.fn()
const seatsChanged = vi.fn()
vi.mock('@guestnote/db', async (orig) => ({
  ...(await orig<typeof import('@guestnote/db')>()),
  acceptInvitationByHash: (...a: unknown[]) => acceptInvitationByHash(...a),
}))
vi.mock('./billing.ts', () => ({ seatsChanged: (...a: unknown[]) => seatsChanged(...a) }))
vi.mock('./db.ts', () => ({ getDb: () => ({}) }))

const { invitationStore } = await import('./auth.ts')

beforeEach(() => vi.clearAllMocks())

describe('invitationStore.accept', () => {
  it('counts a seat for a staff acceptance', async () => {
    acceptInvitationByHash.mockResolvedValue({
      outcome: 'accepted',
      orgId: 'o1',
      weddingId: null,
      role: 'member',
    })
    expect(await invitationStore.accept('h', 'u1')).toEqual({
      outcome: 'accepted',
      role: 'member',
      weddingId: null,
    })
    expect(seatsChanged).toHaveBeenCalledWith('o1', 'u1')
  })

  it('never counts a couple, and hands back the wedding for the redirect', async () => {
    acceptInvitationByHash.mockResolvedValue({
      outcome: 'accepted',
      orgId: 'o1',
      weddingId: 'w1',
      role: 'couple',
    })
    expect(await invitationStore.accept('h', 'u1')).toEqual({
      outcome: 'accepted',
      role: 'couple',
      weddingId: 'w1',
    })
    expect(seatsChanged).not.toHaveBeenCalled()
  })

  it('counts nothing on a refusal', async () => {
    acceptInvitationByHash.mockResolvedValue({ outcome: 'expired' })
    expect(await invitationStore.accept('h', 'u1')).toEqual({ outcome: 'expired' })
    expect(seatsChanged).not.toHaveBeenCalled()
  })
})
