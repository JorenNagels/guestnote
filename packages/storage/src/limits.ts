import type { UploadKind } from './types.ts'

/**
 * What may be uploaded, how big, and for how long a URL lives. Data, so the numbers can be
 * argued with in one place and asserted in one test.
 */

/**
 * 25 MiB. A planner's files are PDFs, quotes and phone photos; a phone photo is 2 to 8 MB and a
 * scanned contract is rarely over 10. The number is a guess at "generous for a document, too
 * small for a video", not a measurement, and `createStorage({ maxBytes })` overrides it. There is
 * no Lambda in the upload path -- the browser PUTs to S3 directly -- so the 6 MB Lambda payload
 * limit is not what this is protecting.
 */
export const DEFAULT_MAX_BYTES = 25 * 1024 * 1024

/**
 * 2 MiB for a studio logo (spec 0005). A logo is drawn at 28 to 48 CSS pixels, so anything
 * near this is already far more than it needs; the number is the spec's, chosen so a phone
 * screenshot of a logo passes and a camera photo of a shopfront does not. Applied on top of the
 * storage-wide limit, never instead of it: a smaller `maxBytes` still wins.
 */
export const LOGO_MAX_BYTES = 2 * 1024 * 1024

/**
 * Five minutes for both directions. A presigned URL is a bearer credential: whoever holds it can
 * use it, and it cannot be revoked short of expiry. Five minutes covers a slow venue connection
 * starting a 25 MB upload, and a download link is minted per click so it never needs longer.
 *
 * The Lambda role's own credentials are the ceiling anyway -- a URL signed with temporary
 * credentials dies when they do -- so a longer value here would not buy what it looks like it buys.
 */
export const PRESIGN_EXPIRES_SECONDS = 300

const IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  // iPhones produce these by default, and a moodboard filled from a phone is the main use.
  'image/heic',
  'image/heif',
  'image/avif',
] as const

/**
 * What a moodboard holds besides images, since 2026-10-04: a venue's floor plan, a florist's
 * quote, a mood deck from the couple. PDF and the six Office formats, and nothing else -- not
 * the Files screen's `text/plain` or `text/csv`, which nobody pins to a board, and never a type
 * a browser renders as a document of its own (see `ALLOWED_CONTENT_TYPES`).
 */
const MOODBOARD_DOCUMENT_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
] as const

const DOCUMENT_TYPES = [
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
] as const

/**
 * The allow-list, per kind.
 *
 * **`image/svg+xml` and `text/html` are absent on purpose.** Both can carry script, and a file
 * served `inline` from a bucket origin would run it. Everything is also served with
 * `Content-Disposition: attachment` by default, so this is the second lock, not the only one.
 *
 * The browser's `File.type` is a hint from the file extension, not a sniffed truth, so this list
 * is a guard against accidents and against the cheap attack -- not against a determined one.
 * Nothing here scans content. If the files ever go to a page other people open unauthenticated,
 * that changes.
 */
export const ALLOWED_CONTENT_TYPES: Readonly<Record<UploadKind, readonly string[]>> = {
  // The moodboard's kind. Named when a board held images only, and still called `image`
  // because `files.kind`, `files_moodboard_kind_check`, `files.link_read` (0012) and every
  // `couple_*` image function (0013) key on that value -- renaming it is a migration across
  // two security-relevant ones for a word. Widened to documents 2026-10-04 (spec 0007, amended):
  // a PDF on a board reaches a vendor link or the couple through exactly the same policies.
  image: [...IMAGE_TYPES, ...MOODBOARD_DOCUMENT_TYPES],
  // A planner drops a photo into Files as readily as into the moodboard.
  file: [...DOCUMENT_TYPES, ...IMAGE_TYPES],
  // Spec 0005: the three every browser draws. Not GIF (a moving logo in a sidebar), not HEIC
  // and AVIF (a vendor opening a link on an older browser sees nothing), and not SVG for the
  // reason above -- the design offered SVG and the spec dropped it rather than weaken this.
  logo: ['image/png', 'image/jpeg', 'image/webp'],
}

/**
 * `image/JPEG`, `text/csv; charset=utf-8` and ` image/png ` all become the bare lower-case type.
 *
 * The result is what is signed *and* what the caller is told to send, so the browser and the
 * signature cannot disagree over a parameter or a capital letter -- S3 compares the header
 * byte for byte and answers a mismatch with `SignatureDoesNotMatch`, which reads as an outage.
 */
export function normaliseContentType(raw: string): string {
  return (raw.split(';')[0] ?? '').trim().toLowerCase()
}

/**
 * Every type any kind accepts. A GET for anything outside it is served as
 * `application/octet-stream` and `attachment` (`servedAs`).
 */
const ANY_ALLOWED: ReadonlySet<string> = new Set(Object.values(ALLOWED_CONTENT_TYPES).flat())

/**
 * The types a browser may show **in place**: the raster images, and PDF. Everything else is
 * served `attachment` however the caller asked, so a Word file opened from a moodboard is
 * saved rather than handed to a renderer.
 *
 * PDF is the one document here, because "click the floor plan, see the floor plan" is the point
 * of putting it on a board. A PDF can carry script, but the browser's PDF viewer runs it (where it
 * runs it at all) in its own sandbox, not as the page's origin -- and in a deployed environment
 * the origin is the bucket's, which holds no session. Rejected: `text/plain` inline, which some
 * browsers still sniff without `X-Content-Type-Options`, a header a presigned S3 GET cannot set.
 * `image/svg+xml` and `text/html` cannot get here: no kind accepts them.
 */
export const INLINE_CONTENT_TYPES: readonly string[] = [...IMAGE_TYPES, 'application/pdf']

/**
 * The `Content-Type` and disposition a GET is signed with, from the row's stored type and the
 * caller's wish. Signed as `response-content-type`, so S3 answers with this and not with whatever
 * metadata the object carries: an object written by anything other than this package's PUT (a
 * console upload, a seed) still cannot come back as `text/html`.
 */
export function servedAs(
  storedType: string,
  wanted: 'inline' | 'attachment',
): { readonly contentType: string; readonly disposition: 'inline' | 'attachment' } {
  const type = normaliseContentType(storedType)
  if (!ANY_ALLOWED.has(type)) {
    return { contentType: 'application/octet-stream', disposition: 'attachment' }
  }
  const inline = wanted === 'inline' && INLINE_CONTENT_TYPES.includes(type)
  return { contentType: type, disposition: inline ? 'inline' : 'attachment' }
}
