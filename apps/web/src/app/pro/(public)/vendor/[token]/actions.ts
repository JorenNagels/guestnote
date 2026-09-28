'use server'

import { refreshVendorBoardUrls, vendorImageDownloadUrl } from '../../../../../lib/vendor-boards.ts'

/**
 * The vendor page's two Server Functions (spec 0007). Public -- there is no session on this page
 * -- so the token is the only credential, and each call resolves it from scratch and refuses a
 * link that is not live (`lib/vendor-boards.ts` says why that is the point). Read-only: a `link`
 * principal has no write policy anywhere (migration 0008).
 */

export async function refreshBoardImages(token: string) {
  return refreshVendorBoardUrls(token)
}

export async function boardImageDownload(token: string, fileId: string) {
  return vendorImageDownloadUrl(token, fileId)
}
