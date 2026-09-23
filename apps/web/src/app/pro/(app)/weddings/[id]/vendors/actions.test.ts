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
const createVendorLink = vi.fn()
const revokeVendorLink = vi.fn()

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
  createVendorLink: (...a: unknown[]) => createVendorLink(...a),
  revokeVendorLink: (...a: unknown[]) => revokeVendorLink(...a),
}))

const {
  addVendorToWedding,
  createVendorOnWedding,
  createVendorLinkAction,
  removeVendorFromWedding,
  revokeVendorLinkAction,
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
  createVendorLink.mockResolvedValue({ kind: 'created', id: LINK })
  revokeVendorLink.mockResolvedValue(true)
})

describe('every action', () => {
  it('answers notFound with no session, no org or a malformed wedding id', async () => {
    const calls = [
      () => addVendorToWedding(WEDDING, VENDOR),
      () => createVendorOnWedding(WEDDING, { name: 'A', category: 'B' }),
      () => setWeddingVendorStatus(WEDDING, LINK, 'booked'),
      () => saveWeddingVendor(WEDDING, LINK, 'booked', ''),
      () => removeVendorFromWedding(WEDDING, LINK),
      () => createVendorLinkAction(WEDDING, VENDOR, undefined),
      () => revokeVendorLinkAction(WEDDING, LINK),
    ]
    currentMemberships.mockResolvedValue(null)
    for (const c of calls) expect((await c()) as { ok: boolean }).toMatchObject({ ok: false })
    currentMemberships.mockResolvedValue({ userId: 'u1', orgs: [], weddings: [] })
    currentOrgId.mockResolvedValue(null)
    for (const c of calls) expect((await c()) as { ok: boolean }).toMatchObject({ ok: false })
    currentOrgId.mockResolvedValue(ORG)
    expect(await addVendorToWedding('nope', VENDOR)).toEqual({ ok: false, error: 'notFound' })
    expect(addWeddingVendor).not.toHaveBeenCalled()
    expect(createVendorForWedding).not.toHaveBeenCalled()
    expect(updateWeddingVendor).not.toHaveBeenCalled()
    expect(removeWeddingVendor).not.toHaveBeenCalled()
    expect(createVendorLink).not.toHaveBeenCalled()
    expect(revokeVendorLink).not.toHaveBeenCalled()
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

describe('createVendorLinkAction', () => {
  it('stores only a hash, hands back the plain token once, and refreshes', async () => {
    const out = await createVendorLinkAction(WEDDING, VENDOR, undefined)

    expect(out.ok).toBe(true)
    if (!out.ok) throw new Error('unreachable')
    // 32 random bytes, base64url -- see vendor-link-token.ts. Not asserted against a fixed
    // value: the whole point is that it is random per call.
    expect(out.token).toMatch(/^[A-Za-z0-9_-]{40,}$/)
    expect(new Date(out.expiresAt).getTime()).toBeGreaterThan(Date.now())

    const [, , , , , input] = createVendorLink.mock.calls[0] as [
      unknown,
      unknown,
      unknown,
      unknown,
      unknown,
      { tokenHash: string; expiresAt: Date },
    ]
    expect(input.tokenHash).toMatch(/^[0-9a-f]{64}$/)
    // The credential is in the response and never in what gets stored.
    expect(input.tokenHash).not.toBe(out.token)
    expect(revalidatePath).toHaveBeenCalledWith('/pro/weddings/[id]/vendors', 'page')
  })

  it('defaults the expiry to 30 days, and honours an explicit one within the cap', async () => {
    await createVendorLinkAction(WEDDING, VENDOR, undefined)
    const defaultInput = createVendorLink.mock.calls[0]?.[5] as { expiresAt: Date }
    expect(defaultInput.expiresAt.getTime()).toBeGreaterThan(Date.now() + 29 * 86_400_000)

    createVendorLink.mockClear()
    await createVendorLinkAction(WEDDING, VENDOR, '5')
    const customInput = createVendorLink.mock.calls[0]?.[5] as { expiresAt: Date }
    expect(customInput.expiresAt.getTime()).toBeLessThan(Date.now() + 6 * 86_400_000)
  })

  it.each([0, -1, 1.5, 181, 'nope', Number.NaN])(
    'refuses ttlDays %s before touching the repo',
    async (bad) => {
      expect(await createVendorLinkAction(WEDDING, VENDOR, bad)).toEqual({
        ok: false,
        error: 'invalid',
      })
      expect(createVendorLink).not.toHaveBeenCalled()
    },
  )

  it('refuses a malformed wedding_vendors id', async () => {
    expect(await createVendorLinkAction(WEDDING, 'x', undefined)).toEqual({
      ok: false,
      error: 'invalid',
    })
    expect(createVendorLink).not.toHaveBeenCalled()
  })

  it('relays a repo refusal and does not refresh', async () => {
    createVendorLink.mockResolvedValue({ kind: 'forbidden' })
    expect(await createVendorLinkAction(WEDDING, VENDOR, undefined)).toEqual({
      ok: false,
      error: 'forbidden',
    })
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})

describe('revokeVendorLinkAction', () => {
  it('revokes and refreshes', async () => {
    expect(await revokeVendorLinkAction(WEDDING, LINK)).toEqual({ ok: true })
    expect(revokeVendorLink).toHaveBeenCalledWith({}, expect.anything(), ORG, WEDDING, LINK)
    expect(revalidatePath).toHaveBeenCalledWith('/pro/weddings/[id]/vendors', 'page')
  })

  it('reports false and does not refresh when nothing was revoked', async () => {
    revokeVendorLink.mockResolvedValue(false)
    expect(await revokeVendorLinkAction(WEDDING, LINK)).toEqual({ ok: false })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('refuses a malformed link id', async () => {
    expect(await revokeVendorLinkAction(WEDDING, 'x')).toEqual({ ok: false })
    expect(revokeVendorLink).not.toHaveBeenCalled()
  })
})
