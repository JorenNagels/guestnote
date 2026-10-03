'use server'

import { refreshVendorBoardUrls, vendorFileUrl } from '../../../../../lib/vendor-boards.ts'

/**
 * The vendor page's three Server Functions (spec 0007; `boardFileOpen` since 2026-10-04). Public -- there is no session on this page
 * -- so the token is the only credential, and each call resolves it from scratch and refuses a
 * link that is not live (`lib/vendor-boards.ts` says why that is the point). Read-only: a `link`
 * principal has no write policy anywhere (migration 0008).
 */

export async function refreshBoardImages(token: string) {
  return refreshVendorBoardUrls(token)
}

export async function boardImageDownload(token: string, fileId: string) {
  return vendorFileUrl(token, fileId, 'attachment')
}

/** Opening a PDF (or an image) from the board in a new tab: the same lookup, signed `inline`. */
export async function boardFileOpen(token: string, fileId: string) {
  return vendorFileUrl(token, fileId, 'inline')
}
