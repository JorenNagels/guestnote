import { boolean, pgTable, text, uuid } from 'drizzle-orm/pg-core'
import { createdAt, updatedAt } from './_shared.ts'

/**
 * Better Auth's territory -- but only `users`, and only because half the schema
 * has a foreign key to it.
 *
 * `sessions`, `accounts` and `verifications` are deliberately NOT declared yet.
 * Hand-writing Better Auth's table shapes from memory is how you end up migrating
 * a column type across five tables after real users exist. They arrive in W3, read
 * off the output of Better Auth's own schema generator rather than guessed, and
 * this file gets reconciled against that same output at the same time.
 *
 * The one thing that CANNOT wait, because every policy and every foreign key
 * depends on it: **ids are `uuid`**, not Better Auth's default `text`. The RLS
 * policies cast `current_setting('app.user_id', true)::uuid`
 * (research/07-auth-and-tenancy.md section 4a), so W3 must force uuid generation
 * via Better Auth's `advanced.database.generateId` rather than accept its default.
 * Getting that wrong means a column-type migration across `org_members.user_id`,
 * `wedding_members.user_id`, `invitations.invited_by`, `tasks.assignee_user_id`,
 * `task_comments.author_user_id` and `audit_log.actor_user_id`.
 *
 * Not tenant-scoped, and not RLS-protected on the tenant axis: a user is not owned
 * by an organisation. One person can be a couple on one wedding and staff at a
 * planner. Reachability is decided by `org_members` / `wedding_members`, which are
 * the tables that do carry policies.
 */
export const users = pgTable('users', {
  id: uuid('id').primaryKey(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  name: text('name'),
  image: text('image'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})
