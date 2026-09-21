import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * One wedding's vendor actions. Same mocks as the directory's test, for the same reason: the
 * repo is `packages/db/test`'s job, and what is asserted here is what the ACTION does with an
 * id it was handed -- validate it, take memberships from the session and never from the
 * arguments, and forward only the field the caller meant to change.
 */
const revalidatePath = vi.fn()
const currentMemberships = vi.fn()
const currentOrgId = vi.fn()
const addWeddingVendor = vi.fn()
const createVendorForWedding = vi.fn()
const removeWeddingVendor = vi.fn()
const updateWeddingVendor = vi.fn()

vi.mock('next/cache', () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }))
vi.mock('../../../../../../lib/db.ts', () => ({ getDb: () => ({}) }))
vi.mock('../../../../../../lib/principal.ts', () => ({
  currentMemberships: () => currentMemberships(),
  currentOrgId: () => currentOrgId(),
}))
vi.mock('@guestnote/db', async (orig) => ({
  ...(await orig<typeof import('@guestnote/db')>()),
  addWeddingVendor: (...a: unknown[]) => addWeddingVendor(...a),
  createVendorForWedding: (...a: unknown[]) => createVendorForWedding(...a),
  removeWeddingVendor: (...a: unknown[]) => removeWeddingVendor(...a),
  updateWeddingVendor: (...a: unknown[]) => updateWeddingVendor(...a),
}))

const {
  addVendorToWedding,
  createVendorOnWedding,
  removeVendorFromWedding,
  saveWeddingVendor,
  setWeddingVendorStatus,
} = await import('./actions.ts')

const ORG = 'aaaaaaaa-0000-0000-0000-00000000000a'
const WEDDING = '11111111-0000-0000-0000-000000000001'
const VENDOR = '0195f3a2-7b1c-7d2e-8a3b-1c2d3e4f5a6b'
const LINK = '0195f3a2-7b1c-7d2e-8a3b-1c2d3e4f5a6c'
const OK = { ok: true, value: null }

beforeEach(() => {
  vi.clearAllMocks()
  currentOrgId.mockResolvedValue(ORG)
  currentMemberships.mockResolvedValue({
    userId: 'u1',
    orgs: [{ orgId: ORG, role: 'owner' }],
    weddings: [],
  })
  for (const f of [
    addWeddingVendor,
    createVendorForWedding,
    removeWeddingVendor,
    updateWeddingVendor,
  ])
    f.mockResolvedValue(OK)
})

describe('every action', () => {
  it('answers notFound with no session, no org or a malformed wedding id', async () => {
    const calls = [
      () => addVendorToWedding(WEDDING, VENDOR),
      () => createVendorOnWedding(WEDDING, { name: 'A', category: 'B' }),
      () => setWeddingVendorStatus(WEDDING, LINK, 'booked'),
      () => saveWeddingVendor(WEDDING, LINK, 'booked', ''),
      () => removeVendorFromWedding(WEDDING, LINK),
    ]
    currentMemberships.mockResolvedValue(null)
    for (const c of calls) expect(await c()).toEqual({ ok: false, error: 'notFound' })
    currentMemberships.mockResolvedValue({ userId: 'u1', orgs: [], weddings: [] })
    currentOrgId.mockResolvedValue(null)
    for (const c of calls) expect(await c()).toEqual({ ok: false, error: 'notFound' })
    currentOrgId.mockResolvedValue(ORG)
    expect(await addVendorToWedding('nope', VENDOR)).toEqual({ ok: false, error: 'notFound' })
    expect(addWeddingVendor).not.toHaveBeenCalled()
    expect(createVendorForWedding).not.toHaveBeenCalled()
    expect(updateWeddingVendor).not.toHaveBeenCalled()
    expect(removeWeddingVendor).not.toHaveBeenCalled()
  })
})

describe('addVendorToWedding', () => {
  it('links and refreshes the wedding page only', async () => {
    expect(await addVendorToWedding(WEDDING, VENDOR)).toEqual({ ok: true })
    expect(addWeddingVendor).toHaveBeenCalledWith({}, expect.anything(), ORG, WEDDING, VENDOR)
    expect(revalidatePath).toHaveBeenCalledWith('/pro/weddings/[id]/vendors', 'page')
    expect(revalidatePath).not.toHaveBeenCalledWith('/pro/vendors')
  })

  it('refuses a malformed vendor id', async () => {
    expect(await addVendorToWedding(WEDDING, 'x')).toEqual({ ok: false, error: 'invalid' })
    expect(addWeddingVendor).not.toHaveBeenCalled()
  })

  it('relays a duplicate and does not refresh', async () => {
    addWeddingVendor.mockResolvedValue({ ok: false, reason: 'duplicate' })
    expect(await addVendorToWedding(WEDDING, VENDOR)).toEqual({ ok: false, error: 'duplicate' })
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})

describe('createVendorOnWedding', () => {
  it('creates and refreshes the directory too, since it gained a row', async () => {
    expect(await createVendorOnWedding(WEDDING, { name: 'A', category: 'B' })).toEqual({ ok: true })
    expect(revalidatePath).toHaveBeenCalledWith('/pro/vendors')
  })

  it('relays forbidden for a member', async () => {
    createVendorForWedding.mockResolvedValue({ ok: false, reason: 'forbidden' })
    expect(await createVendorOnWedding(WEDDING, { name: 'A', category: 'B' })).toEqual({
      ok: false,
      error: 'forbidden',
    })
  })

  it('refuses invalid input before the repo', async () => {
    expect(await createVendorOnWedding(WEDDING, { name: 'A' })).toEqual({
      ok: false,
      error: 'invalid',
    })
    expect(createVendorForWedding).not.toHaveBeenCalled()
  })
})

describe('setWeddingVendorStatus', () => {
  /** The select must not carry notes: it would overwrite an edit made in another tab. */
  it('forwards the status and no notes key', async () => {
    await setWeddingVendorStatus(WEDDING, LINK, 'booked')
    expect(updateWeddingVendor).toHaveBeenCalledWith({}, expect.anything(), ORG, WEDDING, LINK, {
      status: 'booked',
    })
  })

  it('refuses a status outside the list', async () => {
    expect(await setWeddingVendorStatus(WEDDING, LINK, 'signed')).toEqual({
      ok: false,
      error: 'invalid',
    })
    expect(updateWeddingVendor).not.toHaveBeenCalled()
  })
})

describe('saveWeddingVendor', () => {
  it('forwards status and notes, an empty note as null', async () => {
    await saveWeddingVendor(WEDDING, LINK, 'quoted', '  ')
    expect(updateWeddingVendor).toHaveBeenCalledWith({}, expect.anything(), ORG, WEDDING, LINK, {
      status: 'quoted',
      notes: null,
    })
  })

  it('refuses a non-string note', async () => {
    expect(await saveWeddingVendor(WEDDING, LINK, 'quoted', 5)).toEqual({
      ok: false,
      error: 'invalid',
    })
    expect(updateWeddingVendor).not.toHaveBeenCalled()
  })
})

describe('removeVendorFromWedding', () => {
  it('unlinks by link id', async () => {
    expect(await removeVendorFromWedding(WEDDING, LINK)).toEqual({ ok: true })
    expect(removeWeddingVendor).toHaveBeenCalledWith({}, expect.anything(), ORG, WEDDING, LINK)
  })

  it('refuses a malformed link id', async () => {
    expect(await removeVendorFromWedding(WEDDING, 'x')).toEqual({ ok: false, error: 'invalid' })
    expect(removeWeddingVendor).not.toHaveBeenCalled()
  })
})
