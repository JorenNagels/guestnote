import { and, eq, isNull, ne, sql } from 'drizzle-orm'
import type { Db, TenantDb } from '../client.ts'
import { newId } from '../id.ts'
import { users } from '../schema/auth.ts'
import {
  type TASK_ASSIGNEE_ROLES,
  type TASK_STATUSES,
  type TASK_VISIBILITIES,
  tasks,
} from '../schema/tasks.ts'
import { weddings } from '../schema/weddings.ts'
import { withTenant } from '../tenant.ts'
import { type Memberships, principalForOrg } from './memberships.ts'
import { fail, ok, type Result } from './result.ts'
import type { WeddingScope } from './scope.ts'
import { staffPrincipal } from './staff-principal.ts'
import { resolveTaskDueDate, taskDueColumns } from './task-dates.ts'

/**
 * Slice S2 of docs/specs/0003-planner-app-screens.md: tasks. Their comments are `task-comments.ts`
 * and the due-date arithmetic `task-dates.ts`.
 *
 * S7 (template apply) and S8 (Today) build on this file, so every name is prefixed by what it
 * is -- the barrel is `export *`, and a clash with another slice is a compile error at the merge.
 *
 * ## Who may call these
 *
 * Owner, admin and an assigned `member`, and nobody else. `principalForWedding` also returns a
 * `weddingMember` principal for a couple or an outside editor, and the tasks policy would let
 * such a principal read SHARED rows. Spec 0003 gives them no planner screen "in this build", so
 * `staffPrincipal` below refuses them here rather than leaving the door the policy left open:
 * when the couple spec lands, it adds its own reader instead of widening this one.
 *
 * A read returns `null` (or `[]`) and a write `notFound` for a principal that does not exist, and the caller
 * renders 404. Same rule as `getWedding`: telling somebody a wedding exists but is not theirs is
 * itself the leak.
 *
 * ## Org-wide principals carry no wedding pin
 *
 * An `orgStaff` transaction leaves `app.wedding_id` unset, so RLS admits every wedding in the
 * org. Every query here therefore names `weddingId` itself. On the pinned path that clause is
 * redundant and it stays, for the reason `listWeddings` gives for its own: the policy is the
 * boundary and the clause is the intent.
 */

export type TaskStatus = (typeof TASK_STATUSES)[number]
export type TaskVisibility = (typeof TASK_VISIBILITIES)[number]
export type TaskAssigneeRole = (typeof TASK_ASSIGNEE_ROLES)[number]

export type TaskRow = {
  readonly id: string
  readonly weddingId: string
  readonly title: string
  readonly notes: string | null
  readonly status: TaskStatus
  readonly visibility: TaskVisibility
  readonly assigneeUserId: string | null
  /** The assignee's name, else their address; null only for an unassigned task. */
  readonly assigneeName: string | null
  readonly assigneeRole: TaskAssigneeRole | null
  /** T-minus in days, negative is before the wedding. Wins over `dueAt` when both are set. */
  readonly dueOffsetDays: number | null
  /** The stored instant. For an offset task this is a materialised copy -- see `dueDate`. */
  readonly dueAt: Date | null
  /**
   * The due date to show, `YYYY-MM-DD` in UTC, or null when there is none to show. Derived on
   * every read: from the offset and the wedding's date when there is an offset, else from
   * `dueAt`. An offset task on a wedding with no date has no due date.
   */
  readonly dueDate: string | null
  readonly completedAt: Date | null
  readonly createdAt: Date
  readonly updatedAt: Date
}

/** A task and the wedding it belongs to, for the cross-wedding list. */
export type AssignedTaskRow = TaskRow & {
  readonly weddingName: string
  readonly weddingDate: string | null
}

export type TaskCommentRow = {
  readonly id: string
  readonly taskId: string
  /** Copied from the task by trigger, never written here. */
  readonly visibility: TaskVisibility
  readonly authorUserId: string | null
  readonly authorName: string | null
  readonly body: string
  readonly createdAt: Date
}

/**
 * How a task's due date is stated. A union so that "an offset AND a fixed date" cannot be
 * built: which of the two wins is then a question the type answers instead of the reader.
 */
export type TaskDue =
  | { readonly kind: 'none' }
  /** T-minus days, negative is before the wedding date. Follows the wedding if it moves. */
  | { readonly kind: 'offset'; readonly days: number }
  /** A civil date, `YYYY-MM-DD`. Stays put if the wedding moves. */
  | { readonly kind: 'date'; readonly date: string }

export type TaskInput = {
  readonly title: string
  readonly notes?: string | null
  readonly visibility?: TaskVisibility
  readonly assigneeRole?: TaskAssigneeRole | null
  readonly due?: TaskDue
}

export type TaskPatch = Partial<TaskInput>

/** Earliest date first, undated last, then title -- so a bucket reads the same on every load. */
export function compareTasks(a: TaskRow, b: TaskRow): number {
  if (a.dueDate !== b.dueDate) {
    if (a.dueDate === null) return 1
    if (b.dueDate === null) return -1
    return a.dueDate < b.dueDate ? -1 : 1
  }
  return a.title.localeCompare(b.title)
}

// --------------------------------------------------------------------- plumbing ----

/**
 * A person's display name. `users.name` is nullable on purpose (an invited staff member has no
 * name until they type one, see `schema/auth.ts`), and "Unknown" beside a comment from a
 * teammate the planner can see in the team list is worse than their address.
 */
export const personName = sql<string | null>`coalesce(nullif(${users.name}, ''), ${users.email})`

const TASK_SELECT = {
  id: tasks.id,
  weddingId: tasks.weddingId,
  title: tasks.title,
  notes: tasks.notes,
  status: tasks.status,
  visibility: tasks.visibility,
  assigneeUserId: tasks.assigneeUserId,
  assigneeName: personName,
  assigneeRole: tasks.assigneeRole,
  dueOffsetDays: tasks.dueOffsetDays,
  dueAt: tasks.dueAt,
  completedAt: tasks.completedAt,
  createdAt: tasks.createdAt,
  updatedAt: tasks.updatedAt,
  weddingDate: weddings.weddingDate,
  weddingName: weddings.coupleDisplayName,
}

type Selected = Awaited<ReturnType<typeof selectTasks>>[number]

function toRow(r: Selected): TaskRow {
  return {
    id: r.id,
    weddingId: r.weddingId,
    title: r.title,
    notes: r.notes,
    // The column is `text` with a CHECK, so the union is what the CHECK guarantees.
    status: r.status as TaskStatus,
    visibility: r.visibility as TaskVisibility,
    assigneeUserId: r.assigneeUserId,
    assigneeName: r.assigneeName,
    assigneeRole: r.assigneeRole as TaskAssigneeRole | null,
    dueOffsetDays: r.dueOffsetDays,
    dueAt: r.dueAt,
    dueDate: resolveTaskDueDate(r, r.weddingDate),
    completedAt: r.completedAt,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }
}

/** The one shape every read shares: a live task on a live wedding, with the two names it needs. */
function selectTasks(tx: TenantDb) {
  return tx
    .select(TASK_SELECT)
    .from(tasks)
    .innerJoin(weddings, eq(weddings.id, tasks.weddingId))
    .leftJoin(users, eq(users.id, tasks.assigneeUserId))
}

export async function loadTask(
  tx: TenantDb,
  weddingId: string,
  taskId: string,
): Promise<{ task: TaskRow; weddingDate: string | null } | null> {
  const rows = await selectTasks(tx).where(
    and(
      eq(tasks.id, taskId),
      eq(tasks.weddingId, weddingId),
      isNull(tasks.deletedAt),
      isNull(weddings.deletedAt),
    ),
  )
  const r = rows[0]
  return r ? { task: toRow(r), weddingDate: r.weddingDate } : null
}

/** The wedding's date, or `undefined` when the wedding is not visible in this transaction. */
async function weddingDateOf(tx: TenantDb, weddingId: string): Promise<string | null | undefined> {
  const rows = await tx
    .select({ weddingDate: weddings.weddingDate })
    .from(weddings)
    .where(and(eq(weddings.id, weddingId), isNull(weddings.deletedAt)))
  return rows[0]?.weddingDate
}

// ------------------------------------------------------------------------ reads ----

/** Every live task of one wedding, in `compareTasks` order. `[]` when the caller may not see it. */
export async function listTasks(scope: WeddingScope): Promise<TaskRow[]> {
  const { db, weddingId } = scope
  const principal = scope.principal
  if (!principal) return []

  const rows = await withTenant(db, principal, (tx) =>
    selectTasks(tx).where(
      and(eq(tasks.weddingId, weddingId), isNull(tasks.deletedAt), isNull(weddings.deletedAt)),
    ),
  )
  return rows.map(toRow).sort(compareTasks)
}

export async function getTask(scope: WeddingScope, taskId: string): Promise<TaskRow | null> {
  const { db, weddingId } = scope
  const principal = scope.principal
  if (!principal) return null
  const found = await withTenant(db, principal, (tx) => loadTask(tx, weddingId, taskId))
  return found?.task ?? null
}

/**
 * Open tasks assigned to this user across every wedding they may see, soonest first. What the
 * cross-wedding Today screen (S8) reads.
 *
 * Two shapes, forced by the tenancy model exactly as in `listWeddings`:
 *
 *   owner / admin  ONE transaction, org-wide, filtered on `assignee_user_id`.
 *   member         ONE TRANSACTION PER ASSIGNED WEDDING, awaited in turn. `assignedStaff`
 *                  must pin `app.wedding_id`, so there is no single query that is correct.
 *                  Sequential, never `Promise.all`: N transactions at once on a pool sized
 *                  for ordinary request concurrency is how one page starves the rest -- the
 *                  comment in `repos/weddings.ts` has the argument.
 */
export async function listAssignedTasks(
  db: Db,
  m: Memberships,
  orgId: string,
): Promise<AssignedTaskRow[]> {
  const mine = and(
    eq(tasks.assigneeUserId, m.userId),
    ne(tasks.status, 'done'),
    isNull(tasks.deletedAt),
    isNull(weddings.deletedAt),
  )
  const withWedding = (r: Selected): AssignedTaskRow => ({
    ...toRow(r),
    weddingName: r.weddingName,
    weddingDate: r.weddingDate,
  })

  const orgWide = principalForOrg(m, orgId)
  if (orgWide) {
    const rows = await withTenant(db, orgWide, (tx) => selectTasks(tx).where(mine))
    return rows.map(withWedding).sort(compareTasks)
  }

  const out: AssignedTaskRow[] = []
  for (const assignment of m.weddings) {
    const principal = staffPrincipal(m, orgId, assignment.weddingId)
    if (!principal) continue
    const rows = await withTenant(db, principal, (tx) =>
      selectTasks(tx).where(and(mine, eq(tasks.weddingId, assignment.weddingId))),
    )
    out.push(...rows.map(withWedding))
  }
  return out.sort(compareTasks)
}

// ----------------------------------------------------------------------- writes ----

function assigneeFor(
  role: TaskAssigneeRole | null | undefined,
  existing: string | null,
  actingUserId: string,
): string | null {
  // A couple is not a `users` row the planner can pick, and a stale planner id on a couple
  // task would put it in someone's "assigned to me".
  if (role === 'couple') return null
  // A planner task belongs to whoever made it until a team picker exists (S6 owns the read).
  if (role === 'planner') return existing ?? actingUserId
  return existing
}

/**
 * One task, or `notFound` when the wedding is not reachable. Title is trimmed and must survive it.
 */
export async function createTask(
  scope: WeddingScope,
  input: TaskInput,
): Promise<Result<TaskRow, 'notFound'>> {
  const created = await createTasks(scope, [input])
  const id = created.ok ? created.value[0] : undefined
  if (!id) return fail('notFound')
  const task = await getTask(scope, id)
  return task ? ok(task) : fail('notFound')
}

/**
 * Many tasks in one transaction and one INSERT -- what applying a template does (S7). Returns
 * the new ids in input order, or `notFound` when the wedding is not reachable.
 *
 * All or nothing: a bad item throws before anything is written, so a template never lands
 * half-applied.
 */
export async function createTasks(
  scope: WeddingScope,
  items: readonly TaskInput[],
): Promise<Result<string[], 'notFound'>> {
  const { db, weddingId } = scope
  const principal = scope.principal
  if (!principal) return fail('notFound')
  if (items.length === 0) return ok([])

  return withTenant(db, principal, async (tx) => {
    const weddingDate = await weddingDateOf(tx, weddingId)
    // `undefined` and not `null`: null is a wedding with no date, which is a real wedding.
    if (weddingDate === undefined) return fail('notFound')

    const values = items.map((item) => {
      const title = item.title.trim()
      if (!title) throw new RangeError('tasks: a task needs a title')
      const role = item.assigneeRole ?? null
      return {
        id: newId(),
        orgId: principal.orgId,
        weddingId,
        title,
        notes: item.notes?.trim() || null,
        visibility: item.visibility ?? 'shared',
        assigneeRole: role,
        assigneeUserId: assigneeFor(role, null, principal.userId),
        createdBy: principal.userId,
        ...taskDueColumns(item.due ?? { kind: 'none' }, weddingDate),
      }
    })
    const inserted = await tx.insert(tasks).values(values).returning({ id: tasks.id })
    return ok(inserted.map((r) => r.id))
  })
}

/**
 * Changes the named fields and leaves the rest. `notFound` when the task is not in that wedding
 * or the wedding is not reachable -- one answer for both, so the 404 leaks neither.
 *
 * Flipping `visibility` needs nothing more: `tasks_propagate_visibility` moves the comments.
 */
export async function updateTask(
  scope: WeddingScope,
  taskId: string,
  patch: TaskPatch,
): Promise<Result<TaskRow, 'notFound'>> {
  const { db, weddingId } = scope
  const principal = scope.principal
  if (!principal) return fail('notFound')

  return withTenant(db, principal, async (tx) => {
    const current = await loadTask(tx, weddingId, taskId)
    if (!current) return fail('notFound')

    const set: Partial<typeof tasks.$inferInsert> = { updatedAt: new Date() }
    if (patch.title !== undefined) {
      const title = patch.title.trim()
      if (!title) throw new RangeError('tasks: a task needs a title')
      set.title = title
    }
    if (patch.notes !== undefined) set.notes = patch.notes?.trim() || null
    if (patch.visibility !== undefined) set.visibility = patch.visibility
    if (patch.assigneeRole !== undefined) {
      set.assigneeRole = patch.assigneeRole
      set.assigneeUserId = assigneeFor(
        patch.assigneeRole,
        current.task.assigneeUserId,
        principal.userId,
      )
    }
    if (patch.due !== undefined) Object.assign(set, taskDueColumns(patch.due, current.weddingDate))

    await tx
      .update(tasks)
      .set(set)
      .where(and(eq(tasks.id, taskId), eq(tasks.weddingId, weddingId)))

    const task = (await loadTask(tx, weddingId, taskId))?.task
    return task ? ok(task) : fail('notFound')
  })
}

/**
 * Ticks a task off, or reopens it. `done` sets `completed_at`; anything else clears it and
 * returns the task to `open` -- an `in_progress` task that is completed and then unticked
 * comes back as `open`, which is the honest answer, not a remembered one.
 */
export async function completeTask(
  scope: WeddingScope,
  taskId: string,
  done: boolean,
): Promise<Result<TaskRow, 'notFound'>> {
  const { db, weddingId } = scope
  const principal = scope.principal
  if (!principal) return fail('notFound')

  return withTenant(db, principal, async (tx) => {
    const now = new Date()
    const changed = await tx
      .update(tasks)
      .set({ status: done ? 'done' : 'open', completedAt: done ? now : null, updatedAt: now })
      .where(and(eq(tasks.id, taskId), eq(tasks.weddingId, weddingId), isNull(tasks.deletedAt)))
      .returning({ id: tasks.id })
    if (changed.length === 0) return fail('notFound')

    const task = (await loadTask(tx, weddingId, taskId))?.task
    return task ? ok(task) : fail('notFound')
  })
}
