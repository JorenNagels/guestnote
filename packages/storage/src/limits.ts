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
  image: IMAGE_TYPES,
  // A planner drops a photo into Files as readily as into the moodboard.
  file: [...DOCUMENT_TYPES, ...IMAGE_TYPES],
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
