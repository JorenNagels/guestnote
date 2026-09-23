import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * What the Files and Moodboard Server Functions do with an answer from the repository and the
 * storage seam. Mocked: `@guestnote/db` (the repo functions and `newId`), `principal.ts`, `db.ts`
 * and `storage.ts`. The repository's own rules -- who may see a file, the pending-row lifecycle --
 * are `packages/db/test/files-repo.test.ts`'s job against a real Postgres; the signing rules are
 * `packages/storage`'s. What is left, and what these pin, is the ORDER and the REFUSALS: nothing
 * is written for a request the storage seam refuses, and nothing is signed for a file the
 * caller may not read.
 */
const repo = {
  confirmFile: vi.fn(),
  createPendingFile: vi.fn(),
  getFile: vi.fn(),
  listFiles: vi.fn(),
  removeFile: vi.fn(),
  renameFile: vi.fn(),
  setFileVisibility: vi.fn(),
}
const storage = { presignUpload: vi.fn(), presignDownload: vi.fn() }
const currentMemberships = vi.fn()
const currentOrgId = vi.fn()

vi.mock('@guestnote/db', () => ({
  confirmFile: (...a: unknown[]) => repo.confirmFile(...a),
  createPendingFile: (...a: unknown[]) => repo.createPendingFile(...a),
  getFile: (...a: unknown[]) => repo.getFile(...a),
  listFiles: (...a: unknown[]) => repo.listFiles(...a),
  removeFile: (...a: unknown[]) => repo.removeFile(...a),
  renameFile: (...a: unknown[]) => repo.renameFile(...a),
  setFileVisibility: (...a: unknown[]) => repo.setFileVisibility(...a),
  newId: () => 'ffffffff-0000-0000-0000-00000000000f',
}))
vi.mock('./db.ts', () => ({ getDb: () => ({}) }))
vi.mock('./principal.ts', () => ({
  currentMemberships: () => currentMemberships(),
  currentOrgId: () => currentOrgId(),
  // The real `currentCaller`, over the two mocks above.
  currentCaller: async () => {
    const [memberships, orgId] = [await currentMemberships(), await currentOrgId()]
    return memberships && orgId ? { memberships, orgId } : null
  },
}))
vi.mock('./storage.ts', () => ({ getStorage: () => storage }))

const {
  cleanName,
  confirmUpload,
  downloadUrl,
  listWeddingImages,
  removeWeddingFile,
  renameWeddingFile,
  setWeddingFileVisibility,
  startUpload,
} = await import('./wedding-files.ts')

const ORG = 'aaaaaaaa-0000-0000-0000-00000000000a'
const WEDDING = 'bbbbbbbb-0000-0000-0000-00000000000b'
const FILE = 'cccccccc-0000-0000-0000-00000000000c'
const KEY = `${ORG}/${WEDDING}/${FILE}`
const MEMBERSHIPS = { userId: 'u1', orgs: [{ orgId: ORG, role: 'owner' }], weddings: [] }

const SIGNED = {
  ok: true,
  key: KEY,
  url: 'https://signed.example/put',
  method: 'PUT',
  headers: { 'Content-Type': 'image/png', 'Content-Length': '2048' },
  expiresAt: '2026-01-01T00:00:00.000Z',
}

beforeEach(() => {
  vi.resetAllMocks()
  currentMemberships.mockResolvedValue(MEMBERSHIPS)
  currentOrgId.mockResolvedValue(ORG)
  storage.presignUpload.mockResolvedValue(SIGNED)
  repo.createPendingFile.mockResolvedValue(true)
})

const input = { name: 'plan.png', mime: 'IMAGE/PNG', sizeBytes: 2048, visibility: 'shared' }

describe('cleanName', () => {
  it('strips control characters and trims', () => {
    expect(cleanName('  a\u0000b\nc  ')).toBe('a b c')
  })
  it('refuses empty, over-long and non-strings', () => {
    expect(cleanName('   ')).toBeNull()
    expect(cleanName('x'.repeat(201))).toBeNull()
    expect(cleanName('x'.repeat(200))).toBe('x'.repeat(200))
    expect(cleanName(42)).toBeNull()
  })
})

describe('startUpload', () => {
  it('signs, then creates the row, and returns the headers the browser must send', async () => {
    const result = await startUpload('image', WEDDING, input)

    expect(result).toEqual({
      ok: true,
      fileId: 'ffffffff-0000-0000-0000-00000000000f',
      url: SIGNED.url,
      // Content-Length is dropped: a browser sets it from the body and refuses to be given it.
      headers: { 'Content-Type': 'image/png' },
    })
    expect(storage.presignUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: { orgId: ORG, weddingId: WEDDING },
        kind: 'image',
        sizeBytes: 2048,
      }),
    )
    // The row carries the type the URL was signed for, not the raw `IMAGE/PNG` that arrived.
    expect(repo.createPendingFile).toHaveBeenCalledWith(
      expect.anything(),
      MEMBERSHIPS,
      ORG,
      WEDDING,
      expect.objectContaining({ kind: 'image', mime: 'image/png', storageKey: KEY }),
    )
  })

  it('creates nothing when the storage seam refuses', async () => {
    storage.presignUpload.mockResolvedValue({ ok: false, failure: 'too_large', detail: 'x' })
    expect(await startUpload('file', WEDDING, input)).toEqual({ ok: false, error: 'too_large' })
    expect(repo.createPendingFile).not.toHaveBeenCalled()
  })

  it('is not_found for a non-UUID wedding, without reading memberships', async () => {
    expect(await startUpload('file', 'not-a-uuid', input)).toEqual({
      ok: false,
      error: 'not_found',
    })
    expect(storage.presignUpload).not.toHaveBeenCalled()
  })

  it('is not_found when the user has no organisation', async () => {
    currentOrgId.mockResolvedValue(null)
    expect(await startUpload('file', WEDDING, input)).toEqual({ ok: false, error: 'not_found' })
  })

  it('is not_found when the repository says the wedding is out of reach', async () => {
    repo.createPendingFile.mockResolvedValue(false)
    expect(await startUpload('file', WEDDING, input)).toEqual({ ok: false, error: 'not_found' })
  })

  it('refuses a bad name before signing anything', async () => {
    expect(await startUpload('file', WEDDING, { ...input, name: '  ' })).toEqual({
      ok: false,
      error: 'invalid_name',
    })
    expect(storage.presignUpload).not.toHaveBeenCalled()
  })

  it('refuses a mime or size that is not the right type', async () => {
    expect(await startUpload('file', WEDDING, { ...input, sizeBytes: '2048' })).toEqual({
      ok: false,
      error: 'invalid_size',
    })
    expect(storage.presignUpload).not.toHaveBeenCalled()
  })

  it('treats an unknown visibility as shared, never as a way to skip the field', async () => {
    await startUpload('file', WEDDING, { ...input, visibility: 'public' })
    expect(repo.createPendingFile).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      ORG,
      WEDDING,
      expect.objectContaining({ visibility: 'shared' }),
    )
  })

  it('keeps internal when asked', async () => {
    await startUpload('file', WEDDING, { ...input, visibility: 'internal' })
    expect(repo.createPendingFile).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      ORG,
      WEDDING,
      expect.objectContaining({ visibility: 'internal' }),
    )
  })
})

describe('confirmUpload / remove / rename / visibility', () => {
  it('confirm passes only ids, and maps null to not_found', async () => {
    repo.confirmFile.mockResolvedValue({ id: FILE })
    expect(await confirmUpload(WEDDING, FILE)).toEqual({ ok: true })
    repo.confirmFile.mockResolvedValue(null)
    expect(await confirmUpload(WEDDING, FILE)).toEqual({ ok: false, error: 'not_found' })
    expect(await confirmUpload(WEDDING, 'nope')).toEqual({ ok: false, error: 'not_found' })
  })

  it('remove maps false to not_found', async () => {
    repo.removeFile.mockResolvedValue(true)
    expect(await removeWeddingFile(WEDDING, FILE)).toEqual({ ok: true })
    repo.removeFile.mockResolvedValue(false)
    expect(await removeWeddingFile(WEDDING, FILE)).toEqual({ ok: false, error: 'not_found' })
  })

  it('rename cleans the name and refuses an empty one before the repository', async () => {
    repo.renameFile.mockResolvedValue(true)
    expect(await renameWeddingFile(WEDDING, FILE, ' Menu\t')).toEqual({ ok: true })
    expect(repo.renameFile).toHaveBeenCalledWith(
      expect.anything(),
      MEMBERSHIPS,
      ORG,
      WEDDING,
      FILE,
      'Menu',
    )
    repo.renameFile.mockClear()
    expect(await renameWeddingFile(WEDDING, FILE, '  ')).toEqual({
      ok: false,
      error: 'invalid_name',
    })
    expect(repo.renameFile).not.toHaveBeenCalled()
  })

  it('visibility only accepts the two values', async () => {
    repo.setFileVisibility.mockResolvedValue(true)
    expect(await setWeddingFileVisibility(WEDDING, FILE, 'internal')).toEqual({ ok: true })
    expect(await setWeddingFileVisibility(WEDDING, FILE, 'public')).toEqual({
      ok: false,
      error: 'not_found',
    })
    expect(repo.setFileVisibility).toHaveBeenCalledTimes(1)
  })
})

describe('downloadUrl', () => {
  const row = { id: FILE, kind: 'file', name: 'Contract.pdf', storageKey: KEY }

  it('signs only what the tenant read returned', async () => {
    repo.getFile.mockResolvedValue(null)
    expect(await downloadUrl(WEDDING, FILE)).toBeNull()
    expect(storage.presignDownload).not.toHaveBeenCalled()
  })

  it('serves a document as an attachment and an image inline', async () => {
    storage.presignDownload.mockResolvedValue({ ok: true, url: 'https://get.example/a' })
    repo.getFile.mockResolvedValue(row)
    expect(await downloadUrl(WEDDING, FILE)).toBe('https://get.example/a')
    expect(storage.presignDownload).toHaveBeenLastCalledWith(
      expect.objectContaining({ disposition: 'attachment', key: KEY, filename: 'Contract.pdf' }),
    )

    repo.getFile.mockResolvedValue({ ...row, kind: 'image' })
    await downloadUrl(WEDDING, FILE)
    expect(storage.presignDownload).toHaveBeenLastCalledWith(
      expect.objectContaining({ disposition: 'inline' }),
    )
  })

  it('is null when signing fails', async () => {
    repo.getFile.mockResolvedValue(row)
    storage.presignDownload.mockResolvedValue({ ok: false, failure: 'unavailable', detail: 'x' })
    expect(await downloadUrl(WEDDING, FILE)).toBeNull()
  })
})

describe('a row whose key the storage seam rejects', () => {
  // The dev seed writes `seed/<org>/<wedding>/<n>` keys; `presignDownload` throws on them.
  const bad = { id: 'x', kind: 'image', name: 'Seed', storageKey: 'seed/x/y/5' }

  it('is one dead download, not an error', async () => {
    repo.getFile.mockResolvedValue(bad)
    storage.presignDownload.mockRejectedValue(new Error('key not in scope'))
    expect(await downloadUrl(WEDDING, FILE)).toBeNull()
  })

  it('is one placeholder tile, and the rest of the board still loads', async () => {
    const good = { id: 'g', kind: 'image', name: 'Good', storageKey: KEY }
    repo.listFiles.mockResolvedValue([bad, good])
    storage.presignDownload
      .mockRejectedValueOnce(new Error('key not in scope'))
      .mockResolvedValueOnce({ ok: true, url: 'https://get.example/g' })
    const tiles = await listWeddingImages(WEDDING)
    expect(tiles?.map((t) => t.url)).toEqual([null, 'https://get.example/g'])
  })
})

describe('listWeddingImages', () => {
  it('is null for no access and signs nothing', async () => {
    repo.listFiles.mockResolvedValue(null)
    expect(await listWeddingImages(WEDDING)).toBeNull()
    expect(storage.presignDownload).not.toHaveBeenCalled()
  })

  it('signs each image inline, and leaves url null where signing failed', async () => {
    const a = { id: 'a', kind: 'image', name: 'A', storageKey: KEY }
    const b = { id: 'b', kind: 'image', name: 'B', storageKey: KEY }
    repo.listFiles.mockResolvedValue([a, b])
    storage.presignDownload
      .mockResolvedValueOnce({ ok: true, url: 'https://get.example/a' })
      .mockResolvedValueOnce({ ok: false, failure: 'unavailable', detail: 'x' })

    const tiles = await listWeddingImages(WEDDING)

    expect(tiles?.map((t) => t.url)).toEqual(['https://get.example/a', null])
    expect(storage.presignDownload).toHaveBeenCalledWith(
      expect.objectContaining({ disposition: 'inline' }),
    )
  })
})
