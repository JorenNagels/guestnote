import { and, asc, eq, gt, isNull, sql } from 'drizzle-orm'
import type { Db } from '../client.ts'
import { newId } from '../id.ts'
import {
  vendorLinks,
  vendors,
  type WEDDING_VENDOR_STATUSES,
  weddingVendors,
} from '../schema/vendors.ts'
import { weddings } from '../schema/weddings.ts'
import { type Principal, type TenantDb, withTenant } from '../tenant.ts'
import { type Memberships, principalForOrg, principalForWedding } from './memberships.ts'

/**
 * Slice S3 of docs/specs/0003-planner-app-screens.md: the org's vendor directory (`vendors`)
 * and the per-wedding link (`wedding_vendors`).
 *
 * ## Two tables, two kinds of principal
 *
 * `vendors` carries `org_id` and no `wedding_id`, and its policies (0006) admit owner and admin
 * to read and write and `member` to read. So the directory never asks for a wedding, but a
 * `member` has no org-wide principal (`principalForOrg` refuses one, on purpose), and
 * `withTenant` will not run an `assignedStaff` principal unpinned. A member therefore reads the
 * directory through ONE of their assigned weddings -- the pin narrows nothing on this table, it
 * only satisfies `assertScoped`. Rejected: a second principal kind for "org-wide read", which
 * is a tenancy-model change for one screen.
 *
 * `wedding_vendors` is wedding-scoped like every other planner table, so a member reaches it
 * through the wedding they are pinned to and an owner or admin through the org-wide principal.
 *
 * ## Parent-read rule (spec 0003, "Shared rules")
 *
 * Foreign keys here are plain, and referential-integrity checks bypass RLS, so the FK is
 * satisfied by a vendor or a wedding the caller cannot read. Every insert of a link therefore
 * reads both parents under the same transaction and refuses if either is missing. RLS is the
 * belt; this is the braces, and for `weddings` it is the ONLY guard on the org-wide path: an
 * owner's policy admits any `wedding_id` as long as `org_id` matches, so without the read a
 * link could name another organisation's wedding.
 */

export type WeddingVendorStatus = (typeof WEDDING_VENDOR_STATUSES)[number]

export type VendorInput = {
  readonly name: string
  readonly category: string
  readonly email: string | null
  readonly phone: string | null
  readonly notes: string | null
}

export type VendorRow = VendorInput & { readonly id: string }

export type WeddingVendorRow = {
  /** The link's id, i.e. `wedding_vendors.id`. */
  readonly id: string
  readonly vendorId: string
  readonly name: string
  readonly category: string
  readonly email: string | null
  readonly phone: string | null
  readonly status: WeddingVendorStatus
  readonly notes: string | null
  /**
   * The live `vendor_links` row for this vendor, if any (spec 0003, S10). `null` both when
   * none exists and when the caller cannot see `vendor_links` at all -- its own policy is
   * owner/admin only (0006), so a `member` reading this list always gets `null` here even if
   * a link exists. That is not a leak: the "create link" UI this field feeds is itself gated
   * on `canCreate`, which is the same owner/admin test, so a `member` never sees a control
   * this field could make say the wrong thing.
   */
  readonly activeLink: { readonly id: string; readonly expiresAt: Date } | null
}

export type VendorWriteResult<T = null> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: 'forbidden' | 'notFound' | 'duplicate' }

const FORBIDDEN = { ok: false, reason: 'forbidden' } as const
const NOT_FOUND = { ok: false, reason: 'notFound' } as const
const DUPLICATE = { ok: false, reason: 'duplicate' } as const

const VENDOR_COLUMNS = {
  id: vendors.id,
  name: vendors.name,
  category: vendors.category,
  email: vendors.email,
  phone: vendors.phone,
  notes: vendors.notes,
}

/**
 * Who may touch the directory, and whether they may write it.
 *
 * `null` means no standing at all: not in the org, or a `member` assigned to no wedding (who
 * has nothing to be pinned to). The page renders that as a 404. `canWrite` is the SAME test
 * the policies apply (`owner` or `admin`), stated here so an action can refuse before it
 * reaches the database and the UI can hide a button; it is not a substitute for RLS.
 */
export function vendorDirectoryAccess(
  m: Memberships,
  orgId: string,
): { readonly principal: Principal; readonly canWrite: boolean } | null {
  const orgWide = principalForOrg(m, orgId)
  if (orgWide) return { principal: orgWide, canWrite: true }

  for (const w of m.weddings) {
    const pinned = principalForWedding(m, orgId, w.weddingId)
    if (pinned?.kind === 'assignedStaff') return { principal: pinned, canWrite: false }
  }
  return null
}

/**
 * The principal for one wedding's vendor list, or `null`.
 *
 * `weddingMember` (couple, editor) is refused here and not left to RLS: none of the new
 * tables is readable by them until the couple spec lands, so letting the query run would
 * return an empty list and render a screen that looks like "this wedding has no vendors".
 * A 404 is the honest answer.
 */
export function weddingVendorPrincipal(
  m: Memberships,
  orgId: string,
  weddingId: string,
): Principal | null {
  const p = principalForOrg(m, orgId) ?? principalForWedding(m, orgId, weddingId)
  if (!p || p.kind === 'weddingMember') return null
  return p
}

function isUniqueViolation(e: unknown): boolean {
  let cur: unknown = e
  for (let depth = 0; depth < 4 && typeof cur === 'object' && cur !== null; depth++) {
    if ('code' in cur && cur.code === '23505') return true
    cur = 'cause' in cur ? cur.cause : null
  }
  return false
}

/** The whole directory, alphabetical and case-insensitive, or `null` for no standing. */
export async function listVendors(
  db: Db,
  m: Memberships,
  orgId: string,
): Promise<{ vendors: VendorRow[]; canWrite: boolean } | null> {
  const access = vendorDirectoryAccess(m, orgId)
  if (!access) return null
  const rows = await withTenant(db, access.principal, async (tx) =>
    tx
      .select(VENDOR_COLUMNS)
      .from(vendors)
      .where(isNull(vendors.deletedAt))
      .orderBy(asc(sql`lower(${vendors.name})`), asc(vendors.id)),
  )
  return { vendors: rows, canWrite: access.canWrite }
}

export async function createVendor(
  db: Db,
  m: Memberships,
  orgId: string,
  input: VendorInput,
): Promise<VendorWriteResult<{ id: string }>> {
  // `principalForOrg` is owner/admin only, so a member cannot get a principal here at all.
  const principal = principalForOrg(m, orgId)
  if (!principal) return FORBIDDEN
  const id = newId()
  await withTenant(db, principal, async (tx) => {
    await tx.insert(vendors).values({ id, orgId, ...input })
  })
  return { ok: true, value: { id } }
}

export async function updateVendor(
  db: Db,
  m: Memberships,
  orgId: string,
  vendorId: string,
  input: VendorInput,
): Promise<VendorWriteResult> {
  const principal = principalForOrg(m, orgId)
  if (!principal) return FORBIDDEN
  const changed = await withTenant(db, principal, async (tx) =>
    tx
      .update(vendors)
      .set({ ...input, updatedAt: new Date() })
      .where(and(eq(vendors.id, vendorId), eq(vendors.orgId, orgId), isNull(vendors.deletedAt)))
      .returning({ id: vendors.id }),
  )
  return changed.length === 0 ? NOT_FOUND : { ok: true, value: null }
}

/**
 * Soft delete. `wedding_vendors.vendor_id` is `restrict`, and the schema's stated policy is
 * that a directory entry is archived and never dropped, so a wedding's history stays readable.
 */
export async function archiveVendor(
  db: Db,
  m: Memberships,
  orgId: string,
  vendorId: string,
): Promise<VendorWriteResult> {
  const principal = principalForOrg(m, orgId)
  if (!principal) return FORBIDDEN
  const now = new Date()
  const changed = await withTenant(db, principal, async (tx) =>
    tx
      .update(vendors)
      .set({ deletedAt: now, updatedAt: now })
      .where(and(eq(vendors.id, vendorId), eq(vendors.orgId, orgId), isNull(vendors.deletedAt)))
      .returning({ id: vendors.id }),
  )
  return changed.length === 0 ? NOT_FOUND : { ok: true, value: null }
}

/**
 * Everything the wedding's vendor screen needs, in one transaction: the linked vendors, the
 * directory to pick from, and whether this user may create a directory vendor.
 *
 * Archived vendors still appear on a wedding that linked them (the join does not filter
 * `vendors.deleted_at`) and are absent from the picker (`directory` does).
 */
export async function getWeddingVendors(
  db: Db,
  m: Memberships,
  orgId: string,
  weddingId: string,
): Promise<{ linked: WeddingVendorRow[]; directory: VendorRow[]; canCreate: boolean } | null> {
  const principal = weddingVendorPrincipal(m, orgId, weddingId)
  if (!principal) return null

  return withTenant(db, principal, async (tx) => {
    const wedding = await tx
      .select({ id: weddings.id })
      .from(weddings)
      .where(and(eq(weddings.id, weddingId), isNull(weddings.deletedAt)))
    if (wedding.length === 0) return null

    const linked = await tx
      .select({
        id: weddingVendors.id,
        vendorId: weddingVendors.vendorId,
        name: vendors.name,
        category: vendors.category,
        email: vendors.email,
        phone: vendors.phone,
        status: weddingVendors.status,
        notes: weddingVendors.notes,
        activeLinkId: vendorLinks.id,
        activeLinkExpiresAt: vendorLinks.expiresAt,
      })
      .from(weddingVendors)
      .innerJoin(vendors, eq(vendors.id, weddingVendors.vendorId))
      // Left, and filtered in the join condition rather than in `where`: a `where` on a
      // nullable joined column would turn this into an INNER join in effect, dropping every
      // vendor with no live link instead of showing it with `activeLink: null`. `member`
      // sees no rows here regardless (vendor_links' own policy is owner/admin only, 0006).
      .leftJoin(
        vendorLinks,
        and(
          eq(vendorLinks.weddingVendorId, weddingVendors.id),
          isNull(vendorLinks.revokedAt),
          gt(vendorLinks.expiresAt, new Date()),
        ),
      )
      .where(and(eq(weddingVendors.weddingId, weddingId), isNull(weddingVendors.deletedAt)))
      .orderBy(asc(sql`lower(${vendors.name})`), asc(weddingVendors.id))

    const directory = await tx
      .select(VENDOR_COLUMNS)
      .from(vendors)
      .where(isNull(vendors.deletedAt))
      .orderBy(asc(sql`lower(${vendors.name})`), asc(vendors.id))

    return {
      linked: linked.map(
        ({ activeLinkId, activeLinkExpiresAt, ...v }): WeddingVendorRow => ({
          ...v,
          status: v.status as WeddingVendorStatus,
          activeLink: activeLinkId
            ? { id: activeLinkId, expiresAt: activeLinkExpiresAt as Date }
            : null,
        }),
      ),
      directory,
      canCreate: principal.kind === 'orgStaff',
    }
  })
}

/**
 * Link an existing directory vendor to a wedding. Reads both parents first (see the header).
 * Re-adding a vendor that was removed works: the unique index is partial on `deleted_at`.
 */
export async function addWeddingVendor(
  db: Db,
  m: Memberships,
  orgId: string,
  weddingId: string,
  vendorId: string,
): Promise<VendorWriteResult<{ id: string }>> {
  const principal = weddingVendorPrincipal(m, orgId, weddingId)
  if (!principal) return NOT_FOUND
  try {
    return await withTenant(db, principal, async (tx) => linkInTx(tx, orgId, weddingId, vendorId))
  } catch (e) {
    // Two tabs adding the same vendor: the pre-check in `linkInTx` passes for both, and the
    // partial unique index is what actually decides.
    if (isUniqueViolation(e)) return DUPLICATE
    throw e
  }
}

/** Create a directory vendor and link it in ONE transaction, so a half-done add cannot exist. */
export async function createVendorForWedding(
  db: Db,
  m: Memberships,
  orgId: string,
  weddingId: string,
  input: VendorInput,
): Promise<VendorWriteResult<{ id: string; vendorId: string }>> {
  const principal = weddingVendorPrincipal(m, orgId, weddingId)
  if (!principal) return NOT_FOUND
  // A member can link but not create; RLS would refuse the insert anyway, with an error
  // instead of an answer.
  if (principal.kind !== 'orgStaff') return FORBIDDEN

  return withTenant(db, principal, async (tx) => {
    const wedding = await tx
      .select({ id: weddings.id })
      .from(weddings)
      .where(and(eq(weddings.id, weddingId), isNull(weddings.deletedAt)))
    if (wedding.length === 0) return NOT_FOUND

    const vendorId = newId()
    await tx.insert(vendors).values({ id: vendorId, orgId, ...input })
    const id = newId()
    await tx.insert(weddingVendors).values({ id, orgId, weddingId, vendorId })
    return { ok: true, value: { id, vendorId } } as const
  })
}

async function linkInTx(
  tx: TenantDb,
  orgId: string,
  weddingId: string,
  vendorId: string,
): Promise<VendorWriteResult<{ id: string }>> {
  const wedding = await tx
    .select({ id: weddings.id })
    .from(weddings)
    .where(and(eq(weddings.id, weddingId), isNull(weddings.deletedAt)))
  if (wedding.length === 0) return NOT_FOUND

  const vendor = await tx
    .select({ id: vendors.id })
    .from(vendors)
    .where(and(eq(vendors.id, vendorId), eq(vendors.orgId, orgId), isNull(vendors.deletedAt)))
  if (vendor.length === 0) return NOT_FOUND

  const existing = await tx
    .select({ id: weddingVendors.id })
    .from(weddingVendors)
    .where(
      and(
        eq(weddingVendors.weddingId, weddingId),
        eq(weddingVendors.vendorId, vendorId),
        isNull(weddingVendors.deletedAt),
      ),
    )
  if (existing.length > 0) return DUPLICATE

  const id = newId()
  await tx.insert(weddingVendors).values({ id, orgId, weddingId, vendorId })
  return { ok: true, value: { id } }
}

/**
 * Status and/or notes of one link. A key left out is left alone: the row's status select sends
 * only `status`, and if it sent the notes it had loaded it would overwrite an edit made in
 * another tab. `notes: null` clears them.
 */
export async function updateWeddingVendor(
  db: Db,
  m: Memberships,
  orgId: string,
  weddingId: string,
  linkId: string,
  patch: { readonly status?: WeddingVendorStatus; readonly notes?: string | null },
): Promise<VendorWriteResult> {
  const principal = weddingVendorPrincipal(m, orgId, weddingId)
  if (!principal) return NOT_FOUND
  const changed = await withTenant(db, principal, async (tx) =>
    tx
      .update(weddingVendors)
      .set({
        ...(patch.status !== undefined && { status: patch.status }),
        ...(patch.notes !== undefined && { notes: patch.notes }),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(weddingVendors.id, linkId),
          eq(weddingVendors.weddingId, weddingId),
          isNull(weddingVendors.deletedAt),
        ),
      )
      .returning({ id: weddingVendors.id }),
  )
  return changed.length === 0 ? NOT_FOUND : { ok: true, value: null }
}

/** Unlink. Soft, so budget lines and run sheet rows that point at the link keep their history. */
export async function removeWeddingVendor(
  db: Db,
  m: Memberships,
  orgId: string,
  weddingId: string,
  linkId: string,
): Promise<VendorWriteResult> {
  const principal = weddingVendorPrincipal(m, orgId, weddingId)
  if (!principal) return NOT_FOUND
  const now = new Date()
  const changed = await withTenant(db, principal, async (tx) =>
    tx
      .update(weddingVendors)
      .set({ deletedAt: now, updatedAt: now })
      .where(
        and(
          eq(weddingVendors.id, linkId),
          eq(weddingVendors.weddingId, weddingId),
          isNull(weddingVendors.deletedAt),
        ),
      )
      .returning({ id: weddingVendors.id }),
  )
  return changed.length === 0 ? NOT_FOUND : { ok: true, value: null }
}
