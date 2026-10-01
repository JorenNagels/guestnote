import { sql } from 'drizzle-orm'
import {
  boolean,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { createdAt, orgId, updatedAt, weddingId } from './_shared.ts'
import { weddingVendors } from './vendors.ts'
import { weddings } from './weddings.ts'

/**
 * A named moodboard on a wedding (spec 0007). The images are still `files` rows with
 * `kind = 'image'`; `files.moodboard_id` says which board each one is on -- one board per image.
 *
 * Exactly one board per wedding is the default. "At most one" is the partial unique index;
 * "at least one" is `createWedding` making it in the same transaction as the wedding, the 0012
 * backfill for weddings from before, and `deleteBoard` refusing it. It is where the images from
 * before spec 0007 went, so a wedding always has somewhere to upload.
 *
 * `shared_with_couple` is what the couple portal reads (spec 0008). No couple principal can read
 * this table (every policy here is a positive staff list), so the read goes through the
 * `couple_moodboards()` and `gn_couple_image()` functions of migration 0013. Storing
 * it now means the portal reads a flag rather than migrating one. Rejected: waiting for the
 * portal -- planners would then set every board's audience twice.
 *
 * No `deleted_at`: a board is deleted outright, after its images are soft-deleted the way
 * `removeFile` does it (`files.moodboard_id` has no cascade, so the order is enforced). A board
 * holds nothing worth an undo that its images do not.
 */
export const moodboards = pgTable(
  'moodboards',
  {
    id: uuid('id').primaryKey(),
    orgId: orgId(),
    weddingId: weddingId().references(() => weddings.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    isDefault: boolean('is_default').notNull().default(false),
    sharedWithCouple: boolean('shared_with_couple').notNull().default(false),
    position: integer('position').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('moodboards_one_default_per_wedding').on(t.weddingId).where(sql`is_default`),
    index('moodboards_org_wedding_idx').on(t.orgId, t.weddingId, t.position),
  ],
)

/**
 * Which vendors of the wedding see a board, through their signed link (spec 0007). A row is the
 * share; deleting it unshares. Both keys cascade: removing a board or hard-deleting a
 * wedding-vendor row takes its shares along. A SOFT-deleted wedding vendor keeps its rows, but
 * its link no longer resolves (`resolve_vendor_link` requires a live row), so nothing reads them.
 *
 * `org_id` and `wedding_id` are carried, redundantly with the board, because every policy on a
 * `TENANT_SCOPED_TABLES` table must name both (`schema-coverage.test.ts`), and a policy that had
 * to join to `moodboards` for its keys would be the first of its kind. The repo reads the board
 * and the wedding vendor under `withTenant` before inserting -- an FK does not enforce a tenant
 * boundary (see `weddingVendors`).
 */
export const moodboardShares = pgTable(
  'moodboard_shares',
  {
    moodboardId: uuid('moodboard_id')
      .notNull()
      .references(() => moodboards.id, { onDelete: 'cascade' }),
    weddingVendorId: uuid('wedding_vendor_id')
      .notNull()
      .references(() => weddingVendors.id, { onDelete: 'cascade' }),
    orgId: orgId(),
    weddingId: weddingId().references(() => weddings.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.moodboardId, t.weddingVendorId] }),
    index('moodboard_shares_org_wedding_vendor_idx').on(t.orgId, t.weddingId, t.weddingVendorId),
  ],
)
