import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * `vendor-boards.ts`: the vendor page's boards and its two public doors (spec 0007). Mocked at the
 * repo (`resolveVendorLinkByHash`, `listSharedBoards`) and the signer, so what is pinned is the
 * refusal: nothing is read or signed for a token that is not a live link, and a download is only
 * ever of an image the link can still see. What the link can see is `moodboards.test.ts`'s.
 */
const resolveVendorLinkByHash = vi.fn()
const listSharedBoards = vi.fn()
const signObject = vi.fn()

vi.mock('@guestnote/db', async (orig) => ({
  ...(await orig<typeof import('@guestnote/db')>()),
  resolveVendorLinkByHash: (...a: unknown[]) => resolveVendorLinkByHash(...a),
  listSharedBoards: (...a: unknown[]) => listSharedBoards(...a),
}))
vi.mock('./db.ts', () => ({ getDb: () => ({}) }))
vi.mock('./wedding-files.ts', () => ({ signObject: (...a: unknown[]) => signObject(...a) }))

const { refreshVendorBoardUrls, vendorImageDownloadUrl, liveVendorLink } = await import(
  './vendor-boards.ts'
)
const { hashBearerToken } = await import('./bearer-token.ts')

const LOOKUP = { orgId: 'o1', weddingId: 'w1', weddingVendorId: 'wv1', status: 'live' }
const BOARDS = [
  {
    id: 'b1',
    name: 'Fotograaf',
    images: [
      { id: 'f1', name: 'A', storageKey: 'o1/w1/f1' },
      { id: 'f2', name: 'B', storageKey: 'o1/w1/f2' },
    ],
  },
]

beforeEach(() => {
  vi.resetAllMocks()
  resolveVendorLinkByHash.mockResolvedValue(LOOKUP)
  listSharedBoards.mockResolvedValue(BOARDS)
  signObject.mockImplementation(async (_s, i: { id?: string; storageKey: string }, d: string) =>
    i.storageKey === 'o1/w1/f2' && d === 'inline' ? null : `https://get/${i.storageKey}?${d}`,
  )
})

describe('liveVendorLink', () => {
  it.each(['expired', 'revoked'])('refuses a %s link', async (status) => {
    resolveVendorLinkByHash.mockResolvedValue({ ...LOOKUP, status })
    expect(await liveVendorLink('tok')).toBeNull()
  })

  it('refuses a non-string or absurdly long token without hashing it', async () => {
    expect(await liveVendorLink(42)).toBeNull()
    expect(await liveVendorLink('x'.repeat(201))).toBeNull()
    expect(await liveVendorLink('')).toBeNull()
    expect(resolveVendorLinkByHash).not.toHaveBeenCalled()
  })
})

describe('refreshVendorBoardUrls', () => {
  it('re-resolves the token and returns fresh inline URLs by file id, skipping failures', async () => {
    expect(await refreshVendorBoardUrls('tok')).toEqual({ f1: 'https://get/o1/w1/f1?inline' })
    // The token's hash, never the token and never a constant.
    expect(resolveVendorLinkByHash).toHaveBeenCalledWith(expect.anything(), hashBearerToken('tok'))
    // Signed in the lookup's own scope: the storage seam's key check keys on it.
    expect(signObject).toHaveBeenCalledWith(
      { orgId: 'o1', weddingId: 'w1' },
      expect.objectContaining({ storageKey: 'o1/w1/f1' }),
      'inline',
    )
    expect(listSharedBoards).toHaveBeenCalledWith(expect.anything(), {
      kind: 'link',
      orgId: 'o1',
      weddingId: 'w1',
      weddingVendorId: 'wv1',
    })
  })

  it('is null, and reads nothing, once the link is revoked', async () => {
    resolveVendorLinkByHash.mockResolvedValue({ ...LOOKUP, status: 'revoked' })
    expect(await refreshVendorBoardUrls('tok')).toBeNull()
    expect(listSharedBoards).not.toHaveBeenCalled()
    expect(signObject).not.toHaveBeenCalled()
  })
})

describe('vendorImageDownloadUrl', () => {
  it('signs an attachment for an image the link can see', async () => {
    expect(await vendorImageDownloadUrl('tok', 'f1')).toBe('https://get/o1/w1/f1?attachment')
  })

  it('signs nothing for a file id the link cannot see', async () => {
    expect(await vendorImageDownloadUrl('tok', 'someone-elses')).toBeNull()
    expect(signObject).not.toHaveBeenCalled()
  })

  it('signs nothing for a dead link', async () => {
    resolveVendorLinkByHash.mockResolvedValue(null)
    expect(await vendorImageDownloadUrl('tok', 'f1')).toBeNull()
    expect(signObject).not.toHaveBeenCalled()
  })
})
