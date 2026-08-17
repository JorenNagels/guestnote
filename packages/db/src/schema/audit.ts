import { index, jsonb, pgTable, text, uuid } from 'drizzle-orm/pg-core'
import { orgId, tstz } from './_shared.ts'
import { users } from './auth.ts'

/**
 * `wedding_id` is nullable here, which interacts with the RLS policy in a way worth
 * stating out loud rather than discovering.
 *
 * The policy's second clause is `app.wedding_id IS NULL OR wedding_id = app.wedding_id`.
 * A couple's principal always sets `app.wedding_id` (it is required of any principal
 * without an `org_members` row), so for an org-level audit row where `wedding_id IS
 * NULL` the comparison yields NULL, and the row is excluded. That is the desired
 * behaviour: a couple sees audit entries for their own wedding and never the
 * planner's org-level activity. It falls out of the policy rather than needing a
 * special case, but only because `wedding_id` is NULL rather than, say, a sentinel.
 */
export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').primaryKey(),
    orgId: orgId(),
    weddingId: uuid('wedding_id'),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    target: text('target'),
    diff: jsonb('diff'),
    at: tstz('at').notNull().defaultNow(),
  },
  (t) => [index('audit_log_org_at_idx').on(t.orgId, t.at)],
)
