import { assertKeyInScope, buildObjectKey, contentDisposition } from './keys.ts'
import {
  ALLOWED_CONTENT_TYPES,
  DEFAULT_MAX_BYTES,
  normaliseContentType,
  PRESIGN_EXPIRES_SECONDS,
} from './limits.ts'
import type {
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

export { assertKeyInScope, buildObjectKey } from './keys.ts'
export { ALLOWED_CONTENT_TYPES, DEFAULT_MAX_BYTES, PRESIGN_EXPIRES_SECONDS } from './limits.ts'
export type { S3TransportConfig } from './s3.ts'
export { createS3Transport } from './s3.ts'
export type {
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
      const key = buildObjectKey(request.scope, request.fileId)

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
      if (request.sizeBytes > maxBytes) {
        return {
          ok: false,
          failure: 'tooLarge',
          detail: `${request.sizeBytes} bytes is over the ${maxBytes} byte limit`,
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
  }
}
