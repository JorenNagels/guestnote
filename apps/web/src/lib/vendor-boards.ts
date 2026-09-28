import 'server-only'
import {
  listSharedBoards,
  resolveVendorLinkByHash,
  type SharedBoard,
  type VendorLinkLookup,
} from '@guestnote/db'
import { hashBearerToken } from './bearer-token.ts'
import { getDb } from './db.ts'
import { signObject } from './wedding-files.ts'

/**
 * The moodboards a vendor sees on their link page (spec 0007), and the two things the page asks
 * for again later: fresh image URLs, and one image's download.
 *
 * ## Why images are re-signed on request rather than signed for longer
 *
 * The page signs every image at render for five minutes, as the planner's board does. A
 * photographer keeps the page open all day, so when a tile fails to load the browser calls the
 * `refreshBoardImages` Server Function (which wraps `refreshVendorBoardUrls`) with the link's own
 * token, and gets fresh URLs. That call resolves the
 * token again, from scratch, every time -- `tenant.ts` says a `link` principal must never outlive
 * one request, because nothing under RLS re-checks revocation. So a revoked link gets nothing
 * back, and its images stop within five minutes. Rejected: a 12-hour URL (spec 0007 records it
 * being chosen and dropped the same day) -- `packages/storage/src/limits.ts` notes a presigned URL
 * dies with the Lambda role's temporary credentials anyway, and one copied URL would outlive a
 * revocation by hours. Rejected: a proxy route streaming each image, for the
 * reason `components/files/SPEC.md` (S5) gives.
 *
 * ## The token is the whole credential
 *
 * No session, no cookie. Every function here takes the token, hashes it, and refuses anything
 * but `live` -- the same single `if` the page makes -- before a principal exists.
 */

export type VendorImage = {
  readonly id: string
  readonly name: string
  /** Inline, five minutes; `null` when signing failed and the tile shows its fallback. */
  readonly url: string | null
}
export type VendorBoard = {
  readonly id: string
  readonly name: string
  readonly images: readonly VendorImage[]
}

// A bearer token is 43 base64url characters (`bearer-token.ts`); anything far longer is not one,
// and is refused before it is hashed.
const TOKEN_MAX = 200

export async function liveVendorLink(token: unknown): Promise<VendorLinkLookup | null> {
  if (typeof token !== 'string' || token.length === 0 || token.length > TOKEN_MAX) return null
  const lookup = await resolveVendorLinkByHash(getDb(), hashBearerToken(token))
  return lookup?.status === 'live' ? lookup : null
}

function principalOf(lookup: VendorLinkLookup) {
  return {
    kind: 'link' as const,
    orgId: lookup.orgId,
    weddingId: lookup.weddingId,
    weddingVendorId: lookup.weddingVendorId,
  }
}

async function shared(lookup: VendorLinkLookup): Promise<SharedBoard[]> {
  return listSharedBoards(getDb(), principalOf(lookup))
}

/** For the page, whose own `if` already established the link is live. */
export async function vendorBoards(lookup: VendorLinkLookup): Promise<VendorBoard[]> {
  const boards = await shared(lookup)
  const scope = { orgId: lookup.orgId, weddingId: lookup.weddingId }
  return Promise.all(
    boards.map(async (b) => ({
      id: b.id,
      name: b.name,
      images: await Promise.all(
        b.images.map(async (i) => ({
          id: i.id,
          name: i.name,
          url: await signObject(scope, i, 'inline'),
        })),
      ),
    })),
  )
}

/**
 * Fresh inline URLs for every image the link can still see, by file id. `null` for a link that
 * is no longer live -- the page then leaves its tiles on their fallback. An image unshared or
 * deleted since the page rendered is simply absent.
 */
export async function refreshVendorBoardUrls(
  token: unknown,
): Promise<Readonly<Record<string, string>> | null> {
  const lookup = await liveVendorLink(token)
  if (!lookup) return null
  const urls: Record<string, string> = {}
  for (const board of await vendorBoards(lookup)) {
    for (const image of board.images) if (image.url) urls[image.id] = image.url
  }
  return urls
}

/** One image as a download (`attachment`), if the link can still see it. */
export async function vendorImageDownloadUrl(
  token: unknown,
  fileId: unknown,
): Promise<string | null> {
  if (typeof fileId !== 'string') return null
  const lookup = await liveVendorLink(token)
  if (!lookup) return null
  const image = (await shared(lookup)).flatMap((b) => b.images).find((i) => i.id === fileId)
  if (!image) return null
  return signObject({ orgId: lookup.orgId, weddingId: lookup.weddingId }, image, 'attachment')
}
