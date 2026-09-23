'use server'

import {
  addWeddingVendor,
  createVendorForWedding,
  createVendorLink,
  removeWeddingVendor,
  revokeVendorLink,
  updateWeddingVendor,
} from '@guestnote/db'
import { revalidatePath } from 'next/cache'
import { newBearerToken } from '../../../../../../lib/bearer-token.ts'
import {
  answer,
  parseId,
  parseNotes,
  parseStatus,
  parseVendorInput,
  type VendorActionResult,
} from '../../../../../../lib/vendor-input.ts'
import {
  DEFAULT_VENDOR_LINK_TTL_DAYS,
  MAX_VENDOR_LINK_TTL_DAYS,
} from '../../../../../../lib/vendor-link-token.ts'
import { currentWeddingScope } from '../../../../../../lib/wedding-scope.ts'

/**
 * One wedding's vendor list: link, create-and-link, status, notes, unlink.
 *
 * Every function resolves memberships itself and hands them to a repo function that derives
 * the principal from them -- the wedding id here is an assertion from the client, never a
 * fact. A `couple` or `editor` gets `notFound` (they have no standing on these tables), which
 * is the same answer as a wedding that does not exist.
 *
 * Adding a link reads the wedding and the vendor first; that lives in the repo
 * (`linkInTx`) so no caller can skip it. See the parent-read rule in spec 0003.
 */

const VENDORS = '/pro/vendors'
const WEDDING_VENDORS = '/pro/weddings/[id]/vendors'

function refresh(alsoDirectory = false) {
  revalidatePath(WEDDING_VENDORS, 'page')
  if (alsoDirectory) revalidatePath(VENDORS)
}

const context = currentWeddingScope

export async function addVendorToWedding(
  weddingId: unknown,
  vendorId: unknown,
): Promise<VendorActionResult> {
  const ctx = await context(weddingId)
  const vid = parseId(vendorId)
  if (!ctx) return { ok: false, error: 'notFound' }
  if (!vid) return { ok: false, error: 'invalid' }
  const r = await addWeddingVendor(ctx, vid)
  if (r.ok) refresh()
  return answer(r)
}

export async function createVendorOnWedding(
  weddingId: unknown,
  input: unknown,
): Promise<VendorActionResult> {
  const ctx = await context(weddingId)
  if (!ctx) return { ok: false, error: 'notFound' }
  const parsed = parseVendorInput(input)
  if (!parsed) return { ok: false, error: 'invalid' }
  const r = await createVendorForWedding(ctx, parsed)
  if (r.ok) refresh(true)
  return answer(r)
}

/** The row's select. Sends the status alone, so it cannot overwrite notes edited elsewhere. */
export async function setWeddingVendorStatus(
  weddingId: unknown,
  linkId: unknown,
  status: unknown,
): Promise<VendorActionResult> {
  const ctx = await context(weddingId)
  if (!ctx) return { ok: false, error: 'notFound' }
  const id = parseId(linkId)
  const s = parseStatus(status)
  if (!id || !s) return { ok: false, error: 'invalid' }
  const r = await updateWeddingVendor(ctx, id, { status: s })
  if (r.ok) refresh()
  return answer(r)
}

/** The sheet's save: status and notes together. */
export async function saveWeddingVendor(
  weddingId: unknown,
  linkId: unknown,
  status: unknown,
  notes: unknown,
): Promise<VendorActionResult> {
  const ctx = await context(weddingId)
  if (!ctx) return { ok: false, error: 'notFound' }
  const id = parseId(linkId)
  const s = parseStatus(status)
  const n = parseNotes(notes)
  if (!id || !s || !n) return { ok: false, error: 'invalid' }
  const r = await updateWeddingVendor(ctx, id, {
    status: s,
    notes: n.value,
  })
  if (r.ok) refresh()
  return answer(r)
}

export async function removeVendorFromWedding(
  weddingId: unknown,
  linkId: unknown,
): Promise<VendorActionResult> {
  const ctx = await context(weddingId)
  if (!ctx) return { ok: false, error: 'notFound' }
  const id = parseId(linkId)
  if (!id) return { ok: false, error: 'invalid' }
  const r = await removeWeddingVendor(ctx, id)
  if (r.ok) refresh()
  return answer(r)
}

/**
 * The signed link (spec 0003, S10). `createVendorLink` itself refuses anyone but owner/admin
 * (`principalForOrg`), same as every other write in this file's repo -- `context()` above only
 * narrows to "has some standing on this wedding", so a `member` reaches the repo call and is
 * turned away there, not here. The plain token is returned ONCE and never stored; the caller
 * must show it to the planner immediately and cannot ask for it again.
 */
export type CreateVendorLinkResult =
  | { readonly ok: true; readonly token: string; readonly expiresAt: string }
  | { readonly ok: false; readonly error: 'forbidden' | 'notFound' | 'invalid' }

export async function createVendorLinkAction(
  weddingId: unknown,
  wedVendorId: unknown,
  ttlDays: unknown,
): Promise<CreateVendorLinkResult> {
  const ctx = await context(weddingId)
  if (!ctx) return { ok: false, error: 'notFound' }
  const id = parseId(wedVendorId)
  if (!id) return { ok: false, error: 'invalid' }

  const days = ttlDays === undefined ? DEFAULT_VENDOR_LINK_TTL_DAYS : Number(ttlDays)
  if (!Number.isInteger(days) || days < 1 || days > MAX_VENDOR_LINK_TTL_DAYS) {
    return { ok: false, error: 'invalid' }
  }

  const { token, tokenHash } = newBearerToken()
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000)
  const r = await createVendorLink(ctx, id, {
    tokenHash,
    expiresAt,
  })
  if (!r.ok) return { ok: false, error: r.reason }
  refresh()
  return { ok: true, token, expiresAt: expiresAt.toISOString() }
}

export async function revokeVendorLinkAction(
  weddingId: unknown,
  linkId: unknown,
): Promise<{ ok: boolean }> {
  const ctx = await context(weddingId)
  if (!ctx) return { ok: false }
  const id = parseId(linkId)
  if (!id) return { ok: false }
  const gone = await revokeVendorLink(ctx, id)
  if (gone.ok) refresh()
  return { ok: gone.ok }
}
