import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The run sheet's shift action (spec 0009 B2). Same mocks as the vendors' actions test: the
 * repo is `packages/db/test`'s job, and what is asserted here is what the ACTION does with what
 * the client sent -- the delta parsed on the server, the ids checked, memberships taken from the
 * session, and the repo's refusal turned into a key the sheet can word.
 */
const revalidatePath = vi.fn()
const currentMemberships = vi.fn()
const currentOrgId = vi.fn()
const shiftRunSheetTimes = vi.fn()

vi.mock('next/cache', () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }))
vi.mock('../../../../../../lib/db.ts', () => ({ getDb: () => ({}) }))
vi.mock('../../../../../../lib/principal.ts', () => ({
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
  shiftRunSheetTimes: (...a: unknown[]) => shiftRunSheetTimes(...a),
}))

const { shiftRunSheetFrom } = await import('./actions.ts')

const WID = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b'
const IID = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5c'
const MEMBERSHIPS = { userId: 'u1', orgs: [{ orgId: 'org-a', role: 'owner' }], weddings: [] }

beforeEach(() => {
  vi.clearAllMocks()
  currentMemberships.mockResolvedValue(MEMBERSHIPS)
  currentOrgId.mockResolvedValue('org-a')
  shiftRunSheetTimes.mockResolvedValue({ ok: true, value: { id: IID, moved: 3 } })
})

describe('shiftRunSheetFrom', () => {
  it("shifts in the session's scope for this wedding, and refreshes the run sheet", async () => {
    expect(await shiftRunSheetFrom(WID, IID, -15)).toEqual({ ok: true })
    expect(shiftRunSheetTimes).toHaveBeenCalledTimes(1)
    expect(shiftRunSheetTimes.mock.calls[0]?.[0]).toMatchObject({ orgId: 'org-a', weddingId: WID })
    expect(shiftRunSheetTimes.mock.calls[0]?.slice(1)).toEqual([IID, -15])
    expect(revalidatePath).toHaveBeenCalledWith('/pro/weddings/[id]/run-sheet', 'page')
  })

  it('parses a text delta on the server, the same rule as the field', async () => {
    await shiftRunSheetFrom(WID, IID, ' 20 ')
    expect(shiftRunSheetTimes.mock.calls[0]?.[2]).toBe(20)
  })

  it('refuses a delta outside -720..720, zero or fractional, before the repo sees it', async () => {
    for (const bad of [0, 721, -721, 1.5, 'abc', null]) {
      expect(await shiftRunSheetFrom(WID, IID, bad)).toEqual({ ok: false, error: 'shift' })
    }
    expect(shiftRunSheetTimes).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('refuses ids that are not uuids, and a caller with no session', async () => {
    expect(await shiftRunSheetFrom(WID, 'not-a-uuid', 15)).toEqual({
      ok: false,
      error: 'notFound',
    })
    expect(await shiftRunSheetFrom('not-a-uuid', IID, 15)).toEqual({
      ok: false,
      error: 'notFound',
    })
    currentMemberships.mockResolvedValue(null)
    expect(await shiftRunSheetFrom(WID, IID, 15)).toEqual({ ok: false, error: 'notFound' })
    expect(shiftRunSheetTimes).not.toHaveBeenCalled()
  })

  it("answers shiftCrosses for the repo's shiftCrossesPrevious, and does not revalidate", async () => {
    shiftRunSheetTimes.mockResolvedValue({ ok: false, reason: 'shiftCrossesPrevious' })
    expect(await shiftRunSheetFrom(WID, IID, -15)).toEqual({ ok: false, error: 'shiftCrosses' })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it("answers notFound for the repo's itemNotFound, and does not revalidate", async () => {
    shiftRunSheetTimes.mockResolvedValue({ ok: false, reason: 'itemNotFound' })
    expect(await shiftRunSheetFrom(WID, IID, 15)).toEqual({ ok: false, error: 'notFound' })
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})
