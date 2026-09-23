import { sql } from 'drizzle-orm'
import {
  check,
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { createdAt, deletedAt, oneOf, orgId, tstz, updatedAt } from './_shared.ts'
import { users } from './auth.ts'

export const ORG_TYPES = ['planner', 'venue', 'couple_direct'] as const
export const ORG_ROLES = ['owner', 'admin', 'member'] as const
export const INVITATION_ROLES = ['admin', 'member', 'couple', 'editor'] as const

/**
 * An organisation is **the business that pays and brands** -- not "everyone
 * involved in a wedding". research/07-auth-and-tenancy.md section 2.
 *
 * A direct couple gets their own org of type `couple_direct`, which keeps one code
 * path for everything and makes "a planner takes over this couple's wedding" a
 * single `UPDATE weddings SET org_id = ...` with the couple's access untouched.
 */
export const organizations = pgTable(
  'organizations',
  {
    id: uuid('id').primaryKey(),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    type: text('type').notNull(),
    plan: text('plan').notNull().default('free'),
    brand: jsonb('brand'),
    mollieCustomerId: text('mollie_customer_id'),
    subscriptionStatus: text('subscription_status'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [
    check('organizations_type_check', oneOf('type', ORG_TYPES)),
    // Unique among the living. A plain UNIQUE would let a soft-deleted org squat
    // its slug forever, with no way to release it short of a hard delete.
    uniqueIndex('organizations_slug_key').on(t.slug).where(sql`deleted_at is null`),
  ],
)

/**
 * STAFF only. The couple is never here -- research/07-auth-and-tenancy.md section 2
 * is emphatic, and section 3 gives the failure mode: org membership means the
 * session carries the planner's `org_id`, which passes the org-level check for ALL
 * of that planner's weddings. One URL guess from another couple's guest list.
 *
 * One of exactly two tables that does NOT carry `wedding_id`, and one of exactly two
 * scoped ONLY by `app.user_id` rather than the tenant keys -- because it is read
 * *before* the tenant is known, in order to determine it. See the comment in
 * migrations/0001_rls.sql; this is correct, not an oversight.
 *
 * "Only two" is about the whole policy set, not the axis: since migration 0005
 * `organizations` also has a policy reading `app.user_id`, a second one beside its
 * `tenant_isolation`, so a member can read their org's name before a tenant is known.
 * And since migration 0007 this table has a second policy of its own, the opposite way round:
 * `org_staff_read`, `for select`, scoped by `app.org_id`, so an owner or admin reads every
 * membership of their org. Writes are still `own_memberships` alone.
 */
export const orgMembers = pgTable(
  'org_members',
  {
    orgId: orgId(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    invitedBy: uuid('invited_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.orgId, t.userId] }),
    check('org_members_role_check', oneOf('role', ORG_ROLES)),
    index('org_members_user_id_idx').on(t.userId),
  ],
)

/**
 * ONE invitation table, not two. research/07-auth-and-tenancy.md section 4b
 * supersedes `invitations_org` in research/05-architecture.md section 4.
 *
 *   wedding_id NULL -> staff invite,   role in (admin, member)
 *   wedding_id SET  -> wedding invite, role in (couple, editor)
 *
 * You invite an **email**, not a user: at invite time the account does not exist.
 * Accepting a wedding invite writes a `wedding_members` row and **no** `org_members`
 * row. That one rule is the whole design, and it gets a test in W3, not a comment.
 */
export const invitations = pgTable(
  'invitations',
  {
    id: uuid('id').primaryKey(),
    orgId: orgId(),
    // Nullable on purpose: this column IS the staff/wedding discriminator.
    weddingId: uuid('wedding_id'),
    email: text('email').notNull(),
    role: text('role').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: tstz('expires_at').notNull(),
    acceptedAt: tstz('accepted_at'),
    invitedBy: uuid('invited_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [
    check('invitations_role_check', oneOf('role', INVITATION_ROLES)),
    // The discriminator, enforced rather than described: a staff invite cannot carry
    // a wedding role, and a wedding invite cannot carry a staff role. Without this,
    // one bad insert produces an invitation that grants org-wide access to a couple.
    check(
      'invitations_scope_role_check',
      sql.raw(
        "(wedding_id is null and role in ('admin', 'member')) or " +
          "(wedding_id is not null and role in ('couple', 'editor'))",
      ),
    ),
    index('invitations_org_id_email_idx').on(t.orgId, t.email),
  ],
)
