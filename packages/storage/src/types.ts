/**
 * The shapes that cross the storage seam.
 *
 * Same rule as `packages/email/src/types.ts`: nothing here names a provider. No `S3Client`, no
 * `PutObjectCommand`, no AWS error class. `src/s3.ts` is the only file in the repository allowed
 * to import the SDK -- enforced by `biome.json` and by `packages/db/src/no-unsafe-imports.test.ts`
 * -- and that containment is only worth anything while the types stay on this side of it.
 *
 * Every field is plain data (strings, numbers, records), so a result can be returned from a
 * Server Function without a serialisation step. That is why `expiresAt` is an ISO string and not
 * a `Date`.
 */

/**
 * What a file is *for*, which decides which content types are accepted.
 *
 * Mirrors `files.kind` in spec 0003: `image` is the moodboard, `file` is the Files screen.
 * `logo` is a studio's logo (spec 0005), the one kind that belongs to no wedding.
 */
export type UploadKind = 'file' | 'image' | 'logo'

/** The two kinds that live under a wedding, and so take a `StorageScope`. */
export type WeddingUploadKind = Exclude<UploadKind, 'logo'>

/**
 * The tenant a key must live under. Both ids are UUIDs (CLAUDE.md invariant 9).
 *
 * Passed on every call rather than read from a session because this package knows nothing about
 * sessions: the caller has already run `requireWeddingAccess`, and hands over what it proved.
 */
export type StorageScope = {
  readonly orgId: string
  readonly weddingId: string
}

/**
 * The org a brand object (spec 0005: the studio logo) lives under, and nothing else.
 *
 * A separate type rather than `StorageScope` with an optional `weddingId`: an optional wedding
 * would make "forgot the wedding" and "means the brand prefix" the same value, and every wedding
 * key check would have to ask which one it was handed. As two types, a wedding call cannot be
 * made without its wedding, and a brand key cannot be built anywhere but `<org>/brand/`.
 */
export type BrandScope = {
  readonly orgId: string
}

/**
 * Why an upload was refused *before* anything was signed. Caller-facing: each one maps to a
 * sentence the planner can act on, so they are values and not exceptions.
 *
 *   - `invalidSize`      zero, negative or not an integer. An empty file is never a wanted upload.
 *   - `tooLarge`         over the configured limit.
 *   - `typeNotAllowed`   a content type outside the allow-list for this `kind`.
 *   - `unavailable`      signing itself failed: no credentials, a bad region, anything unexpected.
 *
 * Misuse by the *programmer* -- a malformed id, a key outside the scope -- is a thrown error
 * instead, because no user can cause it and swallowing it into a result would hide a bug.
 */
export type UploadFailure = 'invalidSize' | 'tooLarge' | 'typeNotAllowed' | 'unavailable'

/**
 * The kind decides the scope: a wedding kind needs the wedding, `logo` takes the org alone and
 * its key is `<org>/brand/<fileId>`. A union rather than one shape with an optional wedding, for
 * the reason `BrandScope` gives.
 */
export type UploadRequest = (
  | { readonly scope: StorageScope; readonly kind: WeddingUploadKind }
  | { readonly scope: BrandScope; readonly kind: 'logo' }
) & {
  /**
   * The `files.id` this upload becomes, UUIDv7 from `newId()`. It is also the last segment of
   * the storage key, so a row and its object can always be joined without a lookup. For a logo
   * there is no row; the id only names the object.
   */
  readonly fileId: string
  /** What the browser reports as `File.type`. Normalised, then checked against the allow-list. */
  readonly contentType: string
  /** `File.size`. Signed into the URL as the exact `Content-Length`. */
  readonly sizeBytes: number
}

export type UploadResult =
  | {
      readonly ok: true
      /** Store this in `files.storage_key`. */
      readonly key: string
      readonly url: string
      readonly method: 'PUT'
      /**
       * The headers the browser must send, verbatim. Both are part of the signature, so a
       * different value is refused by S3 rather than stored.
       */
      readonly headers: { readonly 'Content-Type': string; readonly 'Content-Length': string }
      /** ISO 8601. After this the URL is dead; ask again. */
      readonly expiresAt: string
    }
  | { readonly ok: false; readonly failure: UploadFailure; readonly detail: string }

export type DownloadRequest = {
  readonly scope: StorageScope
  /** `files.storage_key`. Checked against `scope`; a key from another tenant throws. */
  readonly key: string
  /** `files.name`. Sanitised into the `Content-Disposition` header. */
  readonly filename: string
  /**
   * `inline` lets the browser render an image or PDF in place; `attachment` forces a save.
   * Defaults to `attachment`, which is the safe direction: an uploaded file is untrusted
   * content, and a browser will not execute something it was told to download.
   */
  readonly disposition?: 'inline' | 'attachment'
}

/** A brand object's GET. Always `inline`: a logo is only ever drawn by an `<img>`. */
export type BrandDownloadRequest = {
  readonly scope: BrandScope
  /** `organizations.logo_key`. Checked against `scope`; anything but `<org>/brand/<id>` throws. */
  readonly key: string
}

/**
 * Removing a replaced or cleared logo. Brand objects only -- there is no way to name a wedding
 * key here, so no caller can delete a planner's file through this seam by mistake.
 */
export type BrandDeleteRequest = BrandDownloadRequest

export type DeleteResult = { readonly ok: true } | { readonly ok: false; readonly detail: string }

export type DownloadResult =
  | { readonly ok: true; readonly url: string; readonly expiresAt: string }
  | { readonly ok: false; readonly failure: 'unavailable'; readonly detail: string }

/** What the caller gets. Built by `createStorage()`; the transport underneath is invisible. */
export type Storage = {
  presignUpload(request: UploadRequest): Promise<UploadResult>
  presignDownload(request: DownloadRequest): Promise<DownloadResult>
  presignBrandDownload(request: BrandDownloadRequest): Promise<DownloadResult>
  deleteBrandObject(request: BrandDeleteRequest): Promise<DeleteResult>
}

/**
 * The provider seam, one level below `Storage`.
 *
 * `index.ts` does everything that is not the provider's business -- key building, the type
 * allow-list, the size limit, expiry, the disposition header -- and hands this port a finished
 * key and finished values. A transport therefore does one thing, which is sign, and swapping
 * S3 for anything else that speaks presigned URLs is one new file.
 */
export type StorageTransport = {
  readonly name: string
  presignPut(input: PresignPutInput): Promise<PresignResult>
  presignGet(input: PresignGetInput): Promise<PresignResult>
  /**
   * The one call that is not a signature: it reaches the bucket. Never throws -- a failure is a
   * value, because every caller treats a leftover object as a cost and not an error.
   */
  deleteObject(input: { readonly key: string }): Promise<DeleteResult>
}

export type PresignPutInput = {
  readonly key: string
  readonly contentType: string
  readonly contentLength: number
  readonly expiresInSeconds: number
  readonly signingDate: Date
}

export type PresignGetInput = {
  readonly key: string
  /** A finished `Content-Disposition` header value. */
  readonly contentDisposition: string
  readonly expiresInSeconds: number
  readonly signingDate: Date
}

export type PresignResult =
  | { readonly ok: true; readonly url: string }
  | { readonly ok: false; readonly detail: string }
