import 'server-only'
import {
  confirmFile,
  createPendingFile,
  type FileKind,
  type FileRow,
  type FileVisibility,
  getFile,
  listFiles,
  newId,
  removeFile,
  renameFile,
  setFileVisibility,
} from '@guestnote/db'
import { getDb } from './db.ts'
import { currentCaller } from './principal.ts'
import { getStorage } from './storage.ts'
import { isUuid } from './uuid.ts'

/**
 * What the Files and Moodboard Server Functions do, once. Each route folder's `actions.ts` is a
 * thin `'use server'` wrapper that pins `kind` (`file` for one, `image` for the other) and calls
 * in here, so the two screens cannot drift on membership, validation or the upload order.
 *
 * ## Every function resolves its own memberships
 *
 * A Server Function is a POST to its own route (invariant 7), so nothing here trusts the page
 * that rendered the button. `currentMemberships()` is the fact and every argument that comes
 * from a client is an assertion. The repository then re-derives the principal from the
 * memberships and applies RLS, and answers `null` for "no access", which is `not_found` here:
 * the same 404-not-403 rule `getWedding` follows, so nothing distinguishes a wedding you may
 * not touch from one that does not exist.
 *
 * ## Arguments are `unknown`
 *
 * They arrive as whatever the request body said; TypeScript has no presence on the wire. The
 * wrappers type them for the caller's benefit and this file narrows them anyway.
 */

export type FileFailure =
  | 'not_found'
  | 'invalid_name'
  | 'invalid_size'
  | 'too_large'
  | 'type_not_allowed'
  | 'unavailable'

export type StartUpload =
  | {
      readonly ok: true
      readonly fileId: string
      readonly url: string
      /** Verbatim, minus `Content-Length`, which a browser sets itself and refuses to be given. */
      readonly headers: Readonly<Record<string, string>>
    }
  | { readonly ok: false; readonly error: FileFailure }

export type Done = { readonly ok: true } | { readonly ok: false; readonly error: FileFailure }

export const NAME_MAX = 200

/** Control characters out, ends trimmed. `null` for empty or not a string. */
export function cleanName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  // biome-ignore lint/suspicious/noControlCharactersInRegex: stripping them is the point
  const cleaned = raw.replace(/[\u0000-\u001f\u007f]/g, ' ').trim()
  if (cleaned === '' || cleaned.length > NAME_MAX) return null
  return cleaned
}

async function context(weddingId: unknown) {
  if (!isUuid(weddingId)) return null
  const c = await currentCaller()
  return c ? { m: c.memberships, orgId: c.orgId, weddingId } : null
}

const isVisibility = (v: unknown): v is FileVisibility => v === 'shared' || v === 'internal'

/**
 * Step one of an upload: validate, sign, and make the hidden row. Nothing is stored yet.
 *
 * The signature comes BEFORE the row so a refusal (wrong type, too large) leaves nothing
 * behind. The cost is one signed URL discarded when the wedding turns out to be unreachable,
 * which is a local HMAC and is never returned.
 */
export async function startUpload(
  kind: FileKind,
  weddingId: unknown,
  input: { name: unknown; mime: unknown; sizeBytes: unknown; visibility: unknown },
): Promise<StartUpload> {
  const ctx = await context(weddingId)
  if (!ctx) return { ok: false, error: 'not_found' }

  const name = cleanName(input.name)
  if (!name) return { ok: false, error: 'invalid_name' }
  if (typeof input.mime !== 'string' || typeof input.sizeBytes !== 'number') {
    return { ok: false, error: 'invalid_size' }
  }
  const visibility: FileVisibility = isVisibility(input.visibility) ? input.visibility : 'shared'

  const fileId = newId()
  const signed = await getStorage().presignUpload({
    scope: { orgId: ctx.orgId, weddingId: ctx.weddingId },
    fileId,
    kind,
    contentType: input.mime,
    sizeBytes: input.sizeBytes,
  })
  if (!signed.ok) return { ok: false, error: signed.failure }

  const created = await createPendingFile(getDb(), ctx.m, ctx.orgId, ctx.weddingId, {
    id: fileId,
    kind,
    name,
    storageKey: signed.key,
    sizeBytes: input.sizeBytes,
    // The normalised type the URL was signed for, not the raw string that arrived.
    mime: signed.headers['Content-Type'],
    visibility,
  })
  if (!created) return { ok: false, error: 'not_found' }

  const { 'Content-Length': _length, ...headers } = signed.headers
  return { ok: true, fileId, url: signed.url, headers }
}

/**
 * Step three: the browser says the PUT finished. Takes only ids, so the size and type the row
 * carries are the ones step one validated -- a client cannot change them by confirming.
 *
 * It takes the client's word that the bytes arrived (`repos/files.ts` says so at length): a
 * planner who confirms without uploading gets a row whose download 404s at S3, and that harms
 * nobody but their own wedding's list.
 */
export async function confirmUpload(weddingId: unknown, fileId: unknown): Promise<Done> {
  const ctx = await context(weddingId)
  if (!ctx || !isUuid(fileId)) {
    return { ok: false, error: 'not_found' }
  }
  const row = await confirmFile(getDb(), ctx.m, ctx.orgId, ctx.weddingId, fileId)
  return row ? { ok: true } : { ok: false, error: 'not_found' }
}

export async function removeWeddingFile(weddingId: unknown, fileId: unknown): Promise<Done> {
  const ctx = await context(weddingId)
  if (!ctx || !isUuid(fileId)) {
    return { ok: false, error: 'not_found' }
  }
  return (await removeFile(getDb(), ctx.m, ctx.orgId, ctx.weddingId, fileId))
    ? { ok: true }
    : { ok: false, error: 'not_found' }
}

/** A moodboard caption, and the Files screen's rename. Both are `files.name`. */
export async function renameWeddingFile(
  weddingId: unknown,
  fileId: unknown,
  name: unknown,
): Promise<Done> {
  const ctx = await context(weddingId)
  if (!ctx || !isUuid(fileId)) {
    return { ok: false, error: 'not_found' }
  }
  const cleaned = cleanName(name)
  if (!cleaned) return { ok: false, error: 'invalid_name' }
  return (await renameFile(getDb(), ctx.m, ctx.orgId, ctx.weddingId, fileId, cleaned))
    ? { ok: true }
    : { ok: false, error: 'not_found' }
}

export async function setWeddingFileVisibility(
  weddingId: unknown,
  fileId: unknown,
  visibility: unknown,
): Promise<Done> {
  const ctx = await context(weddingId)
  if (!ctx || !isUuid(fileId) || !isVisibility(visibility)) {
    return { ok: false, error: 'not_found' }
  }
  return (await setFileVisibility(getDb(), ctx.m, ctx.orgId, ctx.weddingId, fileId, visibility))
    ? { ok: true }
    : { ok: false, error: 'not_found' }
}

/**
 * A fresh presigned GET for one file, or `null` for anything the caller may not read.
 *
 * The row is read under `withTenant` first, and only a row that comes back gets a URL: the
 * package's key-in-scope check is the second lock, not the first. Images are served `inline`
 * so an `<img>` can draw them; everything else is `attachment`, which is the package's
 * default and the safe direction for untrusted content.
 */
export async function downloadUrl(weddingId: unknown, fileId: unknown): Promise<string | null> {
  const ctx = await context(weddingId)
  if (!ctx || !isUuid(fileId)) return null

  const row = await getFile(getDb(), ctx.m, ctx.orgId, ctx.weddingId, fileId)
  if (!row) return null

  return signRow(ctx, row)
}

/**
 * A signed GET for one row, or `null` when there is nothing to sign.
 *
 * `presignDownload` THROWS for a key outside the caller's scope, because for a programmer that
 * is a bug worth a stack trace. A row whose key was not written by this app is not that: the dev
 * seed writes `seed/<org>/<wedding>/<n>` keys for objects that never existed, and a bad row
 * must be one broken tile or one dead download, not a 500 for the whole screen. Measured
 * 2026-09-21: the seeded moodboard rows took `/moodboard` down before this catch.
 */
async function signRow(
  ctx: { orgId: string; weddingId: string },
  row: FileRow,
): Promise<string | null> {
  try {
    const signed = await getStorage().presignDownload({
      scope: { orgId: ctx.orgId, weddingId: ctx.weddingId },
      key: row.storageKey,
      filename: row.name,
      disposition: row.kind === 'image' ? 'inline' : 'attachment',
    })
    return signed.ok ? signed.url : null
  } catch {
    return null
  }
}

/**
 * The wedding's confirmed files of one kind, or `null` for no access (a 404 in the page).
 *
 * `weddingId` is the URL segment, so it may be anything; `context()` turns a non-UUID into
 * `null` before it reaches a query, which is the same answer as a wedding that does not exist.
 */
export async function listWeddingFiles(
  kind: FileKind,
  weddingId: unknown,
): Promise<FileRow[] | null> {
  const ctx = await context(weddingId)
  if (!ctx) return null
  return listFiles(getDb(), ctx.m, ctx.orgId, ctx.weddingId, kind)
}

export type ImageTile = FileRow & {
  /** A 5 minute signed GET, or `null` when signing failed and the tile shows its placeholder. */
  readonly url: string | null
}

/**
 * The moodboard: every image with a URL to draw it from, signed here at render.
 *
 * Signing is a local HMAC, so N images cost N cheap calls and no network. The URLs die after
 * five minutes (`packages/storage`), which `components/files/SPEC.md` accepts: a proxy route
 * that streams each image would keep them alive and put every moodboard view through a Lambda.
 */
export async function listWeddingImages(weddingId: unknown): Promise<ImageTile[] | null> {
  const ctx = await context(weddingId)
  if (!ctx) return null
  const rows = await listFiles(getDb(), ctx.m, ctx.orgId, ctx.weddingId, 'image')
  if (!rows) return null

  return Promise.all(rows.map(async (row) => ({ ...row, url: await signRow(ctx, row) })))
}
