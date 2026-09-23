import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  addTaskComment,
  completeTask,
  createTask,
  createTasks,
  getTask,
  listAssignedTasks,
  listTaskComments,
  listTasks,
  type Memberships,
  resolveMemberships,
  updateTask,
} from '../src/repos/index.ts'
import { connect, F, type Harness, NOT_FOUND, reseed, seedExec, unwrap } from './harness.ts'

/**
 * The tasks repo (slice S2) against a real Postgres with the real policies.
 *
 * `isolation.test.ts` already proves the POLICIES on `tasks` and `task_comments`. This file
 * proves the repo on top of them: that it refuses the roles spec 0003 keeps out, that an
 * org-wide principal is narrowed to the wedding it asked for, and that the derived due date
 * follows the wedding.
 */

let h: Harness
let owner: Memberships
let member: Memberships
let couple: Memberships
let otherOrg: Memberships

beforeAll(async () => {
  h = connect()
})
afterAll(async () => {
  await h?.end()
})
beforeEach(async () => {
  await reseed()
  ;[owner, member, couple, otherOrg] = await Promise.all([
    resolveMemberships(h.db, F.staffA),
    resolveMemberships(h.db, F.memberA),
    resolveMemberships(h.db, F.coupleA1),
    resolveMemberships(h.db, F.staffB),
  ])
})

const titles = (rows: { title: string }[]) => rows.map((r) => r.title).sort()

describe('who may read', () => {
  it('gives an owner every task of the named wedding, internal ones included, and no sibling', async () => {
    const rows = await listTasks(h.db, owner, F.orgA, F.weddingA1)
    expect(titles(rows)).toEqual(['Book the DJ', 'Chase the late invoice'])
  })

  it('gives an assigned member the same, and nothing for a wedding they are not assigned to', async () => {
    expect(titles(await listTasks(h.db, member, F.orgA, F.weddingA1))).toEqual([
      'Book the DJ',
      'Chase the late invoice',
    ])
    expect(await listTasks(h.db, member, F.orgA, F.weddingA2)).toEqual([])
    expect(await getTask(h.db, member, F.orgA, F.weddingA2, F.taskA2Shared)).toBeNull()
  })

  it('gives a couple nothing, though the policy would let them read the shared task', async () => {
    expect(await listTasks(h.db, couple, F.orgA, F.weddingA1)).toEqual([])
    expect(await getTask(h.db, couple, F.orgA, F.weddingA1, F.taskA1Shared)).toBeNull()
    expect(await createTask(h.db, couple, F.orgA, F.weddingA1, { title: 'x' })).toEqual(NOT_FOUND)
    expect(await listTaskComments(h.db, couple, F.orgA, F.weddingA1, F.taskA1Shared)).toEqual([])
  })

  it('answers another tenant with the same nothing as a missing task', async () => {
    expect(await listTasks(h.db, otherOrg, F.orgA, F.weddingA1)).toEqual([])
    expect(await listTasks(h.db, otherOrg, F.orgB, F.weddingA1)).toEqual([])
    expect(await getTask(h.db, otherOrg, F.orgB, F.weddingA1, F.taskA1Shared)).toBeNull()
  })

  it('does not find a task through the wrong wedding, for an org-wide principal', async () => {
    // The pin does not narrow an owner; only the repo's own weddingId clause does.
    expect(await getTask(h.db, owner, F.orgA, F.weddingA2, F.taskA1Shared)).toBeNull()
    expect(
      await updateTask(h.db, owner, F.orgA, F.weddingA2, F.taskA1Shared, { title: 'x' }),
    ).toEqual(NOT_FOUND)
    expect(await completeTask(h.db, owner, F.orgA, F.weddingA2, F.taskA1Shared, true)).toEqual(
      NOT_FOUND,
    )
  })
})

describe('createTask and the due date', () => {
  it('stores an offset, derives the date from the wedding, and materialises due_at', async () => {
    const t = unwrap(
      await createTask(h.db, owner, F.orgA, F.weddingA1, {
        title: '  Send the save-the-dates ',
        due: { kind: 'offset', days: -30 },
      }),
    )
    expect(t).toMatchObject({ title: 'Send the save-the-dates', dueOffsetDays: -30 })
    // wedding A1 is 2027-07-31
    expect(t?.dueDate).toBe('2027-07-01')
    expect(t?.dueAt?.toISOString()).toBe('2027-07-01T12:00:00.000Z')
  })

  it('stores a fixed date with no offset', async () => {
    const t = unwrap(
      await createTask(h.db, owner, F.orgA, F.weddingA1, {
        title: 'Fixed',
        due: { kind: 'date', date: '2027-02-28' },
      }),
    )
    expect(t).toMatchObject({ dueOffsetDays: null, dueDate: '2027-02-28' })
  })

  it('lets the offset follow the wedding when it moves, while due_at goes stale', async () => {
    const t = unwrap(
      await createTask(h.db, owner, F.orgA, F.weddingA1, {
        title: 'Follows',
        due: { kind: 'offset', days: -10 },
      }),
    )
    await seedExec(`update weddings set wedding_date = '2027-08-31' where id = $1`, [F.weddingA1])
    const after = await getTask(h.db, owner, F.orgA, F.weddingA1, t?.id ?? '')
    expect(after?.dueDate).toBe('2027-08-21')
    expect(after?.dueAt?.toISOString()).toBe('2027-07-21T12:00:00.000Z')
  })

  it('has no date for an offset on a wedding with no date, and still saves it', async () => {
    await seedExec(`update weddings set wedding_date = null where id = $1`, [F.weddingA1])
    const t = unwrap(
      await createTask(h.db, owner, F.orgA, F.weddingA1, {
        title: 'Undated',
        due: { kind: 'offset', days: -5 },
      }),
    )
    expect(t).toMatchObject({ dueOffsetDays: -5, dueDate: null, dueAt: null })
  })

  it('assigns a planner task to the person who made it and a couple task to nobody', async () => {
    const mine = unwrap(
      await createTask(h.db, owner, F.orgA, F.weddingA1, {
        title: 'Mine',
        assigneeRole: 'planner',
      }),
    )
    const theirs = unwrap(
      await createTask(h.db, owner, F.orgA, F.weddingA1, {
        title: 'Theirs',
        assigneeRole: 'couple',
      }),
    )
    expect(mine).toMatchObject({ assigneeRole: 'planner', assigneeUserId: F.staffA })
    expect(theirs).toMatchObject({ assigneeRole: 'couple', assigneeUserId: null })
  })

  it('refuses a wedding the caller cannot reach', async () => {
    expect(await createTask(h.db, member, F.orgA, F.weddingA2, { title: 'x' })).toEqual(NOT_FOUND)
    expect(await createTask(h.db, otherOrg, F.orgB, F.weddingA1, { title: 'x' })).toEqual(NOT_FOUND)
  })

  it('writes nothing when one item of a bulk create is bad', async () => {
    await expect(
      createTasks(h.db, owner, F.orgA, F.weddingA1, [{ title: 'Fine' }, { title: '   ' }]),
    ).rejects.toThrow(/needs a title/)
    expect(titles(await listTasks(h.db, owner, F.orgA, F.weddingA1))).not.toContain('Fine')
  })

  it('creates many in one go, in input order', async () => {
    const ids = unwrap(
      await createTasks(h.db, owner, F.orgA, F.weddingA1, [
        { title: 'One', due: { kind: 'offset', days: -1 } },
        { title: 'Two', visibility: 'internal' },
      ]),
    )
    expect(ids).toHaveLength(2)
    const rows = await listTasks(h.db, owner, F.orgA, F.weddingA1)
    expect(rows.find((r) => r.id === ids?.[1])).toMatchObject({
      title: 'Two',
      visibility: 'internal',
    })
  })
})

describe('updateTask and completeTask', () => {
  it('changes only the named fields', async () => {
    const before = await getTask(h.db, owner, F.orgA, F.weddingA1, F.taskA1Shared)
    const after = unwrap(
      await updateTask(h.db, owner, F.orgA, F.weddingA1, F.taskA1Shared, {
        notes: 'ask for the rider',
      }),
    )
    expect(after).toMatchObject({ title: before?.title, notes: 'ask for the rider' })
  })

  it('moves the comments with the task when visibility flips', async () => {
    await updateTask(h.db, owner, F.orgA, F.weddingA1, F.taskA1Shared, { visibility: 'internal' })
    const thread = await listTaskComments(h.db, owner, F.orgA, F.weddingA1, F.taskA1Shared)
    expect(thread.map((c) => c.visibility)).toEqual(['internal'])
  })

  it('completes and reopens', async () => {
    const done = unwrap(await completeTask(h.db, owner, F.orgA, F.weddingA1, F.taskA1Shared, true))
    expect(done?.status).toBe('done')
    expect(done?.completedAt).toBeInstanceOf(Date)
    const open = unwrap(await completeTask(h.db, owner, F.orgA, F.weddingA1, F.taskA1Shared, false))
    expect(open).toMatchObject({ status: 'open', completedAt: null })
  })

  it('clears the user when a task is handed to the couple', async () => {
    const t = unwrap(
      await createTask(h.db, owner, F.orgA, F.weddingA1, {
        title: 'Handover',
        assigneeRole: 'planner',
      }),
    )
    const after = unwrap(
      await updateTask(h.db, owner, F.orgA, F.weddingA1, t?.id ?? '', {
        assigneeRole: 'couple',
      }),
    )
    expect(after).toMatchObject({ assigneeRole: 'couple', assigneeUserId: null })
  })
})

describe('comments', () => {
  it('adds a comment with its author and lists the thread oldest first', async () => {
    const c = unwrap(
      await addTaskComment(h.db, owner, F.orgA, F.weddingA1, F.taskA1Shared, ' Hello '),
    )
    expect(c).toMatchObject({ body: 'Hello', authorUserId: F.staffA, visibility: 'shared' })
    // The harness users have no `name`, so the address is what a planner sees, not "Unknown".
    expect(c?.authorName).toBe('staff@a.test')
    const thread = await listTaskComments(h.db, owner, F.orgA, F.weddingA1, F.taskA1Shared)
    expect(thread.map((t) => t.body)).toEqual(['Which DJ did you mean?', 'Hello'])
  })

  it('inherits internal from the task', async () => {
    const c = unwrap(
      await addTaskComment(h.db, owner, F.orgA, F.weddingA1, F.taskA1Internal, 'Quiet'),
    )
    expect(c?.visibility).toBe('internal')
  })

  it('will not attach a comment to a sibling wedding task, though the trigger would', async () => {
    expect(await addTaskComment(h.db, owner, F.orgA, F.weddingA2, F.taskA1Shared, 'Stray')).toEqual(
      NOT_FOUND,
    )
    const thread = await listTaskComments(h.db, owner, F.orgA, F.weddingA1, F.taskA1Shared)
    expect(thread.map((t) => t.body)).not.toContain('Stray')
  })

  it('refuses an empty body before any query', async () => {
    await expect(
      addTaskComment(h.db, owner, F.orgA, F.weddingA1, F.taskA1Shared, '   '),
    ).rejects.toThrow(/needs a body/)
  })
})

describe('listAssignedTasks', () => {
  beforeEach(async () => {
    await seedExec(`update tasks set assignee_user_id = $1 where id = any($2)`, [
      F.memberA,
      [F.taskA1Shared, F.taskA2Shared],
    ])
  })

  it('walks only the weddings a member is assigned to', async () => {
    const rows = await listAssignedTasks(h.db, member, F.orgA)
    expect(titles(rows)).toEqual(['Book the DJ'])
    expect(rows[0]).toMatchObject({ weddingName: 'A One', weddingDate: '2027-07-31' })
  })

  it('gives org staff their own tasks across every wedding of the org in one read', async () => {
    await seedExec(`update tasks set assignee_user_id = $1 where id = any($2)`, [
      F.staffA,
      [F.taskA1Shared, F.taskA2Shared],
    ])
    expect(titles(await listAssignedTasks(h.db, owner, F.orgA))).toEqual([
      'Book the DJ',
      'Wedding two task',
    ])
  })

  it('leaves out done tasks', async () => {
    await completeTask(h.db, member, F.orgA, F.weddingA1, F.taskA1Shared, true)
    expect(await listAssignedTasks(h.db, member, F.orgA)).toEqual([])
  })
})
