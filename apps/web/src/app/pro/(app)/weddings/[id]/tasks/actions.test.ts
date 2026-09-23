import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The checklist's Server Functions, and what each does BEFORE it reaches the repository.
 *
 * Mocked: `@guestnote/db` (the repo, tested against a real Postgres in
 * `packages/db/test/tasks-repo.test.ts`), `lib/principal.ts`, `lib/db.ts` and `next/cache`.
 * What is asserted is the part that lives here: a caller with no session gets `notFound` and the
 * repo is never called, a malformed id never reaches Postgres (which would throw on the uuid
 * cast and turn a 404 into a 500), a bad form never reaches the repo, and a success revalidates.
 */
const addTaskComment = vi.fn()
const completeTask = vi.fn()
const createTask = vi.fn()
const updateTask = vi.fn()
const currentMemberships = vi.fn()
const currentOrgId = vi.fn()
const revalidatePath = vi.fn()

vi.mock('@guestnote/db', () => ({
  addTaskComment: (...a: unknown[]) => addTaskComment(...a),
  completeTask: (...a: unknown[]) => completeTask(...a),
  createTask: (...a: unknown[]) => createTask(...a),
  updateTask: (...a: unknown[]) => updateTask(...a),
}))
vi.mock('next/cache', () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }))
vi.mock('../../../../../../lib/db.ts', () => ({ getDb: () => ({ db: true }) }))
vi.mock('../../../../../../lib/principal.ts', () => ({
  currentMemberships: () => currentMemberships(),
  currentOrgId: () => currentOrgId(),
  // The real `currentCaller`, over the two mocks above.
  currentCaller: async () => {
    const [memberships, orgId] = [await currentMemberships(), await currentOrgId()]
    return memberships && orgId ? { memberships, orgId } : null
  },
}))

const {
  addCommentAction,
  createTaskAction,
  setTaskDoneAction,
  setTaskVisibilityAction,
  updateTaskAction,
} = await import('./actions.ts')

const WEDDING = '018f0000-0000-7000-8000-0000000000aa'
const TASK = '018f0000-0000-7000-8000-000000000001'
const MEMBERSHIPS = { userId: 'u1', orgs: [], weddings: [] }
const FORM = {
  title: 'Book the DJ',
  notes: '',
  assigneeRole: 'planner',
  visibility: 'shared',
  dueKind: 'none',
  offsetDays: '',
  offsetDirection: 'before',
  date: '',
}
const row = { id: TASK }

beforeEach(() => {
  vi.clearAllMocks()
  currentMemberships.mockResolvedValue(MEMBERSHIPS)
  currentOrgId.mockResolvedValue('org-1')
  for (const fn of [createTask, updateTask, completeTask, addTaskComment]) {
    fn.mockResolvedValue({ ok: true, value: row })
  }
})

describe('without a session', () => {
  it.each([
    ['create', () => createTaskAction(WEDDING, FORM)],
    ['update', () => updateTaskAction(WEDDING, TASK, FORM)],
    ['done', () => setTaskDoneAction(WEDDING, TASK, true)],
    ['visibility', () => setTaskVisibilityAction(WEDDING, TASK, 'internal')],
    ['comment', () => addCommentAction(WEDDING, TASK, 'hello')],
  ])('%s answers notFound and never calls the repo', async (_name, call) => {
    currentMemberships.mockResolvedValue(null)
    expect(await call()).toEqual({ ok: false, error: 'notFound' })
    for (const fn of [createTask, updateTask, completeTask, addTaskComment]) {
      expect(fn).not.toHaveBeenCalled()
    }
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('answers notFound when there is a session but no organisation', async () => {
    currentOrgId.mockResolvedValue(null)
    expect(await setTaskDoneAction(WEDDING, TASK, true)).toEqual({ ok: false, error: 'notFound' })
    expect(completeTask).not.toHaveBeenCalled()
  })
})

describe('a malformed id', () => {
  it('is notFound and never reaches the repo', async () => {
    expect(await setTaskDoneAction('not-a-uuid', TASK, true)).toEqual({
      ok: false,
      error: 'notFound',
    })
    expect(await setTaskDoneAction(WEDDING, 'x', true)).toEqual({ ok: false, error: 'notFound' })
    expect(await createTaskAction('new', FORM)).toEqual({ ok: false, error: 'notFound' })
    expect(completeTask).not.toHaveBeenCalled()
    expect(createTask).not.toHaveBeenCalled()
  })
})

describe('createTaskAction', () => {
  it('passes the parsed input, not the raw values, and returns the new id', async () => {
    const result = await createTaskAction(WEDDING, { ...FORM, title: '  Book the DJ ', notes: ' ' })
    expect(result).toEqual({ ok: true, taskId: TASK })
    expect(createTask).toHaveBeenCalledWith(
      { db: true },
      MEMBERSHIPS,
      'org-1',
      WEDDING,
      expect.objectContaining({ title: 'Book the DJ', notes: null, due: { kind: 'none' } }),
    )
    expect(revalidatePath).toHaveBeenCalledWith('/pro/weddings/[id]/tasks', 'layout')
  })

  it('refuses a bad form before the repo and does not revalidate', async () => {
    expect(await createTaskAction(WEDDING, { ...FORM, title: '' })).toEqual({
      ok: false,
      error: 'title',
    })
    expect(createTask).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('is notFound when the repo says the wedding is unreachable', async () => {
    createTask.mockResolvedValue({ ok: false, reason: 'notFound' })
    expect(await createTaskAction(WEDDING, FORM)).toEqual({ ok: false, error: 'notFound' })
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})

describe('updateTaskAction', () => {
  it('sends the parsed form and revalidates', async () => {
    expect(await updateTaskAction(WEDDING, TASK, FORM)).toEqual({ ok: true })
    expect(updateTask).toHaveBeenCalledWith(
      { db: true },
      MEMBERSHIPS,
      'org-1',
      WEDDING,
      TASK,
      expect.objectContaining({ title: 'Book the DJ' }),
    )
    expect(revalidatePath).toHaveBeenCalledTimes(1)
  })

  it('is notFound for a task in another wedding (the repo answers null)', async () => {
    updateTask.mockResolvedValue({ ok: false, reason: 'notFound' })
    expect(await updateTaskAction(WEDDING, TASK, FORM)).toEqual({ ok: false, error: 'notFound' })
  })
})

describe('setTaskDoneAction', () => {
  it('completes only for a literal true', async () => {
    await setTaskDoneAction(WEDDING, TASK, true)
    expect(completeTask).toHaveBeenLastCalledWith(
      { db: true },
      MEMBERSHIPS,
      'org-1',
      WEDDING,
      TASK,
      true,
    )
    // The wire can send a string; "false" is truthy in JS and must not complete anything.
    await setTaskDoneAction(WEDDING, TASK, 'false' as unknown as boolean)
    expect(completeTask).toHaveBeenLastCalledWith(
      { db: true },
      MEMBERSHIPS,
      'org-1',
      WEDDING,
      TASK,
      false,
    )
  })
})

describe('setTaskVisibilityAction', () => {
  it('sends only the visibility, and folds an unknown value to shared', async () => {
    await setTaskVisibilityAction(WEDDING, TASK, 'internal')
    expect(updateTask).toHaveBeenLastCalledWith({ db: true }, MEMBERSHIPS, 'org-1', WEDDING, TASK, {
      visibility: 'internal',
    })
    await setTaskVisibilityAction(WEDDING, TASK, 'secret' as never)
    expect(updateTask).toHaveBeenLastCalledWith({ db: true }, MEMBERSHIPS, 'org-1', WEDDING, TASK, {
      visibility: 'shared',
    })
  })
})

describe('addCommentAction', () => {
  it('refuses an empty, blank, over-long or non-string body before the repo', async () => {
    for (const body of ['', '   ', 'x'.repeat(4001), 42, null]) {
      expect(await addCommentAction(WEDDING, TASK, body)).toEqual({ ok: false, error: 'comment' })
    }
    expect(addTaskComment).not.toHaveBeenCalled()
  })

  it('trims the body and revalidates', async () => {
    expect(await addCommentAction(WEDDING, TASK, '  hello  ')).toEqual({ ok: true })
    expect(addTaskComment).toHaveBeenCalledWith(
      { db: true },
      MEMBERSHIPS,
      'org-1',
      WEDDING,
      TASK,
      'hello',
    )
    expect(revalidatePath).toHaveBeenCalledTimes(1)
  })

  it('is notFound when the task is not in that wedding', async () => {
    addTaskComment.mockResolvedValue({ ok: false, reason: 'notFound' })
    expect(await addCommentAction(WEDDING, TASK, 'hi')).toEqual({ ok: false, error: 'notFound' })
  })
})
