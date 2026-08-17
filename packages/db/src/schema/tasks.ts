import { check, index, integer, pgTable, text, uuid } from 'drizzle-orm/pg-core'
import { createdAt, deletedAt, oneOf, orgId, tstz, updatedAt, weddingId } from './_shared.ts'
import { users } from './auth.ts'
import { weddings } from './weddings.ts'

export const TASK_STATUSES = ['open', 'in_progress', 'done'] as const

/**
 * `vendor` deferred, same reasoning as `WEDDING_ROLES` -- a task assigned to a
 * principal that cannot exist yet is dead data. Arrives with item P18.
 */
export const TASK_ASSIGNEE_ROLES = ['planner', 'couple'] as const

/**
 * The two values this whole design is arranged around.
 *
 * `internal` is what a planner keeps from the couple: chasing a late invoice,
 * checking a margin, "couple is being difficult about the seating".
 * research/09-planner-app.md section b: retrofitting this after the couple portal
 * ships means leaking those on the day you add it. So the column is here in the
 * first migration -- and so is its RLS backstop, which that document did not
 * originally provide. See migrations/0001_rls.sql.
 */
export const TASK_VISIBILITIES = ['shared', 'internal'] as const

export const tasks = pgTable(
  'tasks',
  {
    id: uuid('id').primaryKey(),
    // `org_id` was missing from research/09-planner-app.md section b's sketch. It is
    // required: research/05-architecture.md section 4 makes every tenant-scoped table
    // carry both keys so each policy is a single-column check with no joins.
    orgId: orgId(),
    weddingId: weddingId().references(() => weddings.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    notes: text('notes'),
    assigneeUserId: uuid('assignee_user_id').references(() => users.id, { onDelete: 'set null' }),
    assigneeRole: text('assignee_role'),
    status: text('status').notNull().default('open'),
    visibility: text('visibility').notNull().default('shared'),
    /**
     * An absolute instant, once known.
     */
    dueAt: tstz('due_at'),
    /**
     * T-minus, for templates: -180 means "6 months before the wedding date".
     * Resolved against `weddings.wedding_date` + `weddings.timezone` in
     * packages/core, which is what lets one checklist template apply to any wedding
     * and compute its own dates.
     */
    dueOffsetDays: integer('due_offset_days'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    completedAt: tstz('completed_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [
    check('tasks_status_check', oneOf('status', TASK_STATUSES)),
    check('tasks_visibility_check', oneOf('visibility', TASK_VISIBILITIES)),
    check('tasks_assignee_role_check', oneOf('assignee_role', TASK_ASSIGNEE_ROLES)),
    // Every index starts with the tenant column, so the planner's "due this week
    // across every wedding" screen (item P16) and the per-wedding list both hit it.
    index('tasks_org_wedding_idx').on(t.orgId, t.weddingId),
    index('tasks_org_due_at_idx').on(t.orgId, t.dueAt),
  ],
)

/**
 * Comments carry their own `visibility`, denormalised from the parent task.
 *
 * This is not redundancy. A policy on `task_comments` that had to join to `tasks`
 * to discover whether the parent is internal would defeat the single-column-check
 * design -- and worse, without the column there is no backstop at all: a couple
 * could read the comment thread on an internal task even though the task itself is
 * invisible. Which is a more direct leak than the task title.
 *
 * Kept in sync by a database trigger, not by application code. See
 * migrations/0001_rls.sql. A trigger removes the entire class of bug where a task
 * is flipped to `internal` and its existing comments stay `shared`.
 */
export const taskComments = pgTable(
  'task_comments',
  {
    id: uuid('id').primaryKey(),
    orgId: orgId(),
    weddingId: weddingId().references(() => weddings.id, { onDelete: 'cascade' }),
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    visibility: text('visibility').notNull().default('shared'),
    authorUserId: uuid('author_user_id').references(() => users.id, { onDelete: 'set null' }),
    body: text('body').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [
    check('task_comments_visibility_check', oneOf('visibility', TASK_VISIBILITIES)),
    index('task_comments_org_task_idx').on(t.orgId, t.taskId),
  ],
)
