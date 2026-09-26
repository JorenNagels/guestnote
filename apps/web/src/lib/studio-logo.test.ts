import { createStorage, type StorageTransport } from '@guestnote/storage'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The studio logo's server half (spec 0005). Mocked: `setLogoKey` (its SQL is
 * `packages/db/test`'s), `db.ts` and `observability.ts`. NOT mocked: `principalForOrg`, and the
 * storage package itself -- `getStorage()` returns a real `createStorage` over a recording
 * transport, so the key shape, the allow-list and the 2 MiB limit are the real ones, and what
 * is pinned here is the ORDER (save, then delete) and the REFUSALS (a member signs nothing).
 */
const setLogoKey = vi.fn()
const reportSilentFailure = vi.fn()
const events: string[] = []
const puts: string[] = []
const deletes: string[] = []
let deleteResult: { ok: true } | { ok: false; detail: string } = { ok: true }

const transport: StorageTransport = {
  name: 'recording',
  async presignPut(input) {
    puts.push(input.key)
    return { ok: true, url: `https://put.example/${input.key}` }
  },
  async presignGet(input) {
    return { ok: true, url: `https://get.example/${input.key}` }
  },
  async deleteObject({ key }) {
    events.push(`delete ${key}`)
    deletes.push(key)
    return deleteResult
  },
}
const storage = createStorage({ transport })

vi.mock('@guestnote/db', async (orig) => ({
  ...(await orig<typeof import('@guestnote/db')>()),
  setLogoKey: (...a: unknown[]) => setLogoKey(...a),
}))
vi.mock('./db.ts', () => ({ getDb: () => ({}) }))
vi.mock('./storage.ts', () => ({ getStorage: () => storage }))
vi.mock('./observability.ts', () => ({
  reportSilentFailure: (...a: unknown[]) => reportSilentFailure(...a),
}))

const { confirmLogo, logoUrl, removeLogo, startLogoUpload } = await import('./studio-logo.ts')

const ORG = '019a0000-0000-7000-8000-00000000000a'
const OTHER = '019a0000-0000-7000-8000-00000000000f'
const WEDDING = '019a0000-0000-7000-8000-0000000000aa'
const FILE = '019a0000-0000-7000-8000-0000000000bb'
const OLD = '019a0000-0000-7000-8000-0000000000cc'
const as = (role: 'owner' | 'admin' | 'member') => ({
  memberships: { userId: 'u1', orgs: [{ orgId: ORG, role }], weddings: [] },
  orgId: ORG,
})
const owner = as('owner')

beforeEach(() => {
  vi.clearAllMocks()
  events.length = 0
  puts.length = 0
  deletes.length = 0
  deleteResult = { ok: true }
  setLogoKey.mockImplementation(async () => {
    events.push('save')
    return { ok: true, value: { previous: `${ORG}/brand/${OLD}` } }
  })
})

describe('startLogoUpload', () => {
  it.each(['owner', 'admin'] as const)('signs a PUT under <org>/brand/ for an %s', async (role) => {
    const out = await startLogoUpload(as(role), { mime: 'image/png', sizeBytes: 1000 })
    expect(out).toMatchObject({ ok: true, headers: { 'Content-Type': 'image/png' } })
    expect(puts[0]).toMatch(new RegExp(`^${ORG}/brand/[0-9a-f-]{36}$`))
    // The browser sets Content-Length itself and refuses to be handed one.
    expect(out.ok && 'Content-Length' in out.headers).toBe(false)
  })

  it('signs nothing for a member', async () => {
    expect(await startLogoUpload(as('member'), { mime: 'image/png', sizeBytes: 1000 })).toEqual({
      ok: false,
      error: 'forbidden',
    })
    expect(puts).toEqual([])
  })

  it('signs nothing for an org the caller is not in', async () => {
    const stranger = { ...owner, orgId: OTHER }
    expect(await startLogoUpload(stranger, { mime: 'image/png', sizeBytes: 1 })).toMatchObject({
      error: 'forbidden',
    })
    expect(puts).toEqual([])
  })

  it.each([
    ['an SVG', { mime: 'image/svg+xml', sizeBytes: 100 }, 'typeNotAllowed'],
    ['a file over 2 MiB', { mime: 'image/png', sizeBytes: 2 * 1024 * 1024 + 1 }, 'tooLarge'],
    ['a size that is not a number', { mime: 'image/png', sizeBytes: '100' }, 'invalidSize'],
  ])('refuses %s', async (_label, input, error) => {
    expect(await startLogoUpload(owner, input)).toEqual({ ok: false, error })
    expect(puts).toEqual([])
  })
})

describe('confirmLogo', () => {
  it("saves the caller's org's brand key, then deletes the old object", async () => {
    expect(await confirmLogo(owner, FILE)).toEqual({ ok: true })
    expect(setLogoKey).toHaveBeenCalledWith({}, owner.memberships, ORG, `${ORG}/brand/${FILE}`)
    expect(events).toEqual(['save', `delete ${ORG}/brand/${OLD}`])
  })

  it('deletes nothing when there was no logo before', async () => {
    setLogoKey.mockResolvedValue({ ok: true, value: { previous: null } })
    await confirmLogo(owner, FILE)
    expect(deletes).toEqual([])
  })

  it('never deletes the key it has just saved', async () => {
    setLogoKey.mockResolvedValue({ ok: true, value: { previous: `${ORG}/brand/${FILE}` } })
    await confirmLogo(owner, FILE)
    expect(deletes).toEqual([])
  })

  it('refuses a file id that is not a UUID before any write', async () => {
    expect(await confirmLogo(owner, '../x')).toEqual({ ok: false, error: 'notFound' })
    expect(setLogoKey).not.toHaveBeenCalled()
  })

  it('deletes nothing when the save is refused', async () => {
    setLogoKey.mockResolvedValue({ ok: false, reason: 'forbidden' })
    expect(await confirmLogo(as('member'), FILE)).toEqual({ ok: false, error: 'forbidden' })
    expect(deletes).toEqual([])
  })

  it('still succeeds when the old object cannot be deleted, and reports it', async () => {
    deleteResult = { ok: false, detail: 'AccessDenied' }
    expect(await confirmLogo(owner, FILE)).toEqual({ ok: true })
    expect(reportSilentFailure).toHaveBeenCalledWith(
      'studio logo: old object not deleted',
      expect.objectContaining({ key: `${ORG}/brand/${OLD}`, detail: 'AccessDenied' }),
    )
  })

  it('never deletes a previous key that is not a brand object of this org', async () => {
    setLogoKey.mockResolvedValue({
      ok: true,
      value: { previous: `${ORG}/${WEDDING}/${OLD}` },
    })
    expect(await confirmLogo(owner, FILE)).toEqual({ ok: true })
    expect(deletes).toEqual([])
    expect(reportSilentFailure).toHaveBeenCalledWith(
      'studio logo: old key not a brand key',
      expect.anything(),
    )
  })
})

describe('removeLogo', () => {
  it('clears the key, then deletes the object', async () => {
    expect(await removeLogo(owner)).toEqual({ ok: true })
    expect(setLogoKey).toHaveBeenCalledWith({}, owner.memberships, ORG, null)
    expect(events).toEqual(['save', `delete ${ORG}/brand/${OLD}`])
  })
})

describe('logoUrl', () => {
  it('is null for no logo', async () => {
    expect(await logoUrl(ORG, null)).toBeNull()
  })

  it('signs a brand key of the org', async () => {
    expect(await logoUrl(ORG, `${ORG}/brand/${FILE}`)).toBe(
      `https://get.example/${ORG}/brand/${FILE}`,
    )
  })

  it.each([
    ['a wedding file', `${ORG}/${WEDDING}/${FILE}`],
    ["another org's logo", `${OTHER}/brand/${FILE}`],
  ])('is null, not a 500, for %s', async (_label, key) => {
    expect(await logoUrl(ORG, key)).toBeNull()
  })
})
