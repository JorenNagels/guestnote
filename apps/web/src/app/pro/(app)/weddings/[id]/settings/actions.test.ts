import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The settings actions. Same shape as `new/actions.test.ts`: the seams are mocked and the
 * assertions are about which repo function ran, with which ids, and which did not.
 */
const updateWedding = vi.fn()
const createWeddingEvent = vi.fn()
const updateWeddingEvent = vi.fn()
const deleteWeddingEvent = vi.fn()
const currentMemberships = vi.fn()
const currentOrgId = vi.fn()
const revalidatePath = vi.fn()

vi.mock('@guestnote/db', () => ({
  updateWedding: (...a: unknown[]) => updateWedding(...a),
  createWeddingEvent: (...a: unknown[]) => createWeddingEvent(...a),
  updateWeddingEvent: (...a: unknown[]) => updateWeddingEvent(...a),
  deleteWeddingEvent: (...a: unknown[]) => deleteWeddingEvent(...a),
}))
vi.mock('../../../../../../lib/db.ts', () => ({ getDb: () => ({}) }))
vi.mock('../../../../../../lib/principal.ts', () => ({
  currentMemberships: () => currentMemberships(),
  currentOrgId: () => currentOrgId(),
}))
vi.mock('next/cache', () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }))

const { updateWeddingAction, saveEventAction } = await import('./actions.ts')

const WID = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b'
const EID = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5c'
const MEMBERSHIPS = { userId: 'u1', orgs: [{ orgId: 'org-a', role: 'owner' }], weddings: [] }
const form = (entries: Record<string, string>) => {
  const fd = new FormData()
  for (const [k, v] of Object.entries(entries)) fd.set(k, v)
  return fd
}

beforeEach(() => {
  vi.clearAllMocks()
  currentMemberships.mockResolvedValue(MEMBERSHIPS)
  currentOrgId.mockResolvedValue('org-a')
  updateWedding.mockResolvedValue({ ok: true, value: { id: WID } })
  createWeddingEvent.mockResolvedValue({ ok: true, value: { id: EID } })
  updateWeddingEvent.mockResolvedValue({ ok: true, value: { id: EID } })
  deleteWeddingEvent.mockResolvedValue({ ok: true, value: null })
})

describe('updateWeddingAction', () => {
  it('saves and revalidates the whole dashboard tree', async () => {
    const state = await updateWeddingAction(
      WID,
      {},
      form({ coupleDisplayName: 'Els', notes: 'x', status: 'live', color: '#206560' }),
    )
    expect(state).toEqual({ notice: 'saved' })
    expect(updateWedding.mock.calls[0]?.slice(2, 4)).toEqual(['org-a', WID])
    expect(updateWedding.mock.calls[0]?.[4]).toMatchObject({ status: 'live', notes: 'x' })
    expect(revalidatePath).toHaveBeenCalledWith('/pro', 'layout')
  })

  it('answers forbidden, not not-found, when the repo returns null', async () => {
    updateWedding.mockResolvedValue({ ok: false, reason: 'notFound' })
    expect(await updateWeddingAction(WID, {}, form({ coupleDisplayName: 'Els' }))).toMatchObject({
      form: 'forbidden',
    })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('refuses an id that is not a uuid before the database sees it', async () => {
    expect(await updateWeddingAction('not-a-uuid', {}, form({ coupleDisplayName: 'Els' }))).toEqual(
      {
        form: 'forbidden',
      },
    )
    expect(updateWedding).not.toHaveBeenCalled()
  })

  it('refuses a signed-out caller', async () => {
    currentMemberships.mockResolvedValue(null)
    expect(await updateWeddingAction(WID, {}, form({ coupleDisplayName: 'Els' }))).toEqual({
      form: 'forbidden',
    })
    expect(updateWedding).not.toHaveBeenCalled()
  })

  it('returns the errors and the posted values when the input is invalid', async () => {
    const state = await updateWeddingAction(WID, {}, form({ coupleDisplayName: '', venue: 'Zaal' }))
    expect(state.errors).toEqual({ coupleDisplayName: 'required' })
    expect(state.values?.venue).toBe('Zaal')
    expect(updateWedding).not.toHaveBeenCalled()
  })
})

describe('saveEventAction', () => {
  const EVENT = { label: 'Receptie', startsOn: '2027-06-12', startsAt: '15:30' }

  it('adds when there is no event id', async () => {
    const state = await saveEventAction(WID, {}, form({ ...EVENT, eventId: '', intent: 'save' }))
    expect(state).toEqual({ notice: 'saved' })
    expect(createWeddingEvent).toHaveBeenCalledTimes(1)
    expect(updateWeddingEvent).not.toHaveBeenCalled()
  })

  it('updates when there is one, scoped to this wedding', async () => {
    await saveEventAction(WID, {}, form({ ...EVENT, eventId: EID, intent: 'save' }))
    expect(updateWeddingEvent.mock.calls[0]?.slice(2, 5)).toEqual(['org-a', WID, EID])
    expect(createWeddingEvent).not.toHaveBeenCalled()
  })

  it('removes on intent=remove, and does not validate the fields of a row being removed', async () => {
    const state = await saveEventAction(WID, {}, form({ eventId: EID, intent: 'remove' }))
    expect(state).toEqual({ notice: 'removed' })
    expect(deleteWeddingEvent.mock.calls[0]?.slice(2, 5)).toEqual(['org-a', WID, EID])
    expect(updateWeddingEvent).not.toHaveBeenCalled()
  })

  it('says forbidden when the event is not on this wedding', async () => {
    deleteWeddingEvent.mockResolvedValue({ ok: false, reason: 'notFound' })
    expect(await saveEventAction(WID, {}, form({ eventId: EID, intent: 'remove' }))).toEqual({
      form: 'forbidden',
    })
    updateWeddingEvent.mockResolvedValue({ ok: false, reason: 'notFound' })
    expect(
      await saveEventAction(WID, {}, form({ ...EVENT, eventId: EID, intent: 'save' })),
    ).toMatchObject({ form: 'forbidden' })
  })

  it('refuses ids that are not uuids', async () => {
    expect(await saveEventAction('nope', {}, form({ ...EVENT, intent: 'save' }))).toEqual({
      form: 'forbidden',
    })
    expect(
      await saveEventAction(WID, {}, form({ ...EVENT, eventId: 'nope', intent: 'save' })),
    ).toEqual({ form: 'forbidden' })
    expect(createWeddingEvent).not.toHaveBeenCalled()
    expect(updateWeddingEvent).not.toHaveBeenCalled()
  })

  it('returns errors and echoes the row when a field is wrong', async () => {
    const state = await saveEventAction(
      WID,
      {},
      form({ label: '', startsOn: '2027-06-12', startsAt: '25:00', eventId: '', intent: 'save' }),
    )
    expect(state.errors).toEqual({ label: 'required', startsAt: 'invalidTime' })
    expect(state.values?.startsOn).toBe('2027-06-12')
    expect(createWeddingEvent).not.toHaveBeenCalled()
  })
})
