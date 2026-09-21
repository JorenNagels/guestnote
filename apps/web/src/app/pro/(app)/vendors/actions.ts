'use server'

import {
  archiveVendor,
  createVendor,
  updateVendor,
  type VendorWriteResult,
  vendorDirectoryAccess,
} from '@guestnote/db'
import { revalidatePath } from 'next/cache'
import { getDb } from '../../../../lib/db.ts'
import { currentMemberships, currentOrgId } from '../../../../lib/principal.ts'
import { parseId, parseVendorInput, type VendorActionResult } from '../../../../lib/vendor-input.ts'

/**
 * The org vendor directory's writes. Each does its own authorization (a Server Function is a
 * POST to its own route, so the layout's session gate never runs for it -- invariant 7).
 *
 * The write check is stated three times on purpose and they are not redundant: `canWrite`
 * here answers before any query and gives the form a `forbidden` to show; the repo functions
 * take `principalForOrg`, which is owner/admin only, so there is no path that reaches a write
 * with a member's principal; and the `vendors` policies refuse it in SQL. A member editing the
 * org's directory is the failure a tenancy audit named on 2026-09-21, so no single layer is
 * allowed to be the only one.
 *
 * Revalidates both trees: the directory feeds each wedding's picker.
 */

const VENDORS = '/pro/vendors'
const WEDDING_VENDORS = '/pro/weddings/[id]/vendors'

function refresh() {
  revalidatePath(VENDORS)
  revalidatePath(WEDDING_VENDORS, 'page')
}

async function writer() {
  const [m, orgId] = await Promise.all([currentMemberships(), currentOrgId()])
  if (!m || !orgId) return null
  if (!vendorDirectoryAccess(m, orgId)?.canWrite) return null
  return { m, orgId }
}

function answer(r: VendorWriteResult<unknown>): VendorActionResult {
  return r.ok ? { ok: true } : { ok: false, error: r.reason }
}

export async function createDirectoryVendor(input: unknown): Promise<VendorActionResult> {
  const ctx = await writer()
  if (!ctx) return { ok: false, error: 'forbidden' }
  const parsed = parseVendorInput(input)
  if (!parsed) return { ok: false, error: 'invalid' }
  const r = await createVendor(getDb(), ctx.m, ctx.orgId, parsed)
  if (r.ok) refresh()
  return answer(r)
}

export async function updateDirectoryVendor(
  vendorId: unknown,
  input: unknown,
): Promise<VendorActionResult> {
  const ctx = await writer()
  if (!ctx) return { ok: false, error: 'forbidden' }
  const id = parseId(vendorId)
  const parsed = parseVendorInput(input)
  if (!id || !parsed) return { ok: false, error: 'invalid' }
  const r = await updateVendor(getDb(), ctx.m, ctx.orgId, id, parsed)
  if (r.ok) refresh()
  return answer(r)
}

export async function archiveDirectoryVendor(vendorId: unknown): Promise<VendorActionResult> {
  const ctx = await writer()
  if (!ctx) return { ok: false, error: 'forbidden' }
  const id = parseId(vendorId)
  if (!id) return { ok: false, error: 'invalid' }
  const r = await archiveVendor(getDb(), ctx.m, ctx.orgId, id)
  if (r.ok) refresh()
  return answer(r)
}
