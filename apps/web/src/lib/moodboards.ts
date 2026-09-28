import 'server-only'
import {
  BOARD_NAME_MAX,
  type BoardRow,
  createBoard,
  deleteBoard,
  listBoards,
  moveImage,
  renameBoard,
  setBoardCoupleShare,
  setBoardShares,
} from '@guestnote/db'
import { isUuid } from './uuid.ts'
import { currentWeddingScope } from './wedding-scope.ts'

/**
 * The moodboard's board Server Functions (spec 0007), once, the way `wedding-files.ts` does the
 * image ones. Every argument is `unknown` and narrowed here; the repo re-derives the principal
 * and reads every named row under `withTenant`, so a board or vendor id from another wedding is
 * `notFound` there, not trusted here.
 */

export type BoardFailure = 'notFound' | 'invalidName' | 'isDefault'
export type BoardDone = { readonly ok: true } | { readonly ok: false; readonly error: BoardFailure }
export type BoardCreated =
  | { readonly ok: true; readonly id: string }
  | { readonly ok: false; readonly error: BoardFailure }

const context = currentWeddingScope
const NOT_FOUND = { ok: false, error: 'notFound' } as const
const done = (r: { ok: boolean }): BoardDone => (r.ok ? { ok: true } : NOT_FOUND)

/** Control characters out, ends trimmed, at most `BOARD_NAME_MAX`. `null` for nothing left. */
export function cleanBoardName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  // biome-ignore lint/suspicious/noControlCharactersInRegex: stripping them is the point
  const cleaned = raw.replace(/[\u0000-\u001f\u007f]/g, ' ').trim()
  if (cleaned === '' || cleaned.length > BOARD_NAME_MAX) return null
  return cleaned
}

export async function weddingBoards(weddingId: unknown): Promise<BoardRow[] | null> {
  const ctx = await context(weddingId)
  return ctx ? listBoards(ctx) : null
}

export async function addBoard(weddingId: unknown, name: unknown): Promise<BoardCreated> {
  const cleaned = cleanBoardName(name)
  if (!cleaned) return { ok: false, error: 'invalidName' }
  const ctx = await context(weddingId)
  if (!ctx) return NOT_FOUND
  const r = await createBoard(ctx, cleaned)
  return r.ok ? { ok: true, id: r.value.id } : NOT_FOUND
}

export async function renameWeddingBoard(
  weddingId: unknown,
  boardId: unknown,
  name: unknown,
): Promise<BoardDone> {
  const cleaned = cleanBoardName(name)
  if (!cleaned) return { ok: false, error: 'invalidName' }
  const ctx = await context(weddingId)
  if (!ctx || !isUuid(boardId)) return NOT_FOUND
  return done(await renameBoard(ctx, boardId, cleaned))
}

export async function removeWeddingBoard(weddingId: unknown, boardId: unknown): Promise<BoardDone> {
  const ctx = await context(weddingId)
  if (!ctx || !isUuid(boardId)) return NOT_FOUND
  const r = await deleteBoard(ctx, boardId)
  if (r.ok) return { ok: true }
  return { ok: false, error: r.reason === 'isDefault' ? 'isDefault' : 'notFound' }
}

/** The whole audience at once: the vendor list is replaced, never patched (see the repo). */
export async function shareWeddingBoard(
  weddingId: unknown,
  boardId: unknown,
  weddingVendorIds: unknown,
): Promise<BoardDone> {
  const ctx = await context(weddingId)
  if (!ctx || !isUuid(boardId)) return NOT_FOUND
  if (!Array.isArray(weddingVendorIds) || !weddingVendorIds.every(isUuid)) return NOT_FOUND
  return done(await setBoardShares(ctx, boardId, weddingVendorIds))
}

export async function shareWeddingBoardWithCouple(
  weddingId: unknown,
  boardId: unknown,
  shared: unknown,
): Promise<BoardDone> {
  const ctx = await context(weddingId)
  if (!ctx || !isUuid(boardId) || typeof shared !== 'boolean') return NOT_FOUND
  return done(await setBoardCoupleShare(ctx, boardId, shared))
}

export async function moveWeddingImage(
  weddingId: unknown,
  fileId: unknown,
  boardId: unknown,
): Promise<BoardDone> {
  const ctx = await context(weddingId)
  if (!ctx || !isUuid(fileId) || !isUuid(boardId)) return NOT_FOUND
  return done(await moveImage(ctx, fileId, boardId))
}
