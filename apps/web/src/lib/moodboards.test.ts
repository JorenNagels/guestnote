import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The board Server Functions' narrowing (spec 0007). The repo is mocked: which board or vendor
 * a caller may name is `moodboards.test.ts`'s, against real policies. Pinned here: nothing
 * malformed reaches the repo, and a name is cleaned before it is stored.
 */
const repo = {
  createBoard: vi.fn(),
  renameBoard: vi.fn(),
  deleteBoard: vi.fn(),
  setBoardShares: vi.fn(),
  moveImage: vi.fn(),
}
vi.mock('@guestnote/db', async (orig) => ({
  ...(await orig<typeof import('@guestnote/db')>()),
  createBoard: (...a: unknown[]) => repo.createBoard(...a),
  renameBoard: (...a: unknown[]) => repo.renameBoard(...a),
  deleteBoard: (...a: unknown[]) => repo.deleteBoard(...a),
  setBoardShares: (...a: unknown[]) => repo.setBoardShares(...a),
  moveImage: (...a: unknown[]) => repo.moveImage(...a),
}))
vi.mock('./wedding-scope.ts', () => ({ currentWeddingScope: async () => ({ scope: true }) }))

const { addBoard, cleanBoardName, moveWeddingImage, removeWeddingBoard, shareWeddingBoard } =
  await import('./moodboards.ts')

const W = 'bbbbbbbb-0000-0000-0000-00000000000b'
const B = 'dddddddd-0000-0000-0000-00000000000d'

beforeEach(() => vi.resetAllMocks())

describe('cleanBoardName', () => {
  it('trims, strips control characters, and caps at 80', () => {
    expect(cleanBoardName('  Foto\ngraaf ')).toBe('Foto graaf')
    expect(cleanBoardName('x'.repeat(81))).toBeNull()
    expect(cleanBoardName('   ')).toBeNull()
  })
})

describe('the wrappers', () => {
  it('refuses a bad name before the repo', async () => {
    expect(await addBoard(W, '  ')).toEqual({ ok: false, error: 'invalidName' })
    expect(repo.createBoard).not.toHaveBeenCalled()
  })

  it('stores the cleaned name', async () => {
    repo.createBoard.mockResolvedValue({ ok: true, value: { id: B } })
    expect(await addBoard(W, ' Bloemen ')).toEqual({ ok: true, id: B })
    expect(repo.createBoard).toHaveBeenCalledWith({ scope: true }, 'Bloemen')
  })

  it('refuses a share list that is not all UUIDs', async () => {
    expect(await shareWeddingBoard(W, B, [B, 'nope'])).toEqual({ ok: false, error: 'notFound' })
    expect(await shareWeddingBoard(W, B, 'nope')).toEqual({ ok: false, error: 'notFound' })
    expect(repo.setBoardShares).not.toHaveBeenCalled()
  })

  it("passes the default board's refusal through by name", async () => {
    repo.deleteBoard.mockResolvedValue({ ok: false, reason: 'isDefault' })
    expect(await removeWeddingBoard(W, B)).toEqual({ ok: false, error: 'isDefault' })
  })

  it('refuses a move naming a non-UUID', async () => {
    expect(await moveWeddingImage(W, 'x', B)).toEqual({ ok: false, error: 'notFound' })
    expect(repo.moveImage).not.toHaveBeenCalled()
  })
})
