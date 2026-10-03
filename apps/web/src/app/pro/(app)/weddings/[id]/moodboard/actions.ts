'use server'

import {
  addImageComment,
  getCoupleAccess,
  listImageComments,
  markCoupleActivitySeen,
} from '@guestnote/db'
import { getLocale } from 'next-intl/server'
import type { ThreadComment } from '../../../../../../components/couple/comment-thread.tsx'
import {
  addBoard,
  type BoardCreated,
  type BoardDone,
  moveWeddingImage,
  removeWeddingBoard,
  renameWeddingBoard,
  shareWeddingBoard,
  shareWeddingBoardWithCouple,
} from '../../../../../../lib/moodboards.ts'
import { currentOrgId, currentSession } from '../../../../../../lib/principal.ts'
import { COMMENT_MAX } from '../../../../../../lib/task-form.ts'
import { assertWritable } from '../../../../../../lib/trial.ts'
import { isUuid } from '../../../../../../lib/uuid.ts'
import {
  confirmUpload,
  downloadUrl,
  removeWeddingFile,
  renameWeddingFile,
  restoreWeddingFile,
  startUpload,
} from '../../../../../../lib/wedding-files.ts'
import { currentWeddingScope } from '../../../../../../lib/wedding-scope.ts'

export type ImageThread = ThreadComment[]

/**
 * The moodboard's Server Functions: the Files screen's, pinned to `kind: 'image'`, minus the
 * visibility and download the board has no use for. `visibility` is fixed at `shared` by the
 * screen; a moodboard image is not something a planner hides from the couple.
 *
 * Since spec 0007 an upload names its board, and the board functions below manage the boards
 * and their audience. Any staff, as the images always were.
 */

export async function startImageUpload(
  weddingId: string,
  moodboardId: string,
  input: { name: string; mime: string; sizeBytes: number; visibility: 'shared' | 'internal' },
) {
  await assertWritable(await currentOrgId())
  return startUpload({ kind: 'image', moodboardId }, weddingId, input)
}

export async function confirmImageUpload(weddingId: string, fileId: string) {
  await assertWritable(await currentOrgId())
  return confirmUpload(weddingId, fileId)
}

export async function removeImage(weddingId: string, fileId: string) {
  await assertWritable(await currentOrgId())
  return removeWeddingFile(weddingId, fileId)
}

/** The toast's Undo for `removeImage` (spec 0009 C4): the same restore as the Files screen's. */
export async function restoreImage(weddingId: string, fileId: string) {
  await assertWritable(await currentOrgId())
  return restoreWeddingFile(weddingId, fileId)
}

/**
 * A fresh URL to open one item of the board in (2026-10-04): an image or a PDF in a new tab, any
 * other document as a download -- the storage seam picks which from the row's type. Signed per
 * click, as every download is, because the tiles' render-time URLs die after five minutes and a
 * planner keeps a board open longer than that. A read, so on the trial guard's allowlist.
 */
export async function openMoodboardFile(weddingId: string, fileId: string) {
  return downloadUrl(weddingId, fileId)
}

export async function renameImage(weddingId: string, fileId: string, caption: string) {
  await assertWritable(await currentOrgId())
  return renameWeddingFile(weddingId, fileId, caption)
}

export async function createMoodboard(weddingId: string, name: string): Promise<BoardCreated> {
  await assertWritable(await currentOrgId())
  return addBoard(weddingId, name)
}

export async function renameMoodboard(
  weddingId: string,
  boardId: string,
  name: string,
): Promise<BoardDone> {
  await assertWritable(await currentOrgId())
  return renameWeddingBoard(weddingId, boardId, name)
}

export async function deleteMoodboard(weddingId: string, boardId: string): Promise<BoardDone> {
  await assertWritable(await currentOrgId())
  return removeWeddingBoard(weddingId, boardId)
}

export async function shareMoodboard(
  weddingId: string,
  boardId: string,
  weddingVendorIds: string[],
): Promise<BoardDone> {
  await assertWritable(await currentOrgId())
  return shareWeddingBoard(weddingId, boardId, weddingVendorIds)
}

export async function shareMoodboardWithCouple(
  weddingId: string,
  boardId: string,
  shared: boolean,
): Promise<BoardDone> {
  await assertWritable(await currentOrgId())
  return shareWeddingBoardWithCouple(weddingId, boardId, shared)
}

export async function moveMoodboardImage(
  weddingId: string,
  fileId: string,
  boardId: string,
): Promise<BoardDone> {
  await assertWritable(await currentOrgId())
  return moveWeddingImage(weddingId, fileId, boardId)
}

/**
 * Spec 0008: an image's comment thread, for staff. Opening it is reading what the couple wrote,
 * so it also clears the image's unread dot -- a read receipt, which is why this one is on
 * `trial-guard.test.ts`'s allowlist and `addImageCommentAction` is not. `null` for no standing.
 */
export async function imageCommentsAction(
  weddingId: string,
  fileId: string,
): Promise<ImageThread | null> {
  if (!isUuid(fileId)) return null
  const scope = await currentWeddingScope(weddingId)
  if (!scope) return null
  const [comments, access, locale] = await Promise.all([
    listImageComments(scope, fileId),
    getCoupleAccess(scope),
    getLocale(),
  ])
  if (!comments) return null
  await markCoupleActivitySeen(scope, { kind: 'file', id: fileId })
  const couple = new Set(access?.partners.map((p) => p.userId) ?? [])
  const self = (await currentSession())?.userId
  const when = new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    // Belgium, as `i18n/request.ts` gives every `useFormatter`: the server runs in UTC.
    timeZone: 'Europe/Brussels',
  })
  return comments.map((c) => ({
    id: c.id,
    author: c.authorName ?? '',
    byCouple: c.authorUserId !== null && couple.has(c.authorUserId),
    isOwn: c.authorUserId === self,
    body: c.body,
    when: when.format(c.createdAt),
  }))
}

export async function addImageCommentAction(
  weddingId: string,
  fileId: string,
  body: string,
): Promise<boolean> {
  await assertWritable(await currentOrgId())
  const text = String(body ?? '').trim()
  if (!isUuid(fileId) || !text || text.length > COMMENT_MAX) return false
  const scope = await currentWeddingScope(weddingId)
  if (!scope) return false
  return (await addImageComment(scope, fileId, text)).ok
}
