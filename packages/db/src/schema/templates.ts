import { check, index, integer, pgTable, text, uuid } from 'drizzle-orm/pg-core'
import { createdAt, deletedAt, oneOf, orgId, updatedAt } from './_shared.ts'
import { organizations } from './orgs.ts'
import { TASK_ASSIGNEE_ROLES, TASK_VISIBILITIES } from './tasks.ts'

/**
 * A checklist template, per organisation. Spec 0003: templates are COPIED on apply, so
 * editing one never touches a wedding that used it -- there is deliberately no column
 * here that a task points back at.
 *
 * Org-scoped, like `vendors`: a studio's "Full planning, 12 months" applies to any of its
 * weddings, so it carries no `wedding_id`.
 */
export const taskTemplates = pgTable(
  'task_templates',
  {
    id: uuid('id').primaryKey(),
    orgId: orgId().references(() => organizations.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    description: text('description'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [index('task_templates_org_idx').on(t.orgId)],
)

/**
 * One task of a template. The columns mirror `tasks` on purpose, so "apply" is a copy:
 * `due_offset_days` is T-minus as on `tasks` (-180 means six months before), and
 * `visibility` and `assignee_role` reuse the task value lists rather than restating them.
 *
 * It carries a `visibility` column, which is what puts it in `VISIBILITY_SCOPED_TABLES`
 * and obliges its policy to test `app.wedding_role`. Nothing a couple may read today, but
 * the item becomes a task and the task's visibility is the one that matters.
 */
export const templateItems = pgTable(
  'template_items',
  {
    id: uuid('id').primaryKey(),
    orgId: orgId(),
    templateId: uuid('template_id')
      .notNull()
      .references(() => taskTemplates.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    dueOffsetDays: integer('due_offset_days').notNull(),
    visibility: text('visibility').notNull().default('shared'),
    assigneeRole: text('assignee_role').notNull().default('planner'),
    position: integer('position').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check('template_items_visibility_check', oneOf('visibility', TASK_VISIBILITIES)),
    check('template_items_assignee_role_check', oneOf('assignee_role', TASK_ASSIGNEE_ROLES)),
    index('template_items_org_template_idx').on(t.orgId, t.templateId, t.position),
  ],
)
