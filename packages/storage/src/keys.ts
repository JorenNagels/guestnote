import type { BrandScope, StorageScope } from './types.ts'

/**
 * Object keys and the `Content-Disposition` header. Pure string work, no SDK, so it is tested
 * without a client and readable without one.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function assertUuid(value: string, what: string): string {
  // Thrown, not returned: no user can cause this. The ids come from a session and from
  // `newId()`, so a malformed one is a bug in the caller, and turning it into a result would
  // let a bug read as a "file rejected" message.
  if (!UUID.test(value)) {
    throw new Error(`@guestnote/storage: ${what} must be a UUID, got ${JSON.stringify(value)}`)
  }
  return value.toLowerCase()
}

/**
 * `<orgId>/<weddingId>/<fileId>`, and nothing else.
 *
 * **No part of the key is user-controlled.** The original filename lives in `files.name` and
 * reaches a browser only through `Content-Disposition`. That makes a traversal, a double slash, a
 * key that collides with another tenant's, or a name that is illegal in S3 unrepresentable
 * rather than sanitised -- the alternative, `<...>/<fileId>/<name>`, is friendlier in a bucket
 * browser and needs a sanitiser that has to be right forever.
 *
 * The org and wedding prefix is there so an operator can list or delete one tenant's objects, and
 * so `assertKeyInScope` has something to check. It is *not* an access control: the URL is.
 * Access is decided by the Server Function that decides to mint one.
 */
export function buildObjectKey(scope: StorageScope, fileId: string): string {
  const org = assertUuid(scope.orgId, 'scope.orgId')
  const wedding = assertUuid(scope.weddingId, 'scope.weddingId')
  const file = assertUuid(fileId, 'fileId')
  return `${org}/${wedding}/${file}`
}

/**
 * Throws unless `key` is exactly one object under `scope`.
 *
 * Belt for a download: a `files` row is already RLS-scoped, so a key from another tenant should
 * be unreachable, and this is the second check for the day it is not. The pattern is the whole
 * key rather than a `startsWith`, so `<org>/<wedding>/../<other-org>/<x>` and a trailing
 * `/anything` both fail.
 */
export function assertKeyInScope(scope: StorageScope, key: string): void {
  const org = assertUuid(scope.orgId, 'scope.orgId')
  const wedding = assertUuid(scope.weddingId, 'scope.weddingId')
  const [o, w, f, ...rest] = key.split('/')
  if (rest.length > 0 || o !== org || w !== wedding || f === undefined || !UUID.test(f)) {
    throw new Error(
      `@guestnote/storage: key ${JSON.stringify(key)} is not an object of org ${org} and wedding ${wedding}`,
    )
  }
}

/**
 * The literal middle segment of a brand key. Not a UUID, so a brand key and a wedding key can
 * never be the same string: `<org>/brand/<id>` fails `assertKeyInScope` for every wedding, and
 * `<org>/<wedding>/<id>` fails `assertBrandKeyInScope` for every org.
 */
export const BRAND_SEGMENT = 'brand'

/**
 * `<orgId>/brand/<fileId>` -- a studio's logo (spec 0005, "Studio logo").
 *
 * A sibling of the org's wedding prefixes rather than a `files` row, because `files.wedding_id`
 * is NOT NULL and a logo belongs to no wedding. Every rule `buildObjectKey` states holds here
 * too: no part of the key is user-controlled, and the prefix is for an operator, not access.
 */
export function buildBrandKey(scope: BrandScope, fileId: string): string {
  const org = assertUuid(scope.orgId, 'scope.orgId')
  const file = assertUuid(fileId, 'fileId')
  return `${org}/${BRAND_SEGMENT}/${file}`
}

/**
 * Throws unless `key` is exactly one brand object of `scope`'s org.
 *
 * The same whole-key match as `assertKeyInScope`, for the same reason. It guards the GET that
 * draws a logo and the DELETE that removes a replaced one -- the second is the only call in this
 * package that destroys anything, so a key from another org, or a wedding file of this one,
 * must not get that far.
 */
export function assertBrandKeyInScope(scope: BrandScope, key: string): void {
  const org = assertUuid(scope.orgId, 'scope.orgId')
  const [o, b, f, ...rest] = key.split('/')
  if (rest.length > 0 || o !== org || b !== BRAND_SEGMENT || f === undefined || !UUID.test(f)) {
    throw new Error(
      `@guestnote/storage: key ${JSON.stringify(key)} is not a brand object of org ${org}`,
    )
  }
}

/**
 * A `Content-Disposition` value that survives any filename.
 *
 * RFC 6266 wants two parameters: a quoted ASCII `filename` for old clients and an RFC 5987
 * `filename*` for the real name. Belgian filenames carry accents and apostrophes ("Facture
 * traiteur - mariage d'Élodie.pdf"), and a header built by interpolation would either mangle
 * them or, worse, let a quote or a newline end the header and start another.
 *
 * Control characters and path separators are dropped first, because they are never wanted in a
 * download name and `\r\n` is header injection.
 */
export function contentDisposition(disposition: 'inline' | 'attachment', filename: string): string {
  const cleaned =
    filename
      // biome-ignore lint/suspicious/noControlCharactersInRegex: stripping them is the point
      .replace(/[\u0000-\u001f\u007f]/g, '')
      .replace(/[\\/]/g, '_')
      .trim()
      .slice(0, 200) || 'file'
  const ascii = cleaned.replace(/[^A-Za-z0-9._ -]/g, '_')
  // encodeURIComponent leaves ' ( ) * alone, which RFC 5987's `attr-char` does not permit.
  const encoded = encodeURIComponent(cleaned).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  )
  return `${disposition}; filename="${ascii}"; filename*=UTF-8''${encoded}`
}
