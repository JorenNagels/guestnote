import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * `coupleFileUrl` (2026-10-04): opening an item of a shared board from the couple's portal. What
 * the couple may see is `couple_board_images`'s, tested in `packages/db/test/couple-portal.test.ts`;
 * pinned here is that only a row that function returned is signed, in the couple's own scope.
 */
const coupleBoardImages = vi.fn()
const signObject = vi.fn()
vi.mock('@guestnote/db', async (orig) => ({
  ...(await orig<typeof import('@guestnote/db')>()),
  coupleBoardImages: (...a: unknown[]) => coupleBoardImages(...a),
}))
vi.mock('./db.ts', () => ({ getDb: () => ({}) }))
vi.mock('./principal.ts', () => ({ currentSession: vi.fn() }))
vi.mock('./storage.ts', () => ({ getStorage: vi.fn() }))
vi.mock('./wedding-files.ts', () => ({
  cleanName: vi.fn(),
  signObject: (...a: unknown[]) => signObject(...a),
}))

const { coupleFileUrl } = await import('./couple.ts')

const BOARD = '018f0000-0000-7000-8000-0000000000b1'
const PDF = '018f0000-0000-7000-8000-0000000000f1'
const ELSEWHERE = '018f0000-0000-7000-8000-0000000000f9'
const COUPLE = {
  principal: { kind: 'couple', orgId: 'o1', weddingId: 'w1', userId: 'u1' },
  home: { status: 'live' },
} as unknown as Parameters<typeof coupleFileUrl>[0]
const ROW = { id: PDF, name: 'Plan.pdf', storageKey: 'o1/w1/f1', mime: 'application/pdf' }

beforeEach(() => {
  vi.resetAllMocks()
  coupleBoardImages.mockResolvedValue([ROW])
  signObject.mockResolvedValue('https://get/plan')
})

describe('coupleFileUrl', () => {
  it('signs an item of the shared board inline, in the couple wedding scope', async () => {
    expect(await coupleFileUrl(COUPLE, BOARD, PDF)).toBe('https://get/plan')
    expect(coupleBoardImages).toHaveBeenCalledWith(expect.anything(), COUPLE.principal, BOARD)
    expect(signObject).toHaveBeenCalledWith({ orgId: 'o1', weddingId: 'w1' }, ROW, 'inline')
  })

  it('signs nothing for a file that is not on that board as the couple sees it', async () => {
    expect(await coupleFileUrl(COUPLE, BOARD, ELSEWHERE)).toBeNull()
    expect(signObject).not.toHaveBeenCalled()
  })

  it('reads nothing for ids that are not UUIDs', async () => {
    expect(await coupleFileUrl(COUPLE, 'x', PDF)).toBeNull()
    expect(await coupleFileUrl(COUPLE, BOARD, 42)).toBeNull()
    expect(coupleBoardImages).not.toHaveBeenCalled()
  })
})
