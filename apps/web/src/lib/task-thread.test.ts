import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The one loader behind the task page and the checklist's panel (spec 0009 B1). The repo calls
 * are mocked; which rows they return for which principal is the db suite's question. What is
 * asserted here is the loader's own branching: no query for a malformed id, `null` for a task the
 * repo does not return, and the couple's unread dot cleared only when there is one.
 */
const getTask = vi.fn()
const listTaskComments = vi.fn()
const getCoupleAccess = vi.fn()
const markCoupleActivitySeen = vi.fn()
vi.mock('@guestnote/db', () => ({
  getTask: (...a: unknown[]) => getTask(...a),
  listTaskComments: (...a: unknown[]) => listTaskComments(...a),
  getCoupleAccess: (...a: unknown[]) => getCoupleAccess(...a),
  markCoupleActivitySeen: (...a: unknown[]) => markCoupleActivitySeen(...a),
}))

const { loadTaskThread } = await import('./task-thread.ts')

const TID = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a60'
const scope = {} as never

beforeEach(() => {
  vi.clearAllMocks()
  getTask.mockResolvedValue({ id: TID, coupleUnread: false })
  listTaskComments.mockResolvedValue([{ id: 'c1' }])
  getCoupleAccess.mockResolvedValue({ partners: [{ userId: 'u-couple' }] })
})

describe('loadTaskThread', () => {
  it('reads nothing for an id that is not a uuid', async () => {
    expect(await loadTaskThread(scope, 'nope')).toBeNull()
    expect(await loadTaskThread(scope, ['x'])).toBeNull()
    expect(getTask).not.toHaveBeenCalled()
  })

  it('is null when the repo does not return the task', async () => {
    getTask.mockResolvedValue(null)
    expect(await loadTaskThread(scope, TID)).toBeNull()
    expect(listTaskComments).not.toHaveBeenCalled()
  })

  it('returns the task, its comments and the couple authors', async () => {
    expect(await loadTaskThread(scope, TID)).toEqual({
      task: { id: TID, coupleUnread: false },
      comments: [{ id: 'c1' }],
      coupleUserIds: ['u-couple'],
    })
    expect(markCoupleActivitySeen).not.toHaveBeenCalled()
  })

  it('clears the couple’s unread dot when there is one', async () => {
    getTask.mockResolvedValue({ id: TID, coupleUnread: true })
    await loadTaskThread(scope, TID)
    expect(markCoupleActivitySeen).toHaveBeenCalledWith(scope, { kind: 'task', id: TID })
  })

  it('has no couple authors on a wedding without a couple', async () => {
    getCoupleAccess.mockResolvedValue(null)
    expect((await loadTaskThread(scope, TID))?.coupleUserIds).toEqual([])
  })
})
