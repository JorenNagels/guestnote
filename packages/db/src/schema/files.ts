import { sql } from 'drizzle-orm'
import { bigint, check, index, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { createdAt, deletedAt, oneOf, orgId, updatedAt, weddingId } from './_shared.ts'
import { users } from './auth.ts'
import { TASK_VISIBILITIES } from './tasks.ts'
import { weddings } from './weddings.ts'

export const FILE_KINDS = ['file', 'image'] as const

/**
 * Metadata for an object in S3; the bytes are never in Postgres. `storage_key` is the
 * object's key, written by the storage seam (`packages/storage`, slice F4) -- a row here
 * is a claim that the object exists, made by the server after the upload, not by the
 * browser before it.
 *
 * The moodboard is `kind = 'image'` on this same table (spec 0003), so there is one
 * upload path and one visibility rule.
 *
 * `visibility` reuses the task value list, and carries the same meaning: `internal` is
 * what a planner keeps from the couple. It puts this table in `VISIBILITY_SCOPED_TABLES`.
 *
 * `storage_key` is unique per ORG rather than globally: a plain unique index would let one
 * tenant learn that a key exists in another by getting a conflict error back, and the
 * only writer of keys prefixes them with the org anyway, so the two are the same constraint.
 * `size_bytes` is `bigint` (`mode: 'number'`, safe to 2^53) because `integer` stops at 2 GB.
 * `uploaded_by` is `set null`: deleting a user must not delete the planner's files.
 */
export const files = pgTable(
  'files',
  {
    id: uuid('id').primaryKey(),
    orgId: orgId(),
    weddingId: weddingId().references(() => weddings.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull().default('file'),
    name: text('name').notNull(),
    storageKey: text('storage_key').notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
    mime: text('mime').notNull(),
    visibility: text('visibility').notNull().default('shared'),
    uploadedBy: uuid('uploaded_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [
    check('files_kind_check', oneOf('kind', FILE_KINDS)),
    check('files_visibility_check', oneOf('visibility', TASK_VISIBILITIES)),
    check('files_size_check', sql.raw('size_bytes >= 0')),
    uniqueIndex('files_org_storage_key_key').on(t.orgId, t.storageKey),
    index('files_org_wedding_idx').on(t.orgId, t.weddingId),
  ],
)
