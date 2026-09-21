import { sql } from 'drizzle-orm'
import { check, index, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { createdAt, deletedAt, oneOf, orgId, tstz, updatedAt, weddingId } from './_shared.ts'
import { organizations } from './orgs.ts'
import { weddings } from './weddings.ts'

/**
 * The org's vendor directory. Spec 0003: "an org directory plus a per-wedding link".
 *
 * Scoped by `org_id` alone -- a caterer is reused across every wedding the studio runs, so
 * a `wedding_id` here would make the directory a per-wedding copy, which is the spreadsheet
 * this product replaces. That is why it is in `ORG_SCOPED_TABLES` and not
 * `TENANT_SCOPED_TABLES`.
 *
 * `category` is free text, not a CHECK: the labels are shown to planners in three
 * languages and every studio has its own ("Venue", "Zaal", "Kasteel"). A closed list
 * would be a migration per studio's vocabulary.
 */
export const vendors = pgTable(
  'vendors',
  {
    id: uuid('id').primaryKey(),
    orgId: orgId().references(() => organizations.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    category: text('category').notNull(),
    email: text('email'),
    phone: text('phone'),
    notes: text('notes'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [index('vendors_org_name_idx').on(t.orgId, t.name)],
)

/**
 * Where a vendor stands on ONE wedding. The prototype has no such field, so this list is
 * a build-time choice and not a measured one -- widening it is an ordinary `ALTER` on a
 * CHECK (see `oneOf`), which is the reason it is not a Postgres enum.
 */
export const WEDDING_VENDOR_STATUSES = [
  'considering',
  'contacted',
  'quoted',
  'booked',
  'declined',
] as const

/**
 * The link between one wedding and one directory vendor, carrying status and notes.
 *
 * `vendor_id` is `restrict`, not `cascade`: deleting a directory entry that a wedding
 * still uses must fail loudly. The application soft-deletes a vendor (`deleted_at`) and
 * leaves the wedding's history readable.
 *
 * `org_id` and `wedding_id` are denormalised as on every wedding-scoped table, and nothing
 * here forces `vendor_id`'s org to equal `org_id`. Foreign keys are plain, and referential-
 * integrity checks always bypass RLS (a documented Postgres rule, even under FORCE) -- so the
 * key is satisfied by a parent the caller cannot read: another org's vendor, or (for
 * `payments.budget_line_id`, `budget_lines.wedding_vendor_id`) a sibling wedding's row.
 * `planner-isolation.test.ts` records that as today's behaviour. RLS is not the guard here;
 * the guard is that a slice action reads the parent under `withTenant` before inserting the
 * child, so a parent the principal cannot see is refused there. A composite key
 * `(vendor_id, org_id)` would close it in the schema; not done, so as not to give the first
 * wedding-scoped table a shape none of the others has. Same limit on every FK in 0006.
 */
export const weddingVendors = pgTable(
  'wedding_vendors',
  {
    id: uuid('id').primaryKey(),
    orgId: orgId(),
    weddingId: weddingId().references(() => weddings.id, { onDelete: 'cascade' }),
    vendorId: uuid('vendor_id')
      .notNull()
      .references(() => vendors.id, { onDelete: 'restrict' }),
    status: text('status').notNull().default('considering'),
    notes: text('notes'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [
    check('wedding_vendors_status_check', oneOf('status', WEDDING_VENDOR_STATUSES)),
    // One vendor once per wedding, among the living -- a removed vendor can be re-added.
    uniqueIndex('wedding_vendors_wedding_vendor_key')
      .on(t.weddingId, t.vendorId)
      .where(sql`deleted_at is null`),
    index('wedding_vendors_org_wedding_idx').on(t.orgId, t.weddingId),
  ],
)

/**
 * A signed link for one vendor on one wedding (spec 0003, slice S10). THE TABLE ONLY.
 *
 * The `link` principal, the SECURITY DEFINER lookup that turns a token into
 * `(org_id, wedding_id, vendor_id)`, and the policy set that lets that principal read
 * anything belong to S10 and its tenancy audit. Until then this table has one policy,
 * for `owner` and `admin`, and nothing reads a token.
 *
 * Only the hash of the token is stored (`token_hash`), never the token: the same rule as
 * `invitations.token_hash`. It is unique across ALL tenants, not per org, because the
 * lookup function has no tenant to scope by -- the token is how it finds one.
 * `revoked_at` rather than a delete, so "this link was revoked on..." stays answerable.
 */
export const vendorLinks = pgTable(
  'vendor_links',
  {
    id: uuid('id').primaryKey(),
    orgId: orgId(),
    weddingId: weddingId().references(() => weddings.id, { onDelete: 'cascade' }),
    weddingVendorId: uuid('wedding_vendor_id')
      .notNull()
      .references(() => weddingVendors.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: tstz('expires_at').notNull(),
    revokedAt: tstz('revoked_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('vendor_links_org_wedding_idx').on(t.orgId, t.weddingId)],
)
