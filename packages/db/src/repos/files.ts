import { and, desc, eq, isNull, sql } from 'drizzle-orm'
import type { Db } from '../client.ts'
import { users } from '../schema/auth.ts'
import { files } from '../schema/files.ts'
import { weddings } from '../schema/weddings.ts'
import { type Principal, withTenant } from '../tenant.ts'
import { type Memberships, principalForOrg, principalForWedding } from './memberships.ts'

/**
 * The Files screen and the moodboard (spec 0003, slice S5). One table, two screens: `kind`
 * is `file` for the first and `image` for the second, so there is one upload path and one
 * visibility rule.
 *
 * The bytes are never here. `storage_key` names an object that `packages/storage` signed a
 * URL for; this file only keeps the claim that it exists.
 *
 * ## Every function returns `null` (or `false`) for "no access", and that is a 404
 *
 * Same contract as `getWedding`: no standing in the org, an unassigned `member`, a wedding
 * in another org and a wedding that does not exist all look the same from outside. A
 * `couple` or `editor` principal is refused here too. The policy would return no rows for
 * them anyway (spec 0003: no new table is readable by a couple), and refusing before the
 * transaction saves a round trip and makes that rule readable where the query is.
 *
 * ## A row is created BEFORE its upload, and is invisible until it is confirmed
 *
 * The schema has no `status` column and this slice may not add one, so "pending" is
 * spelled `deleted_at = created_at`. A real delete stamps `deleted_at` with a later
 * instant, so the two cannot be confused, and every read here already filters
 * `deleted_at is null`, so a pending row is invisible to every list and to `getFile`
 * without a second predicate to forget. `confirmFile` clears it. An upload that never
 * finishes leaves a hidden row behind: costless, and findable by the same predicate if a
 * sweep is ever wanted. Rejected: writing the row only after the upload (the client would
 * have to hand back the size and type it claimed, which is a second unchecked copy of what
 * the presign step already validated). The cost of the chosen way is that `confirmFile`
 * takes the server's word, not S3's: nothing here checks that the object exists.
 * A `status` column is the honest version if this ever needs to be audited.
 */

export type FileKind = 'file' | 'image'
export type FileVisibility = 'shared' | 'internal'

export type FileRow = {
  readonly id: string
  readonly kind: FileKind
  readonly name: string
  readonly storageKey: string
  readonly sizeBytes: number
  readonly mime: string
  readonly visibility: FileVisibility
  readonly uploadedBy: string | null
  /** The uploader's display name, falling back to their address. `null` once they are deleted. */
  readonly uploadedByName: string | null
  readonly createdAt: Date
}

const COLUMNS = {
  id: files.id,
  kind: files.kind,
  name: files.name,
  storageKey: files.storageKey,
  sizeBytes: files.sizeBytes,
  mime: files.mime,
  visibility: files.visibility,
  uploadedBy: files.uploadedBy,
  uploadedByName: sql<string | null>`coalesce(${users.name}, ${users.email})`,
  createdAt: files.createdAt,
}

type Selected = Omit<FileRow, 'kind' | 'visibility'> & { kind: string; visibility: string }

// The columns are text with a CHECK, so drizzle types them `string`. Narrowed here once.
function toRow(r: Selected): FileRow {
  return {
    ...r,
    kind: r.kind === 'image' ? 'image' : 'file',
    visibility: r.visibility === 'internal' ? 'internal' : 'shared',
  }
}

/**
 * Owner, admin, or an assigned member. Never a couple or an editor.
 *
 * `principalForOrg ?? principalForWedding` is the union `getWedding` documents: the two have
 * disjoint non-null domains, so the order is not a precedence rule.
 */
function staffPrincipal(m: Memberships, orgId: string, weddingId: string): Principal | null {
  const p = principalForOrg(m, orgId) ?? principalForWedding(m, orgId, weddingId)
  return p && p.kind !== 'weddingMember' ? p : null
}

/**
 * Confirmed files of one kind, newest first. `null` means no access, `[]` means none yet.
 *
 * The `eq(files.weddingId, ...)` is load-bearing for owner and admin, whose principal is
 * org-wide and so sees every wedding's files; it is redundant for an assigned member, whose
 * pinned GUC already narrows it. The same split `getWedding` describes.
 */
export async function listFiles(
  db: Db,
  m: Memberships,
  orgId: string,
  weddingId: string,
  kind: FileKind,
): Promise<FileRow[] | null> {
  const principal = staffPrincipal(m, orgId, weddingId)
  if (!principal) return null

  const rows = await withTenant(db, principal, async (tx) =>
    tx
      .select(COLUMNS)
      .from(files)
      .leftJoin(users, eq(users.id, files.uploadedBy))
      .where(and(eq(files.weddingId, weddingId), eq(files.kind, kind), isNull(files.deletedAt)))
      .orderBy(desc(files.createdAt), desc(files.id)),
  )
  return rows.map(toRow)
}

/** One confirmed file, or `null`. What a download reads before it mints a URL. */
export async function getFile(
  db: Db,
  m: Memberships,
  orgId: string,
  weddingId: string,
  fileId: string,
): Promise<FileRow | null> {
  const principal = staffPrincipal(m, orgId, weddingId)
  if (!principal) return null

  const rows = await withTenant(db, principal, async (tx) =>
    tx
      .select(COLUMNS)
      .from(files)
      .leftJoin(users, eq(users.id, files.uploadedBy))
      .where(and(eq(files.id, fileId), eq(files.weddingId, weddingId), isNull(files.deletedAt))),
  )
  const row = rows[0]
  return row ? toRow(row) : null
}

export type PendingFileInput = {
  /** `newId()`, and the last segment of `storageKey`. */
  readonly id: string
  readonly kind: FileKind
  readonly name: string
  readonly storageKey: string
  readonly sizeBytes: number
  readonly mime: string
  readonly visibility: FileVisibility
}

/**
 * Inserts a row that is invisible until `confirmFile`. `false` when the wedding is not
 * reachable by this principal.
 *
 * The wedding is read first because the FK from `files.wedding_id` is plain, not composite
 * (spec 0003, "Shared rules"): RLS checks that the row's `org_id` is ours and says nothing
 * about whose wedding the id names, so an insert naming another org's wedding would succeed.
 * `uploaded_by` is the caller, taken from the memberships and never from the input.
 */
export async function createPendingFile(
  db: Db,
  m: Memberships,
  orgId: string,
  weddingId: string,
  input: PendingFileInput,
): Promise<boolean> {
  const principal = staffPrincipal(m, orgId, weddingId)
  if (!principal) return false

  return withTenant(db, principal, async (tx) => {
    const parent = await tx
      .select({ id: weddings.id })
      .from(weddings)
      .where(and(eq(weddings.id, weddingId), isNull(weddings.deletedAt)))
    if (parent.length === 0) return false

    // One instant for all three, because equality of `deleted_at` and `created_at` is the
    // pending marker (see the header). Both are set from this value, not from `now()`.
    const at = new Date()
    await tx.insert(files).values({
      id: input.id,
      orgId,
      weddingId,
      kind: input.kind,
      name: input.name,
      storageKey: input.storageKey,
      sizeBytes: input.sizeBytes,
      mime: input.mime,
      visibility: input.visibility,
      uploadedBy: m.userId,
      createdAt: at,
      updatedAt: at,
      deletedAt: at,
    })
    return true
  })
}

/**
 * Makes a pending row real. `null` unless the row is pending AND was created by the caller,
 * so a confirm cannot resurrect a deleted file (a delete is a later instant, not equal to
 * `created_at`) and cannot be used on somebody else's half-finished upload.
 */
export async function confirmFile(
  db: Db,
  m: Memberships,
  orgId: string,
  weddingId: string,
  fileId: string,
): Promise<FileRow | null> {
  const principal = staffPrincipal(m, orgId, weddingId)
  if (!principal) return null

  const changed = await withTenant(db, principal, async (tx) =>
    tx
      .update(files)
      .set({ deletedAt: null, updatedAt: new Date() })
      .where(
        and(
          eq(files.id, fileId),
          eq(files.weddingId, weddingId),
          eq(files.uploadedBy, m.userId),
          sql`${files.deletedAt} = ${files.createdAt}`,
        ),
      )
      .returning({ id: files.id }),
  )
  if (changed.length === 0) return null
  return getFile(db, m, orgId, weddingId, fileId)
}

/** The Files screen's caption and the moodboard's. `false` when nothing was changed. */
export async function renameFile(
  db: Db,
  m: Memberships,
  orgId: string,
  weddingId: string,
  fileId: string,
  name: string,
): Promise<boolean> {
  return updateConfirmed(db, m, orgId, weddingId, fileId, { name })
}

export async function setFileVisibility(
  db: Db,
  m: Memberships,
  orgId: string,
  weddingId: string,
  fileId: string,
  visibility: FileVisibility,
): Promise<boolean> {
  return updateConfirmed(db, m, orgId, weddingId, fileId, { visibility })
}

/**
 * Soft delete. The object stays in the bucket: the app is not granted `s3:DeleteObject`
 * (`packages/storage/README.md`), so a lifecycle rule or a job removes it, not this.
 */
export async function removeFile(
  db: Db,
  m: Memberships,
  orgId: string,
  weddingId: string,
  fileId: string,
): Promise<boolean> {
  return updateConfirmed(db, m, orgId, weddingId, fileId, { deletedAt: new Date() })
}

async function updateConfirmed(
  db: Db,
  m: Memberships,
  orgId: string,
  weddingId: string,
  fileId: string,
  set: { name?: string; visibility?: FileVisibility; deletedAt?: Date },
): Promise<boolean> {
  const principal = staffPrincipal(m, orgId, weddingId)
  if (!principal) return false

  const changed = await withTenant(db, principal, async (tx) =>
    tx
      .update(files)
      .set({ ...set, updatedAt: new Date() })
      .where(and(eq(files.id, fileId), eq(files.weddingId, weddingId), isNull(files.deletedAt)))
      .returning({ id: files.id }),
  )
  return changed.length > 0
}
