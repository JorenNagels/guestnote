import { and, desc, eq, isNull, sql } from 'drizzle-orm'
import { users } from '../schema/auth.ts'
import { files } from '../schema/files.ts'
import { moodboards } from '../schema/moodboards.ts'
import { weddings } from '../schema/weddings.ts'
import { withTenant } from '../tenant.ts'
import { fail, ok, type Result } from './result.ts'
import type { WeddingScope } from './scope.ts'

/**
 * The Files screen and the moodboard (spec 0003, slice S5). One table, two screens: `kind`
 * is `file` for the first and `image` for the second, so there is one upload path and one
 * visibility rule.
 *
 * The bytes are never here. `storage_key` names an object that `packages/storage` signed a
 * URL for; this file only keeps the claim that it exists.
 *
 * ## A read returns `null` and a write `notFound` for "no access", and that is a 404
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
  /** The board an image is on (spec 0007); `null` exactly for `kind = 'file'`. */
  readonly moodboardId: string | null
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
  moodboardId: files.moodboardId,
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
 * Confirmed files of one kind, newest first. `null` means no access, `[]` means none yet.
 * `moodboardId` narrows images to one board (spec 0007); omitted, every board's.
 *
 * The `eq(files.weddingId, ...)` is load-bearing for owner and admin, whose principal is
 * org-wide and so sees every wedding's files; it is redundant for an assigned member, whose
 * pinned GUC already narrows it. The same split `getWedding` describes.
 */
export async function listFiles(
  scope: WeddingScope,
  kind: FileKind,
  moodboardId?: string,
): Promise<FileRow[] | null> {
  const { db, weddingId } = scope
  const principal = scope.principal
  if (!principal) return null

  const rows = await withTenant(db, principal, async (tx) =>
    tx
      .select(COLUMNS)
      .from(files)
      .leftJoin(users, eq(users.id, files.uploadedBy))
      .where(
        and(
          eq(files.weddingId, weddingId),
          eq(files.kind, kind),
          isNull(files.deletedAt),
          moodboardId === undefined ? undefined : eq(files.moodboardId, moodboardId),
        ),
      )
      .orderBy(desc(files.createdAt), desc(files.id)),
  )
  return rows.map(toRow)
}

/** One confirmed file, or `null`. What a download reads before it mints a URL. */
export async function getFile(scope: WeddingScope, fileId: string): Promise<FileRow | null> {
  const { db, weddingId } = scope
  const principal = scope.principal
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

/**
 * An image names its board and a file cannot (spec 0007): a union, so the shape the
 * `files_moodboard_kind_check` constraint refuses cannot be built in the first place.
 */
export type PendingFileInput = {
  /** `newId()`, and the last segment of `storageKey`. */
  readonly id: string
  readonly name: string
  readonly storageKey: string
  readonly sizeBytes: number
  readonly mime: string
  readonly visibility: FileVisibility
} & (
  | { readonly kind: 'file'; readonly moodboardId?: never }
  | { readonly kind: 'image'; readonly moodboardId: string }
)

/**
 * Inserts a row that is invisible until `confirmFile`. `notFound` when the wedding is not
 * reachable by this principal.
 *
 * The wedding is read first because the FK from `files.wedding_id` is plain, not composite
 * (spec 0003, "Shared rules"): RLS checks that the row's `org_id` is ours and says nothing
 * about whose wedding the id names, so an insert naming another org's wedding would succeed.
 * `uploaded_by` is the caller, taken from the memberships and never from the input. An image's
 * board is read the same way, and must be on this wedding -- same plain-FK reason.
 */
export async function createPendingFile(
  scope: WeddingScope,
  input: PendingFileInput,
): Promise<Result<null, 'notFound'>> {
  const { db, m, orgId, weddingId } = scope
  const principal = scope.principal
  if (!principal) return fail('notFound')

  return withTenant(db, principal, async (tx) => {
    const parent = await tx
      .select({ id: weddings.id })
      .from(weddings)
      .where(and(eq(weddings.id, weddingId), isNull(weddings.deletedAt)))
    if (parent.length === 0) return fail('notFound')

    if (input.kind === 'image') {
      const board = await tx
        .select({ id: moodboards.id })
        .from(moodboards)
        .where(and(eq(moodboards.id, input.moodboardId), eq(moodboards.weddingId, weddingId)))
      if (board.length === 0) return fail('notFound')
    }

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
      moodboardId: input.kind === 'image' ? input.moodboardId : null,
      uploadedBy: m.userId,
      createdAt: at,
      updatedAt: at,
      deletedAt: at,
    })
    return ok(null)
  })
}

/**
 * Makes a pending row real. `notFound` unless the row is pending AND was created by the caller,
 * so a confirm cannot resurrect a deleted file (a delete is a later instant, not equal to
 * `created_at`) and cannot be used on somebody else's half-finished upload.
 */
export async function confirmFile(
  scope: WeddingScope,
  fileId: string,
): Promise<Result<FileRow, 'notFound'>> {
  const { db, m, weddingId } = scope
  const principal = scope.principal
  if (!principal) return fail('notFound')

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
  if (changed.length === 0) return fail('notFound')
  const row = await getFile(scope, fileId)
  return row ? ok(row) : fail('notFound')
}

/** The Files screen's caption and the moodboard's. `notFound` when nothing was changed. */
export async function renameFile(
  scope: WeddingScope,
  fileId: string,
  name: string,
): Promise<Result<null, 'notFound'>> {
  return updateConfirmed(scope, fileId, { name })
}

export async function setFileVisibility(
  scope: WeddingScope,
  fileId: string,
  visibility: FileVisibility,
): Promise<Result<null, 'notFound'>> {
  return updateConfirmed(scope, fileId, { visibility })
}

/**
 * Soft delete. The object stays in the bucket: the app is not granted `s3:DeleteObject`
 * (`packages/storage/README.md`), so a lifecycle rule or a job removes it, not this.
 */
export async function removeFile(
  scope: WeddingScope,
  fileId: string,
): Promise<Result<null, 'notFound'>> {
  return updateConfirmed(scope, fileId, { deletedAt: new Date() })
}

/**
 * Undo for `removeFile`, the Files screen's and the moodboard's (spec 0009 C4). Same principal
 * and the same `weddingId` in the `where` as the remove, plus the wedding parent read: a file
 * is not brought back onto a deleted wedding.
 *
 * **Never a pending row.** `deleted_at = created_at` is "upload not confirmed" (see the header),
 * and clearing it here would let anyone with standing confirm a half-finished upload of somebody
 * else's -- the thing `confirmFile` refuses by checking the uploader. So the predicate is
 * "deleted, and deleted later than it was created", which is exactly a real remove.
 *
 * An image whose board was deleted since comes back on the default board: `deleteBoard` moved it
 * there when it soft-deleted it, because `files.moodboard_id` may not name a board that is gone.
 * The one pending row this predicate cannot tell apart is an upload in flight when its board was
 * deleted (`deleteBoard` stamps it like a real delete); restoring that by id lands a row whose
 * object may never have arrived, which is what `confirmFile` already allows its own uploader and
 * harms only this wedding's list. No time limit, for the reason `restoreBudgetLine` gives.
 */
export async function restoreFile(
  scope: WeddingScope,
  fileId: string,
): Promise<Result<null, 'notFound'>> {
  const { db, weddingId } = scope
  const principal = scope.principal
  if (!principal) return fail('notFound')

  const changed = await withTenant(db, principal, async (tx) => {
    const parent = await tx
      .select({ id: weddings.id })
      .from(weddings)
      .where(and(eq(weddings.id, weddingId), isNull(weddings.deletedAt)))
    if (parent.length === 0) return []
    return tx
      .update(files)
      .set({ deletedAt: null, updatedAt: new Date() })
      .where(
        and(
          eq(files.id, fileId),
          eq(files.weddingId, weddingId),
          // Also "is deleted": a live row's null `deleted_at` makes `<>` null, which is not true.
          // No separate `is not null` beside it -- a mutation sweep showed it could never decide.
          sql`${files.deletedAt} <> ${files.createdAt}`,
        ),
      )
      .returning({ id: files.id })
  })
  return changed.length > 0 ? ok(null) : fail('notFound')
}

async function updateConfirmed(
  scope: WeddingScope,
  fileId: string,
  set: { name?: string; visibility?: FileVisibility; deletedAt?: Date },
): Promise<Result<null, 'notFound'>> {
  const { db, weddingId } = scope
  const principal = scope.principal
  if (!principal) return fail('notFound')

  const changed = await withTenant(db, principal, async (tx) =>
    tx
      .update(files)
      .set({ ...set, updatedAt: new Date() })
      .where(and(eq(files.id, fileId), eq(files.weddingId, weddingId), isNull(files.deletedAt)))
      .returning({ id: files.id }),
  )
  return changed.length > 0 ? ok(null) : fail('notFound')
}
