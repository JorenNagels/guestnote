/**
 * What a moodboard item is, for the browser and the server alike (2026-10-04, spec 0007 amended:
 * a board holds PDFs and Office files beside its images). Pure and import-free, so a client
 * component can use it.
 *
 * Two lists are restated from `packages/storage/src/limits.ts` rather than imported, for the
 * reason `components/studio/logo-upload.ts` gives: that package's entry point pulls the S3 SDK
 * into a client bundle. `board-items.test.ts` fails if either drifts. Neither is a check --
 * `@guestnote/storage` signs the upload against its own list and the GET with its own
 * disposition. Here they only filter the file picker and choose between "new tab" and "save".
 */

/** `ALLOWED_CONTENT_TYPES.image`: images, PDF and the six Office formats. */
export const BOARD_TYPES: readonly string[] = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
  'image/avif',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]

/**
 * The picker's filter. Types, not extensions: every browser maps the Office types to their
 * extensions, and a HEIC on a Mac that does not is still droppable, with the server as judge.
 */
export const BOARD_ACCEPT = BOARD_TYPES.join(',')

/** `INLINE_CONTENT_TYPES`: what the storage seam lets a browser show in place. */
export const INLINE_TYPES: readonly string[] = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
  'image/avif',
  'application/pdf',
]

/** Drawn by an `<img>`. Everything else a board holds is a document tile. */
export const isImageType = (mime: string) => mime.startsWith('image/')

/** Opens in a new tab; anything else is saved, because the GET is signed `attachment`. */
export const opensInTab = (mime: string) => INLINE_TYPES.includes(mime)
