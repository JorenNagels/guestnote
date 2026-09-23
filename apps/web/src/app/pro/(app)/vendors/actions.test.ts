import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The directory's writes. Mocked: `next/cache`, `lib/principal.ts`, `lib/db.ts` and the four
 * repo functions the actions call. `vendorDirectoryAccess` stays real, because the assertion
 * that matters is that a `member` never reaches a write and that is decided by it.
 * What the repo does with a principal is `packages/db/test`'s job against a real Postgres.
 */
const revalidatePath = vi.fn()
const currentMemberships = vi.fn()
const currentOrgId = vi.fn()
const createVendor = vi.fn()
const updateVendor = vi.fn()
const archiveVendor = vi.fn()

vi.mock('next/cache', () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }))
vi.mock('../../../../lib/db.ts', () => ({ getDb: () => ({}) }))
vi.mock('../../../../lib/principal.ts', () => ({
  currentMemberships: () => currentMemberships(),
  currentOrgId: () => currentOrgId(),
  // The real `currentCaller`, over the two mocks above.
  currentCaller: async () => {
    const [memberships, orgId] = [await currentMemberships(), await currentOrgId()]
    return memberships && orgId ? { memberships, orgId } : null
  },
}))
vi.mock('@guestnote/db', async (orig) => ({
  ...(await orig<typeof import('@guestnote/db')>()),
  createVendor: (...a: unknown[]) => createVendor(...a),
  updateVendor: (...a: unknown[]) => updateVendor(...a),
  archiveVendor: (...a: unknown[]) => archiveVendor(...a),
}))

const { archiveDirectoryVendor, createDirectoryVendor, updateDirectoryVendor } = await import(
  './actions.ts'
)

const ORG = 'aaaaaaaa-0000-0000-0000-00000000000a'
const VENDOR = '0195f3a2-7b1c-7d2e-8a3b-1c2d3e4f5a6b'
const INPUT = { name: 'Anna', category: 'Bloemen', email: '', phone: '', notes: '' }

function as(role: 'owner' | 'admin' | 'member') {
  currentOrgId.mockResolvedValue(ORG)
  currentMemberships.mockResolvedValue({
    userId: 'u1',
    orgs: [{ orgId: ORG, role }],
    weddings: role === 'member' ? [{ weddingId: 'w1', role: 'editor' }] : [],
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  createVendor.mockResolvedValue({ ok: true, value: { id: VENDOR } })
  updateVendor.mockResolvedValue({ ok: true, value: null })
  archiveVendor.mockResolvedValue({ ok: true, value: null })
  as('owner')
})

describe('the directory actions refuse a member before the repo is reached', () => {
  it('on create, update and archive', async () => {
    as('member')
    expect(await createDirectoryVendor(INPUT)).toEqual({ ok: false, error: 'forbidden' })
    expect(await updateDirectoryVendor(VENDOR, INPUT)).toEqual({ ok: false, error: 'forbidden' })
    expect(await archiveDirectoryVendor(VENDOR)).toEqual({ ok: false, error: 'forbidden' })
    expect(createVendor).not.toHaveBeenCalled()
    expect(updateVendor).not.toHaveBeenCalled()
    expect(archiveVendor).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('and refuse with no session or no org', async () => {
    currentMemberships.mockResolvedValue(null)
    expect(await createDirectoryVendor(INPUT)).toEqual({ ok: false, error: 'forbidden' })
    as('owner')
    currentOrgId.mockResolvedValue(null)
    expect(await archiveDirectoryVendor(VENDOR)).toEqual({ ok: false, error: 'forbidden' })
    expect(createVendor).not.toHaveBeenCalled()
  })
})

describe('createDirectoryVendor', () => {
  it('passes parsed input, with empty text as null, and refreshes both trees', async () => {
    for (const role of ['owner', 'admin'] as const) {
      as(role)
      createVendor.mockClear()
      expect(await createDirectoryVendor(INPUT)).toEqual({ ok: true })
      expect(createVendor).toHaveBeenCalledWith({}, expect.anything(), ORG, {
        name: 'Anna',
        category: 'Bloemen',
        email: null,
        phone: null,
        notes: null,
      })
    }
    expect(revalidatePath).toHaveBeenCalledWith('/pro/vendors')
    expect(revalidatePath).toHaveBeenCalledWith('/pro/weddings/[id]/vendors', 'page')
  })

  it('refuses bad input without a query', async () => {
    expect(await createDirectoryVendor({ ...INPUT, name: '' })).toEqual({
      ok: false,
      error: 'invalid',
    })
    expect(createVendor).not.toHaveBeenCalled()
  })
})

describe('updateDirectoryVendor and archiveDirectoryVendor', () => {
  it('refuse a malformed id as invalid', async () => {
    expect(await updateDirectoryVendor('nope', INPUT)).toEqual({ ok: false, error: 'invalid' })
    expect(await archiveDirectoryVendor('nope')).toEqual({ ok: false, error: 'invalid' })
    expect(updateVendor).not.toHaveBeenCalled()
    expect(archiveVendor).not.toHaveBeenCalled()
  })

  it('relay the repo refusal and do not revalidate on it', async () => {
    updateVendor.mockResolvedValue({ ok: false, reason: 'notFound' })
    archiveVendor.mockResolvedValue({ ok: false, reason: 'notFound' })
    expect(await updateDirectoryVendor(VENDOR, INPUT)).toEqual({ ok: false, error: 'notFound' })
    expect(await archiveDirectoryVendor(VENDOR)).toEqual({ ok: false, error: 'notFound' })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('succeed and refresh', async () => {
    expect(await updateDirectoryVendor(VENDOR, INPUT)).toEqual({ ok: true })
    expect(await archiveDirectoryVendor(VENDOR)).toEqual({ ok: true })
    expect(revalidatePath).toHaveBeenCalled()
  })
})
