import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The couple's Server Functions decide two things before the database does: is this caller a
 * couple of this wedding (`currentCouple`), and is the comment a comment. Everything after that
 * is the `couple_*` functions', tested in `packages/db/test/couple-portal.test.ts`.
 */
const currentCouple = vi.fn()
const coupleSetTaskDone = vi.fn()
const coupleAddTaskComment = vi.fn()
const coupleAddFileComment = vi.fn()
const coupleDeleteImage = vi.fn()
vi.mock('../../../../../lib/couple.ts', () => ({
  currentCouple: (id: unknown) => currentCouple(id),
  writable: (c: { home: { status: string } }) => c.home.status === 'live',
  startCoupleUpload: vi.fn(),
  confirmCoupleUpload: vi.fn(),
}))
vi.mock('../../../../../lib/db.ts', () => ({ getDb: () => ({}) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next-intl/server', () => ({
  getLocale: async () => 'nl',
  getTranslations: async () => (k: string) => k,
}))
vi.mock('@guestnote/db', () => ({
  coupleSetTaskDone: (...a: unknown[]) => coupleSetTaskDone(...a),
  coupleAddTaskComment: (...a: unknown[]) => coupleAddTaskComment(...a),
  coupleAddFileComment: (...a: unknown[]) => coupleAddFileComment(...a),
  coupleDeleteImage: (...a: unknown[]) => coupleDeleteImage(...a),
  coupleDeleteTaskComment: vi.fn(),
  coupleDeleteFileComment: vi.fn(),
  coupleFileComments: vi.fn(),
  coupleTaskComments: vi.fn(),
}))

const { addImageComment, addTaskComment, deleteImage, tickTask } = await import('./actions.ts')

const W = '018f0000-0000-7000-8000-0000000000aa'
const T = '018f0000-0000-7000-8000-000000000001'
const COUPLE = { principal: { userId: 'u' }, home: { status: 'live', studioName: 'S' } }

beforeEach(() => {
  vi.clearAllMocks()
  for (const f of [
    coupleSetTaskDone,
    coupleAddTaskComment,
    coupleAddFileComment,
    coupleDeleteImage,
  ]) {
    f.mockResolvedValue({ ok: true, value: null })
  }
})

describe('the couple Server Functions', () => {
  it('refuse a caller who is not a couple of this wedding, before any write', async () => {
    currentCouple.mockResolvedValue(null)
    expect(await tickTask(W, T, true)).toBe(false)
    expect(await addTaskComment(W, T, 'hoi')).toBe(false)
    expect(await addImageComment(W, T, 'hoi')).toBe(false)
    expect(await deleteImage(W, T)).toBe(false)
    for (const f of [
      coupleSetTaskDone,
      coupleAddTaskComment,
      coupleAddFileComment,
      coupleDeleteImage,
    ]) {
      expect(f).not.toHaveBeenCalled()
    }
  })

  it('refuse an id that is not a UUID, and a tick that is not a boolean', async () => {
    currentCouple.mockResolvedValue(COUPLE)
    expect(await tickTask(W, 'nope', true)).toBe(false)
    expect(await tickTask(W, T, 'yes' as unknown as boolean)).toBe(false)
    expect(coupleSetTaskDone).not.toHaveBeenCalled()
  })

  it('refuse a blank comment and one over 4000, and pass a real one through trimmed', async () => {
    currentCouple.mockResolvedValue(COUPLE)
    expect(await addTaskComment(W, T, '   ')).toBe(false)
    expect(await addTaskComment(W, T, 'x'.repeat(4001))).toBe(false)
    expect(coupleAddTaskComment).not.toHaveBeenCalled()
    expect(await addTaskComment(W, T, '  Welke DJ?  ')).toBe(true)
    expect(coupleAddTaskComment).toHaveBeenCalledWith({}, COUPLE.principal, T, 'Welke DJ?')
  })
})
