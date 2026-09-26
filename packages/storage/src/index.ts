import {
  assertBrandKeyInScope,
  assertKeyInScope,
  buildBrandKey,
  buildObjectKey,
  contentDisposition,
} from './keys.ts'
import {
  ALLOWED_CONTENT_TYPES,
  DEFAULT_MAX_BYTES,
  LOGO_MAX_BYTES,
  normaliseContentType,
  PRESIGN_EXPIRES_SECONDS,
} from './limits.ts'
import type {
  BrandDeleteRequest,
  BrandDownloadRequest,
  DeleteResult,
  DownloadRequest,
  DownloadResult,
  Storage,
  StorageTransport,
  UploadRequest,
  UploadResult,
} from './types.ts'

/**
 * `@guestnote/storage` -- presigned upload and download for the private files bucket.
 *
 * The public surface is deliberately small: `createStorage`, the transport factory, the types
 * and the limits. `S3Client` and every AWS type stay behind `./s3.ts`.
 */

export {
  assertBrandKeyInScope,
  assertKeyInScope,
  BRAND_SEGMENT,
  buildBrandKey,
  buildObjectKey,
} from './keys.ts'
export {
  ALLOWED_CONTENT_TYPES,
  DEFAULT_MAX_BYTES,
  LOGO_MAX_BYTES,
  PRESIGN_EXPIRES_SECONDS,
} from './limits.ts'
export type { S3TransportConfig } from './s3.ts'
export { createS3Transport } from './s3.ts'
export type {
  BrandDeleteRequest,
  BrandDownloadRequest,
  BrandScope,
  DeleteResult,
  DownloadRequest,
  DownloadResult,
  Storage,
  StorageScope,
  StorageTransport,
  UploadFailure,
  UploadKind,
  UploadRequest,
  UploadResult,
} from './types.ts'

export type StorageConfig = {
  readonly transport: StorageTransport
  /** Bytes. Defaults to `DEFAULT_MAX_BYTES`. */
  readonly maxBytes?: number
  /** Injected by tests, so an expiry can be asserted without a fake clock. */
  readonly now?: () => Date
}

export function createStorage(config: StorageConfig): Storage {
  const maxBytes = config.maxBytes ?? DEFAULT_MAX_BYTES
  const now = config.now ?? (() => new Date())

  // At construction, not at first use: a zero or NaN limit would otherwise be a working
  // storage that refuses every upload, which looks exactly like a broken bucket.
  if (!Number.isInteger(maxBytes) || maxBytes <= 0) {
    throw new Error(`@guestnote/storage: maxBytes must be a positive integer, got ${maxBytes}`)
  }

  const expiry = (at: Date) => new Date(at.getTime() + PRESIGN_EXPIRES_SECONDS * 1000).toISOString()

  return {
    async presignUpload(request: UploadRequest): Promise<UploadResult> {
      // The key first, and it throws on a malformed id. That ordering is deliberate: a
      // programmer's mistake should surface as a mistake, not as whichever user-facing
      // refusal happens to come first.
      const key =
        request.kind === 'logo'
          ? buildBrandKey(request.scope, request.fileId)
          : buildObjectKey(request.scope, request.fileId)
      const limit = request.kind === 'logo' ? Math.min(maxBytes, LOGO_MAX_BYTES) : maxBytes

      const contentType = normaliseContentType(request.contentType)
      if (!ALLOWED_CONTENT_TYPES[request.kind].includes(contentType)) {
        return {
          ok: false,
          failure: 'typeNotAllowed',
          detail: `${contentType || '(none)'} is not accepted for kind ${request.kind}`,
        }
      }

      if (!Number.isInteger(request.sizeBytes) || request.sizeBytes <= 0) {
        return {
          ok: false,
          failure: 'invalidSize',
          detail: `size must be a positive whole number of bytes, got ${request.sizeBytes}`,
        }
      }
      if (request.sizeBytes > limit) {
        return {
          ok: false,
          failure: 'tooLarge',
          detail: `${request.sizeBytes} bytes is over the ${limit} byte limit`,
        }
      }

      const signingDate = now()
      const signed = await config.transport.presignPut({
        key,
        contentType,
        contentLength: request.sizeBytes,
        expiresInSeconds: PRESIGN_EXPIRES_SECONDS,
        signingDate,
      })
      if (!signed.ok) return { ok: false, failure: 'unavailable', detail: signed.detail }

      return {
        ok: true,
        key,
        url: signed.url,
        method: 'PUT',
        headers: { 'Content-Type': contentType, 'Content-Length': String(request.sizeBytes) },
        expiresAt: expiry(signingDate),
      }
    },

    async presignDownload(request: DownloadRequest): Promise<DownloadResult> {
      assertKeyInScope(request.scope, request.key)

      const signingDate = now()
      const signed = await config.transport.presignGet({
        key: request.key,
        contentDisposition: contentDisposition(
          request.disposition ?? 'attachment',
          request.filename,
        ),
        expiresInSeconds: PRESIGN_EXPIRES_SECONDS,
        signingDate,
      })
      if (!signed.ok) return { ok: false, failure: 'unavailable', detail: signed.detail }

      return { ok: true, url: signed.url, expiresAt: expiry(signingDate) }
    },

    async presignBrandDownload(request: BrandDownloadRequest): Promise<DownloadResult> {
      assertBrandKeyInScope(request.scope, request.key)

      const signingDate = now()
      const signed = await config.transport.presignGet({
        key: request.key,
        // `inline` so an `<img>` draws it. Safe here where it would not be for any upload,
        // because the allow-list for `logo` holds raster images only -- no SVG, no HTML.
        contentDisposition: contentDisposition('inline', 'logo'),
        expiresInSeconds: PRESIGN_EXPIRES_SECONDS,
        signingDate,
      })
      if (!signed.ok) return { ok: false, failure: 'unavailable', detail: signed.detail }

      return { ok: true, url: signed.url, expiresAt: expiry(signingDate) }
    },

    async deleteBrandObject(request: BrandDeleteRequest): Promise<DeleteResult> {
      // Thrown, like every scope check: the key came from `organizations.logo_key`, which
      // `setLogoKey` only ever fills with this org's brand keys, so a mismatch is a bug.
      assertBrandKeyInScope(request.scope, request.key)
      return config.transport.deleteObject({ key: request.key })
    },
  }
}
