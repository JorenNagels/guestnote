'use server'

import { currentOrgId } from '../../../../../../lib/principal.ts'
import { assertWritable } from '../../../../../../lib/trial.ts'
import {
  confirmUpload,
  downloadUrl,
  removeWeddingFile,
  renameWeddingFile,
  setWeddingFileVisibility,
  startUpload,
} from '../../../../../../lib/wedding-files.ts'

/**
 * The Files screen's Server Functions. Each is a POST to its own route, so none of them can
 * lean on the page having rendered: `lib/wedding-files.ts` resolves memberships in every one
 * (invariant 7). This file only pins `kind: 'file'`, which is the one thing that differs from the
 * moodboard's.
 *
 * `weddingId` is first so the page can `bind` it and hand the client a function that cannot name
 * another wedding by accident. It is still re-checked here: a bound argument is a convenience
 * for honest callers and does not stop a forged request.
 */

type Visibility = 'shared' | 'internal'

export async function startFileUpload(
  weddingId: string,
  input: { name: string; mime: string; sizeBytes: number; visibility: Visibility },
) {
  await assertWritable(await currentOrgId())
  return startUpload('file', weddingId, input)
}

export async function confirmFileUpload(weddingId: string, fileId: string) {
  await assertWritable(await currentOrgId())
  return confirmUpload(weddingId, fileId)
}

export async function removeFile(weddingId: string, fileId: string) {
  await assertWritable(await currentOrgId())
  return removeWeddingFile(weddingId, fileId)
}

export async function renameFile(weddingId: string, fileId: string, name: string) {
  await assertWritable(await currentOrgId())
  return renameWeddingFile(weddingId, fileId, name)
}

export async function setFileVisibility(weddingId: string, fileId: string, visibility: Visibility) {
  await assertWritable(await currentOrgId())
  return setWeddingFileVisibility(weddingId, fileId, visibility)
}

export async function downloadFile(weddingId: string, fileId: string) {
  return downloadUrl(weddingId, fileId)
}
