import { and, asc, count, eq, inArray, isNull, sql } from 'drizzle-orm'
import type { Db } from '../client.ts'
import { newId } from '../id.ts'
import { files } from '../schema/files.ts'
import { moodboardShares, moodboards } from '../schema/moodboards.ts'
import { weddingVendors } from '../schema/vendors.ts'
import { weddings } from '../schema/weddings.ts'
import { type Principal, type TenantDb, withTenant } from '../tenant.ts'
import { fail, ok, type Result } from './result.ts'
import type { WeddingScope } from './scope.ts'

/**
 * Named moodboards and who they are shared with (spec 0007). The images stay `files` rows
 * (`repos/files.ts`); this file owns the boards, the shares, and moving an image between boards.
 *
 * Same contract as `files.ts`: a read returns `null` and a write `notFound` for "no access", and
 * a couple is refused before a transaction opens (spec 0003: no planner table is couple-readable
 * yet; `shared_with_couple` is stored for the couple portal, not read).
 *
 * Every write that names a second row -- a board, a wedding vendor, an image -- reads it under the
 * caller's `withTenant` first and checks it is on THIS wedding. The FKs are plain (spec 0003), so
 * an insert naming another wedding's id would otherwise succeed. Rejected: composite FKs, for the
 * reason `weddingVendors` gives.
 */

export type BoardRow = {
  readonly id: string
  readonly name: string
  readonly isDefault: boolean
  readonly sharedWithCouple: boolean
  /** Confirmed, live images on the board. */
  readonly imageCount: number
  /** The `wedding_vendors` ids it is shared with. */
  readonly sharedWith: readonly string[]
}

// 80, not a file name's 200: a board name is a pill in the switcher and a chip on the vendor
// sheet, and 80 still fits "Fotograaf -- ceremonie en receptie". Chosen, not measured.
export const BOARD_NAME_MAX = 80

/** The wedding's boards in switcher order: `position`, then creation. `null` means no access. */
export async function listBoards(scope: WeddingScope): Promise<BoardRow[] | null> {
  const { db, weddingId } = scope
  const principal = scope.principal
  if (!principal) return null

  return withTenant(db, principal, async (tx) => {
    const boards = await tx
      .select({
        id: moodboards.id,
        name: moodboards.name,
        isDefault: moodboards.isDefault,
        sharedWithCouple: moodboards.sharedWithCouple,
      })
      .from(moodboards)
      .where(eq(moodboards.weddingId, weddingId))
      .orderBy(asc(moodboards.position), asc(moodboards.createdAt), asc(moodboards.id))
    if (boards.length === 0) return []

    const ids = boards.map((b) => b.id)
    const counts = await tx
      .select({ id: files.moodboardId, n: count() })
      .from(files)
      .where(and(inArray(files.moodboardId, ids), isNull(files.deletedAt)))
      .groupBy(files.moodboardId)
    // A share with a removed (soft-deleted) wedding vendor is inert -- its link no longer
    // resolves -- and is left out so the chips never name a vendor the wedding no longer has.
    const shares = await tx
      .select({ boardId: moodboardShares.moodboardId, vendor: moodboardShares.weddingVendorId })
      .from(moodboardShares)
      .innerJoin(
        weddingVendors,
        and(
          eq(weddingVendors.id, moodboardShares.weddingVendorId),
          isNull(weddingVendors.deletedAt),
        ),
      )
      .where(inArray(moodboardShares.moodboardId, ids))

    return boards.map((b) => ({
      ...b,
      imageCount: counts.find((c) => c.id === b.id)?.n ?? 0,
      sharedWith: shares.filter((s) => s.boardId === b.id).map((s) => s.vendor),
    }))
  })
}

/**
 * A new, empty board, last in the switcher. `notFound` when the wedding is not reachable.
 * The name is the caller's to have cleaned; see `cleanBoardName`.
 */
export async function createBoard(
  scope: WeddingScope,
  name: string,
): Promise<Result<{ id: string }, 'notFound'>> {
  const { db, orgId, weddingId } = scope
  const principal = scope.principal
  if (!principal) return fail('notFound')

  return withTenant(db, principal, async (tx) => {
    const parent = await tx
      .select({ id: weddings.id })
      .from(weddings)
      .where(and(eq(weddings.id, weddingId), isNull(weddings.deletedAt)))
    if (parent.length === 0) return fail('notFound')

    const [last] = await tx
      .select({ max: sql<number>`coalesce(max(${moodboards.position}), 0)::int` })
      .from(moodboards)
      .where(eq(moodboards.weddingId, weddingId))

    const id = newId()
    await tx.insert(moodboards).values({
      id,
      orgId,
      weddingId,
      name,
      position: (last?.max ?? 0) + 1,
    })
    return ok({ id })
  })
}

export async function renameBoard(
  scope: WeddingScope,
  boardId: string,
  name: string,
): Promise<Result<null, 'notFound'>> {
  return updateBoard(scope, boardId, { name })
}

/** Stored for the couple portal; nothing reads it yet (spec 0007). */
export async function setBoardCoupleShare(
  scope: WeddingScope,
  boardId: string,
  shared: boolean,
): Promise<Result<null, 'notFound'>> {
  return updateBoard(scope, boardId, { sharedWithCouple: shared })
}

async function updateBoard(
  scope: WeddingScope,
  boardId: string,
  set: { name?: string; sharedWithCouple?: boolean },
): Promise<Result<null, 'notFound'>> {
  const { db, weddingId } = scope
  const principal = scope.principal
  if (!principal) return fail('notFound')

  const changed = await withTenant(db, principal, async (tx) =>
    tx
      .update(moodboards)
      .set({ ...set, updatedAt: new Date() })
      .where(and(eq(moodboards.id, boardId), eq(moodboards.weddingId, weddingId)))
      .returning({ id: moodboards.id }),
  )
  return changed.length > 0 ? ok(null) : fail('notFound')
}

/**
 * Deletes a board and soft-deletes its images, in one transaction. `isDefault` refuses: a wedding
 * always keeps somewhere to upload (spec 0007).
 *
 * Soft, not a cascade, for the reason `removeFile` gives: the objects stay in the bucket, and a
 * row is what a later sweep would find them by. `files.moodboard_id` has no cascade, so the rows
 * must be moved off the board before it goes -- they are pointed at the default board, deleted,
 * which keeps the check constraint (an image always has a board) true for the dead rows too.
 * A pending upload to this board (`deleted_at = created_at`) is stamped with a later instant,
 * which is what a real delete looks like -- otherwise its confirm would land it, alive, on the
 * default board.
 */
export async function deleteBoard(
  scope: WeddingScope,
  boardId: string,
): Promise<Result<{ images: number }, 'notFound' | 'isDefault'>> {
  const { db, weddingId } = scope
  const principal = scope.principal
  if (!principal) return fail('notFound')

  return withTenant(db, principal, async (tx) => {
    const [board] = await tx
      .select({ isDefault: moodboards.isDefault })
      .from(moodboards)
      .where(and(eq(moodboards.id, boardId), eq(moodboards.weddingId, weddingId)))
    if (!board) return fail('notFound')
    if (board.isDefault) return fail('isDefault')

    const [fallback] = await tx
      .select({ id: moodboards.id })
      .from(moodboards)
      .where(and(eq(moodboards.weddingId, weddingId), eq(moodboards.isDefault, true)))
    if (!fallback) return fail('notFound')

    const now = new Date()
    const live = await tx
      .update(files)
      .set({ deletedAt: now, updatedAt: now, moodboardId: fallback.id })
      .where(and(eq(files.moodboardId, boardId), isNull(files.deletedAt)))
      .returning({ id: files.id })
    // Everything else on the board: already-deleted rows keep their stamp, pending ones get a
    // real one (see above). Then the FK lets the board go.
    await tx
      .update(files)
      .set({
        moodboardId: fallback.id,
        deletedAt: sql`case when ${files.deletedAt} = ${files.createdAt} then ${now} else ${files.deletedAt} end`,
      })
      .where(eq(files.moodboardId, boardId))
    await tx.delete(moodboards).where(eq(moodboards.id, boardId))
    return ok({ images: live.length })
  })
}

/**
 * Replaces the board's vendor audience with exactly `weddingVendorIds`. Every id must be a live
 * vendor of THIS wedding, or nothing changes and the answer is `notFound` -- a partial share
 * would leave the planner looking at a checklist that is not what was saved.
 */
export async function setBoardShares(
  scope: WeddingScope,
  boardId: string,
  weddingVendorIds: readonly string[],
): Promise<Result<null, 'notFound'>> {
  const { db, orgId, weddingId } = scope
  const principal = scope.principal
  if (!principal) return fail('notFound')
  const wanted = [...new Set(weddingVendorIds)]

  return withTenant(db, principal, async (tx) => {
    const [board] = await tx
      .select({ id: moodboards.id })
      .from(moodboards)
      .where(and(eq(moodboards.id, boardId), eq(moodboards.weddingId, weddingId)))
    if (!board) return fail('notFound')

    if (wanted.length > 0) {
      const found = await tx
        .select({ id: weddingVendors.id })
        .from(weddingVendors)
        .where(
          and(
            inArray(weddingVendors.id, wanted),
            eq(weddingVendors.weddingId, weddingId),
            isNull(weddingVendors.deletedAt),
          ),
        )
      if (found.length !== wanted.length) return fail('notFound')
    }

    await tx.delete(moodboardShares).where(eq(moodboardShares.moodboardId, boardId))
    if (wanted.length > 0) {
      await tx.insert(moodboardShares).values(
        wanted.map((weddingVendorId) => ({
          moodboardId: boardId,
          weddingVendorId,
          orgId,
          weddingId,
        })),
      )
    }
    return ok(null)
  })
}

/** Moves one live image to another board of the same wedding. */
export async function moveImage(
  scope: WeddingScope,
  fileId: string,
  boardId: string,
): Promise<Result<null, 'notFound'>> {
  const { db, weddingId } = scope
  const principal = scope.principal
  if (!principal) return fail('notFound')

  return withTenant(db, principal, async (tx) => {
    const [board] = await tx
      .select({ id: moodboards.id })
      .from(moodboards)
      .where(and(eq(moodboards.id, boardId), eq(moodboards.weddingId, weddingId)))
    if (!board) return fail('notFound')

    const changed = await tx
      .update(files)
      .set({ moodboardId: boardId, updatedAt: new Date() })
      .where(
        and(
          eq(files.id, fileId),
          eq(files.weddingId, weddingId),
          eq(files.kind, 'image'),
          isNull(files.deletedAt),
        ),
      )
      .returning({ id: files.id })
    return changed.length > 0 ? ok(null) : fail('notFound')
  })
}

/**
 * The default board's name. One word that is the same in NL, EN and FR, which is why it can live
 * here and not in `messages/`: `createWedding` knows no locale, and the backfill in migration
 * 0012 wrote the same string. A planner renames it like any other board.
 */
export const DEFAULT_BOARD_NAME = 'Moodboard'

/** The default board every wedding gets, inside the caller's transaction (`createWedding`). */
export async function insertDefaultBoard(
  tx: TenantDb,
  orgId: string,
  weddingId: string,
): Promise<void> {
  await tx.insert(moodboards).values({
    id: newId(),
    orgId,
    weddingId,
    name: DEFAULT_BOARD_NAME,
    isDefault: true,
    position: 0,
  })
}

// ------------------------------------------------------------------ the vendor's side ----

export type SharedBoard = {
  readonly id: string
  readonly name: string
  readonly images: readonly {
    readonly id: string
    readonly name: string
    readonly storageKey: string
  }[]
}

/**
 * The boards shared with a link's vendor, and their live images, newest first. Read through the
 * `link_read` policies of migration 0012; the vendor clause repeats them as intent, the
 * convention `getVendorLinkView` documents. Boards with no images are still returned -- an empty
 * shared board is the planner's to fill, and the page says so.
 */
export async function listSharedBoards(
  db: Db,
  principal: Extract<Principal, { kind: 'link' }>,
): Promise<SharedBoard[]> {
  return withTenant(db, principal, async (tx) => {
    const boards = await tx
      .select({ id: moodboards.id, name: moodboards.name })
      .from(moodboards)
      .innerJoin(
        moodboardShares,
        and(
          eq(moodboardShares.moodboardId, moodboards.id),
          eq(moodboardShares.weddingVendorId, principal.weddingVendorId),
        ),
      )
      .orderBy(asc(moodboards.position), asc(moodboards.createdAt), asc(moodboards.id))
    if (boards.length === 0) return []

    const images = await tx
      .select({
        id: files.id,
        name: files.name,
        storageKey: files.storageKey,
        moodboardId: files.moodboardId,
      })
      .from(files)
      .where(
        and(
          inArray(
            files.moodboardId,
            boards.map((b) => b.id),
          ),
          eq(files.kind, 'image'),
          // Repeats `files.link_read`'s visibility clause as intent (0012), like the vendor clause.
          eq(files.visibility, 'shared'),
          isNull(files.deletedAt),
        ),
      )
      .orderBy(sql`${files.createdAt} desc`, sql`${files.id} desc`)

    return boards.map((b) => ({
      ...b,
      images: images
        .filter((i) => i.moodboardId === b.id)
        .map(({ id, name, storageKey }) => ({ id, name, storageKey })),
    }))
  })
}
