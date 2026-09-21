import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import type { PresignGetInput, PresignPutInput, PresignResult, StorageTransport } from './types.ts'

/**
 * **The only file in this repository allowed to import the AWS S3 SDK.**
 *
 * `biome.json` restricts `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` to this path,
 * and `packages/db/src/no-unsafe-imports.test.ts` enforces the same rule independently -- a lint
 * rule can be silenced with an inline comment, a test cannot. Same arrangement as
 * `packages/email/src/ses.ts`, for the same two reasons: a provider swap should be one new file,
 * and the SDK must not be dragged into a bundle by a stray import (`packages/storage/README.md`
 * has the measured size).
 *
 * Everything below returns `PresignResult`, which names no AWS type.
 *
 * ## Configuration is arguments, never `process.env`
 *
 * CLAUDE.md invariant 6. `apps/web/src/lib/storage.ts` is the one composition point and the only
 * place that knows a bucket name or a region.
 *
 * ## Signing is offline
 *
 * Presigning is a local HMAC over the request. Nothing here makes a network call, so nothing
 * here can be slow or hit S3's rate limits, and `s3.test.ts` runs the real presigner with a
 * fake key instead of mocking it. The one thing that can fail is credential resolution.
 */

export type S3TransportConfig = {
  /** `eu-central-1`. The bucket lives there (`sst.config.ts`); a wrong region signs a URL S3 refuses. */
  readonly region: string
  /** The private files bucket. `sst.config.ts` creates it and passes the name in as an env var. */
  readonly bucket: string
  /**
   * Static credentials, for tests and for a laptop. **Leave unset in a deployed environment**:
   * the SDK then resolves the Lambda role through its default chain, which is what keeps a key
   * out of the repo and out of SSM. Plain fields rather than the SDK's credentials type, so no
   * AWS type appears in the config.
   */
  readonly credentials?: { readonly accessKeyId: string; readonly secretAccessKey: string }
}

export function createS3Transport(config: S3TransportConfig): StorageTransport {
  /**
   * Built once per module instance; `lib/storage.ts` memoises it, for the reason `getDb()` and
   * `lib/mailer.ts` do -- a warm Lambda then reuses one resolved credential chain.
   *
   * **Both checksum options are load-bearing, and both were measured (SDK 3.1113.0,
   * 2026-09-21).** The SDK's default `requestChecksumCalculation: 'WHEN_SUPPORTED'` puts
   * `x-amz-checksum-crc32=AAAAAA==` and `x-amz-sdk-checksum-algorithm=CRC32` into a presigned
   * PUT's query string. `AAAAAA==` is the CRC32 of an *empty* body, because the presigner never
   * sees the file, so S3 compares it against the real upload and answers `BadDigest` -- a URL
   * that signs and validates and then fails every real upload. `WHEN_REQUIRED` removes both
   * parameters; `responseChecksumValidation` does the same for `x-amz-checksum-mode` on the GET.
   * Integrity is still covered: HTTPS in transit, and S3 verifies its own storage.
   */
  const client = new S3Client({
    region: config.region,
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
    ...(config.credentials ? { credentials: config.credentials } : {}),
  })

  return {
    name: 's3',

    async presignPut(input: PresignPutInput): Promise<PresignResult> {
      try {
        const url = await getSignedUrl(
          client,
          new PutObjectCommand({
            Bucket: config.bucket,
            Key: input.key,
            ContentType: input.contentType,
            // Signed as the exact length. A presigned PUT has no "at most N" -- that is only
            // POST policies' `content-length-range` -- so the limit is enforced by refusing to
            // sign a declared size over it, and S3 then refuses a body of any other size.
            ContentLength: input.contentLength,
          }),
          {
            expiresIn: input.expiresInSeconds,
            signingDate: input.signingDate,
            // Measured, same date: by default the presigner signs `content-length;host` and
            // NOT `content-type`, so a URL minted for image/png would happily store an
            // HTML file. Naming it here puts it in `X-Amz-SignedHeaders`, and S3 then refuses
            // any other value.
            signableHeaders: new Set(['content-type']),
          },
        )
        return { ok: true, url }
      } catch (error) {
        return { ok: false, detail: describe(error) }
      }
    },

    async presignGet(input: PresignGetInput): Promise<PresignResult> {
      try {
        const url = await getSignedUrl(
          client,
          new GetObjectCommand({
            Bucket: config.bucket,
            Key: input.key,
            // Overrides the header S3 answers with, per request. It is part of the signed
            // query, so the holder of the URL cannot swap `attachment` for `inline`.
            ResponseContentDisposition: input.contentDisposition,
          }),
          { expiresIn: input.expiresInSeconds, signingDate: input.signingDate },
        )
        return { ok: true, url }
      } catch (error) {
        return { ok: false, detail: describe(error) }
      }
    },
  }
}

/** A one-line description safe to put in a log. Never includes a URL, which is a credential. */
function describe(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`
  return String(error)
}
