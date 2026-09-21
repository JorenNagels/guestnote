'use server'

import {
  addWeddingVendor,
  createVendorForWedding,
  removeWeddingVendor,
  updateWeddingVendor,
  type VendorWriteResult,
} from '@guestnote/db'
import { revalidatePath } from 'next/cache'
import { getDb } from '../../../../../../lib/db.ts'
import { currentMemberships, currentOrgId } from '../../../../../../lib/principal.ts'
import {
  parseId,
  parseNotes,
  parseStatus,
  parseVendorInput,
  type VendorActionResult,
} from '../../../../../../lib/vendor-input.ts'

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

async function context(weddingId: unknown) {
  const [m, orgId] = await Promise.all([currentMemberships(), currentOrgId()])
  const wid = parseId(weddingId)
  if (!m || !orgId || !wid) return null
  return { m, orgId, weddingId: wid }
}

function answer(r: VendorWriteResult<unknown>): VendorActionResult {
  return r.ok ? { ok: true } : { ok: false, error: r.reason }
}

export async function addVendorToWedding(
  weddingId: unknown,
  vendorId: unknown,
): Promise<VendorActionResult> {
  const ctx = await context(weddingId)
  const vid = parseId(vendorId)
  if (!ctx) return { ok: false, error: 'notFound' }
  if (!vid) return { ok: false, error: 'invalid' }
  const r = await addWeddingVendor(getDb(), ctx.m, ctx.orgId, ctx.weddingId, vid)
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
  const r = await createVendorForWedding(getDb(), ctx.m, ctx.orgId, ctx.weddingId, parsed)
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
  const r = await updateWeddingVendor(getDb(), ctx.m, ctx.orgId, ctx.weddingId, id, { status: s })
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
  const r = await updateWeddingVendor(getDb(), ctx.m, ctx.orgId, ctx.weddingId, id, {
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
  const r = await removeWeddingVendor(getDb(), ctx.m, ctx.orgId, ctx.weddingId, id)
  if (r.ok) refresh()
  return answer(r)
}
