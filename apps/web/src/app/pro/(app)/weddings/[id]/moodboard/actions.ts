'use server'

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
 */

export async function startImageUpload(
  weddingId: string,
  input: { name: string; mime: string; sizeBytes: number; visibility: 'shared' | 'internal' },
) {
  return startUpload('image', weddingId, input)
}

export async function confirmImageUpload(weddingId: string, fileId: string) {
  return confirmUpload(weddingId, fileId)
}

export async function removeImage(weddingId: string, fileId: string) {
  return removeWeddingFile(weddingId, fileId)
}

export async function renameImage(weddingId: string, fileId: string, caption: string) {
  return renameWeddingFile(weddingId, fileId, caption)
}
