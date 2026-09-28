'use server'

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
import { currentOrgId } from '../../../../../../lib/principal.ts'
import { assertWritable } from '../../../../../../lib/trial.ts'
import {
  confirmUpload,
  removeWeddingFile,
  renameWeddingFile,
  startUpload,
} from '../../../../../../lib/wedding-files.ts'

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
