export * from './audit.ts'
export * from './auth.ts'
export * from './mail.ts'
export * from './orgs.ts'
export * from './tasks.ts'
export * from './weddings.ts'

/**
 * The tenancy classification of every table, as data.
 *
 * This exists so `test/schema-coverage.test.ts` can assert that every table in the
 * schema appears in exactly one bucket. Adding a table without classifying it turns
 * CI red -- which is the point. research/09-planner-app.md item P5 asks for the
 * isolation suite to be "extended to tasks, budget, vendors"; a list you have to
 * remember to extend is a list that eventually is not extended, at 22:00 on a
 * Sunday. This makes it mechanical instead.
 */

/**
 * Carry both `org_id` and `wedding_id`, and get the standard tenant policy.
 * `wedding_id` may be nullable (`invitations`, `audit_log`) -- see the note in
 * audit.ts for how the policy handles that.
 */
export const TENANT_SCOPED_TABLES = [
  'invitations',
  'wedding_domains',
  'tasks',
  'task_comments',
  'audit_log',
] as const

/**
 * Tenant-scoped, but their own primary key IS the scope, so their policy compares
 * `id` rather than a separate tenant column.
 *
 *   organizations  id = app.org_id
 *   weddings       org_id = app.org_id AND (app.wedding_id IS NULL OR id = app.wedding_id)
 */
export const SELF_SCOPED_TABLES = ['organizations', 'weddings'] as const

/**
 * The two deliberate exceptions. Read *before* the tenant is known, in order to
 * determine it, so their policy runs on `app.user_id` instead of the tenant keys.
 * research/07-auth-and-tenancy.md section 4a -- this is correct, not an oversight.
 */
export const USER_SCOPED_TABLES = ['org_members', 'wedding_members'] as const

/**
 * Not tenant-scoped at all. A user is not owned by an organisation: one person can
 * be a couple on one wedding and staff at a planner. Reachability is decided by the
 * two user-scoped tables above.
 *
 * Better Auth's four tables joined them 2026-08-18. None carries RLS, for the reason
 * 0001_rls.sql gives for `users`: every one of them is read BEFORE a principal exists
 * -- a session by token, a verification by identifier, a passkey by credential id -- so
 * there is no `app.user_id` to scope by at the moment of sign-in, and a policy would
 * break authentication outright. The mitigation is structural: nothing outside
 * `packages/core/auth` touches them.
 *
 * `mail_deliveries` and `rate_limits` joined them 2026-08-19 with the mail pipeline, on
 * exactly the same grounds: a sign-in code is requested by someone who is by definition not
 * signed in, so both rows are written before there is a principal to scope them to. Their
 * mitigation is structural too -- `apps/web/src/lib/mailer.ts` is the only writer of the
 * first and Better Auth's limiter is the only writer of the second. See schema/mail.ts.
 */
export const UNSCOPED_TABLES = [
  'users',
  'sessions',
  'accounts',
  'verifications',
  'passkeys',
  'mail_deliveries',
  'rate_limits',
] as const

/**
 * Tables whose policy additionally tests `app.wedding_role`, because they hold rows
 * a couple must never see even within their own wedding. See tasks.ts.
 */
export const VISIBILITY_SCOPED_TABLES = ['tasks', 'task_comments'] as const
