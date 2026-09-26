import 'server-only'
import { type Memberships, newId, principalForOrg, setLogoKey } from '@guestnote/db'
import { buildBrandKey } from '@guestnote/storage'
import { getDb } from './db.ts'
import { reportSilentFailure } from './observability.ts'
import { getStorage } from './storage.ts'
import { isUuid } from './uuid.ts'

/**
 * A studio's logo (spec 0005, "Studio logo"): sign an upload, save the key, remove it, and sign
 * the GET that draws it. The shape of `lib/wedding-files.ts` -- presigned PUT, then a confirm --
 * with no `files` row, because the key lives on `organizations.logo_key`.
 *
 * ## The caller is resolved by the Server Function, the role by this file
 *
 * Every function takes `{ memberships, orgId }` that a Server Function resolved itself (the
 * Studio page from the `gn_org` cookie through `currentCaller`, sign-up from the studio the
 * user owns). Neither is a permission: `principalForOrg` decides, here, before anything is
 * signed, and `setLogoKey` decides again before anything is written. A `member` gets
 * `forbidden` from both, so they cannot even obtain a signed PUT into the brand prefix.
 *
 * ## What the client can and cannot choose
 *
 * The confirm takes the file id alone and rebuilds the key from the caller's org, so no client
 * can point a studio's logo at another org's object -- `setLogoKey` refuses such a key as well.
 * It takes the client's word that the PUT finished, as `confirmUpload` does: a planner who
 * confirms without uploading gets a broken image, which falls back to the monogram and harms
 * nobody else.
 */

export type LogoCaller = { readonly memberships: Memberships; readonly orgId: string }

export type LogoFailure =
  | 'forbidden'
  | 'invalidSize'
  | 'tooLarge'
  | 'typeNotAllowed'
  | 'unavailable'
  | 'notFound'

export type StartLogo =
  | {
      readonly ok: true
      readonly fileId: string
      readonly url: string
      /** Verbatim, minus `Content-Length`, which a browser sets itself and refuses to be given. */
      readonly headers: Readonly<Record<string, string>>
    }
  | { readonly ok: false; readonly error: LogoFailure }

export type LogoDone = { readonly ok: true } | { readonly ok: false; readonly error: LogoFailure }

/** Step one: validate and sign. Nothing is written; a refusal leaves nothing behind. */
export async function startLogoUpload(
  caller: LogoCaller,
  input: { mime: unknown; sizeBytes: unknown },
): Promise<StartLogo> {
  if (!principalForOrg(caller.memberships, caller.orgId)) return { ok: false, error: 'forbidden' }
  if (typeof input.mime !== 'string' || typeof input.sizeBytes !== 'number') {
    return { ok: false, error: 'invalidSize' }
  }

  const fileId = newId()
  const signed = await getStorage().presignUpload({
    scope: { orgId: caller.orgId },
    fileId,
    kind: 'logo',
    contentType: input.mime,
    sizeBytes: input.sizeBytes,
  })
  if (!signed.ok) return { ok: false, error: signed.failure }

  const { 'Content-Length': _length, ...headers } = signed.headers
  return { ok: true, fileId, url: signed.url, headers }
}

/**
 * Step three: the PUT finished, so the new key is saved -- and only then is the old object
 * deleted. That order is the spec's: a failure between the two leaves an orphan object in the
 * bucket, never a studio whose logo points at nothing.
 */
export async function confirmLogo(caller: LogoCaller, fileId: unknown): Promise<LogoDone> {
  if (!isUuid(fileId)) return { ok: false, error: 'notFound' }
  return save(caller, buildBrandKey({ orgId: caller.orgId }, fileId))
}

/** Clears the logo, then deletes its object. The sidebar goes back to the monogram. */
export async function removeLogo(caller: LogoCaller): Promise<LogoDone> {
  return save(caller, null)
}

async function save(caller: LogoCaller, key: string | null): Promise<LogoDone> {
  const saved = await setLogoKey(getDb(), caller.memberships, caller.orgId, key)
  if (!saved.ok) {
    return { ok: false, error: saved.reason === 'forbidden' ? 'forbidden' : 'notFound' }
  }
  const previous = saved.value.previous
  if (previous && previous !== key) await deleteQuietly(caller.orgId, previous)
  return { ok: true }
}

/**
 * Best effort, and never the planner's problem: the new key is already saved, so a failure
 * here costs one orphaned object of at most 2 MB, reported so it can be cleaned up.
 * `deleteBrandObject` throws for a key outside `<org>/brand/` -- a row written by hand, say --
 * and that is caught for the same reason `signRow` in `wedding-files.ts` catches its throw.
 */
async function deleteQuietly(orgId: string, key: string): Promise<void> {
  try {
    const gone = await getStorage().deleteBrandObject({ scope: { orgId }, key })
    if (!gone.ok)
      reportSilentFailure('studio logo: old object not deleted', {
        orgId,
        key,
        detail: gone.detail,
      })
  } catch (error) {
    reportSilentFailure('studio logo: old key not a brand key', {
      orgId,
      key,
      error: String(error),
    })
  }
}

/**
 * A fresh 5 minute GET for a studio's logo, or `null` when there is none or it cannot be signed
 * -- the caller then draws the monogram. Signed per render (spec 0005: "Served by presigning on
 * each render"); a local HMAC, no request.
 *
 * Takes no principal because it reads nothing: the key was read by a caller that already had
 * the right to it (`studioSettings` for staff, `resolve_vendor_link` for a vendor link), and the
 * package refuses to sign a key that is not a brand object of `orgId`.
 */
export async function logoUrl(orgId: string, key: string | null): Promise<string | null> {
  if (!key) return null
  try {
    const signed = await getStorage().presignBrandDownload({ scope: { orgId }, key })
    return signed.ok ? signed.url : null
  } catch {
    return null
  }
}
