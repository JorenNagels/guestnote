import { and, asc, eq, isNull, sql } from 'drizzle-orm'
import type { Db } from '../client.ts'
import { newId } from '../id.ts'
import { runSheetItems, weddingEvents } from '../schema/events.ts'
import { vendorLinks, weddingVendors } from '../schema/vendors.ts'
import { type Principal, withTenant } from '../tenant.ts'
import { principalForOrg } from './memberships.ts'
import { fail, ok, type Result } from './result.ts'
import type { WeddingScope } from './scope.ts'

/**
 * Slice S10 (spec 0003): the `link` principal's own repo file.
 *
 * Three doors, matching the three things S10 builds:
 *
 *   1. `createVendorLink` / `revokeVendorLink` -- owner/admin, through `withTenant` exactly
 *      like every other write in this package. `vendor_links`' own `tenant_isolation` policy
 *      (0006) already restricts both to owner and admin; this file does not re-decide that,
 *      it is what makes the write.
 *   2. `resolveVendorLinkByHash` -- the one door that opens BEFORE a principal exists, same
 *      shape as `invitations.ts`'s `resolveInvitationByHash`: one `select` of one SECURITY
 *      DEFINER function (`resolve_vendor_link`, migration 0008), on a plain `Db`, because
 *      there is no tenant to scope a query to yet.
 *   3. `getVendorLinkView` -- once the route has built a `link` `Principal` from what (2)
 *      returned, this is the ordinary `withTenant` read of the vendor's own rows, scoped by
 *      0008's `link_read` policies: `run_sheet_items` and `wedding_vendors` to this one
 *      `weddingVendorId`, and `wedding_events` (added so the join below has an `eventLabel`
 *      to read at all) to the wedding as a whole -- see 0008_vendor_link.sql Part 0.
 *
 * The token itself is generated and hashed in `apps/web/src/lib/vendor-link-token.ts`, the
 * same split `invite-token.ts` / `invitations.ts` already uses: this file only ever sees a
 * hash, on the way in and on the way out, so the plaintext exists in the URL handed to the
 * vendor and nowhere in a query or a log line.
 */

export type VendorLinkWriteResult = Result<{ readonly id: string }, 'forbidden' | 'notFound'>

/**
 * What `resolve_vendor_link` (migration 0008) hands back. `status` is here for a future admin
 * view; the public route that resolves a visitor's token treats anything other than `'live'`
 * the same as `null` -- spec 0003's "never a leak of why" -- so it is the ONLY caller allowed
 * to read this field and act on it.
 */
export type VendorLinkLookup = {
  readonly orgId: string
  readonly weddingId: string
  readonly weddingVendorId: string
  readonly vendorName: string
  readonly orgName: string
  readonly weddingCoupleDisplayName: string
  /** `YYYY-MM-DD` or `null`. See the migration's comment on why this is `text`, not `Date`. */
  readonly weddingDate: string | null
  readonly weddingVenue: string | null
  readonly weddingHeadcount: number | null
  readonly status: 'live' | 'expired' | 'revoked'
  /**
   * The studio's logo storage key (spec 0005, migration 0010), or `null`. A key, not a URL:
   * the page presigns it per render, like every other object in the private bucket.
   */
  readonly logoKey: string | null
}

export type VendorTimelineItem = {
  readonly id: string
  readonly eventLabel: string
  /** `HH:MM`. */
  readonly startsAt: string
  readonly durationMin: number
  readonly title: string
  readonly place: string | null
}

/** Everything the vendor's own page renders, once a `link` principal exists. */
export type VendorLinkView = {
  readonly timeline: readonly VendorTimelineItem[]
  /**
   * "What the planner needs from you", reduced to `wedding_vendors.notes` -- a single
   * freeform block, not the prototype's dated task list. `schema/tasks.ts` defers a
   * vendor-assignable task to item P18; there is no table to back a list yet, and this is
   * the one field that exists today. `null` when the planner has not written anything.
   */
  readonly plannerNote: string | null
}

type ResolveRow = {
  org_id: string
  wedding_id: string
  wedding_vendor_id: string
  vendor_name: string
  org_name: string
  wedding_couple_display_name: string
  wedding_date: string | null
  wedding_venue: string | null
  wedding_headcount: number | null
  status: string
  logo_key: string | null
}

const KNOWN_STATUSES = new Set(['live', 'expired', 'revoked'])

async function rowsOf<T>(pending: Promise<unknown>): Promise<T[]> {
  return ((await pending) as { rows: T[] }).rows
}

/**
 * Creates a link for one `wedding_vendors` row. Owner/admin only, and the parent is read
 * first (spec 0003's parent-read rule): `vendor_links.wedding_vendor_id` is a plain FK, so
 * without this an org-wide principal's policy would let a caller name another wedding's
 * `wedding_vendors` id and mint a token for it. The read is narrowed to `weddingId` as well
 * as `orgId`: the route's wedding is what the planner is looking at, and a row id from a
 * different wedding of the same org is `notFound` here rather than silently accepted.
 *
 * Any link already live for this vendor is revoked first, in the SAME transaction as the
 * insert. Nothing in the schema stops two live links existing for one vendor, but the UI
 * (`getWeddingVendors`' `activeLink`) shows at most one, and a second live row would fan that
 * query out into a duplicate. "Create" therefore means "replace" -- a planner who wants a
 * fresh link because the old one leaked gets exactly that, in one action, and the old token
 * stops working the moment the new one exists rather than continuing to work alongside it.
 *
 * The token itself is not this function's business -- see the header. `tokenHash` and
 * `expiresAt` arrive already computed, the same split `createStaffInvite` uses.
 */
export async function createVendorLink(
  scope: WeddingScope,
  weddingVendorId: string,
  input: { readonly tokenHash: string; readonly expiresAt: Date },
): Promise<VendorLinkWriteResult> {
  const { db, m, orgId, weddingId } = scope
  const principal = principalForOrg(m, orgId)
  if (!principal) return fail('forbidden')

  return withTenant(db, principal, async (tx) => {
    const parent = await tx
      .select({ id: weddingVendors.id })
      .from(weddingVendors)
      .where(
        and(
          eq(weddingVendors.id, weddingVendorId),
          eq(weddingVendors.orgId, orgId),
          eq(weddingVendors.weddingId, weddingId),
          isNull(weddingVendors.deletedAt),
        ),
      )
    const wv = parent[0]
    if (!wv) return fail('notFound')

    await tx
      .update(vendorLinks)
      .set({ revokedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(vendorLinks.weddingVendorId, weddingVendorId), isNull(vendorLinks.revokedAt)))

    const id = newId()
    await tx.insert(vendorLinks).values({
      id,
      orgId,
      weddingId,
      weddingVendorId,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
    })
    return ok({ id })
  })
}

/**
 * Revokes a link on `weddingId` -- a link id from another wedding of the same org matches
 * nothing, like `createVendorLink`'s parent read. Sets `revoked_at` rather than deleting -- 0006's `vendors.ts` schema comment:
 * "so 'this link was revoked on...' stays answerable" -- which is also why this returns
 * `notFound` on a link already revoked rather than treating it as already-done: a caller
 * re-revoking a live link and one clicking a stale button should not read as the same case
 * forever, even though neither is wrong to retry.
 */
export async function revokeVendorLink(
  scope: WeddingScope,
  linkId: string,
): Promise<Result<null, 'notFound'>> {
  const { db, m, orgId, weddingId } = scope
  const principal = principalForOrg(m, orgId)
  if (!principal) return fail('notFound')

  return withTenant(db, principal, async (tx) => {
    const gone = await tx
      .update(vendorLinks)
      .set({ revokedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(vendorLinks.id, linkId),
          eq(vendorLinks.orgId, orgId),
          eq(vendorLinks.weddingId, weddingId),
          isNull(vendorLinks.revokedAt),
        ),
      )
      .returning({ id: vendorLinks.id })
    return gone.length > 0 ? ok(null) : fail('notFound')
  })
}

/**
 * The one door onto a vendor token before any principal exists. `null` for a hash matching
 * nothing at all -- migration 0008 folds "removed vendor" into that same `null`, since
 * `resolve_vendor_link`'s join requires a live `wedding_vendors` row.
 */
export async function resolveVendorLinkByHash(
  db: Db,
  tokenHash: string,
): Promise<VendorLinkLookup | null> {
  const [row] = await rowsOf<ResolveRow>(
    db.execute(sql`select * from public.resolve_vendor_link(${tokenHash})`),
  )
  if (!row) return null
  if (!KNOWN_STATUSES.has(row.status)) {
    throw new Error(
      `resolve_vendor_link returned an unknown status '${row.status}' (migration 0008)`,
    )
  }
  return {
    orgId: row.org_id,
    weddingId: row.wedding_id,
    weddingVendorId: row.wedding_vendor_id,
    vendorName: row.vendor_name,
    orgName: row.org_name,
    weddingCoupleDisplayName: row.wedding_couple_display_name,
    weddingDate: row.wedding_date,
    weddingVenue: row.wedding_venue,
    weddingHeadcount: row.wedding_headcount,
    status: row.status as VendorLinkLookup['status'],
    logoKey: row.logo_key,
  }
}

/**
 * The vendor's own view, once a `link` `Principal` exists. RLS (0008's `link_read` policies)
 * already narrows both tables to this one `weddingVendorId`; the `where` clauses repeat that
 * as intent, the same convention `resolveMemberships` documents -- if a policy is ever wrong,
 * an agreeing clause narrows the blast radius instead of widening it.
 */
export async function getVendorLinkView(
  db: Db,
  principal: Extract<Principal, { kind: 'link' }>,
): Promise<VendorLinkView> {
  return withTenant(db, principal, async (tx) => {
    const items = await tx
      .select({
        id: runSheetItems.id,
        eventLabel: weddingEvents.label,
        startsAt: runSheetItems.startsAt,
        durationMin: runSheetItems.durationMin,
        title: runSheetItems.title,
        place: runSheetItems.place,
      })
      .from(runSheetItems)
      .innerJoin(
        weddingEvents,
        and(eq(weddingEvents.id, runSheetItems.eventId), isNull(weddingEvents.deletedAt)),
      )
      .where(eq(runSheetItems.weddingVendorId, principal.weddingVendorId))
      .orderBy(asc(runSheetItems.position), asc(runSheetItems.startsAt), asc(runSheetItems.id))

    const own = await tx
      .select({ notes: weddingVendors.notes })
      .from(weddingVendors)
      .where(eq(weddingVendors.id, principal.weddingVendorId))

    return {
      timeline: items.map((i) => ({ ...i, startsAt: i.startsAt.slice(0, 5) })),
      plannerNote: own[0]?.notes ?? null,
    }
  })
}
