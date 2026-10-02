'use server'

import {
  addWeddingVendor,
  createVendorForWedding,
  createVendorLink,
  getWedding,
  getWeddingVendors,
  removeWeddingVendor,
  restoreWeddingVendor,
  revokeVendorLink,
  updateWeddingVendor,
  type WeddingScope,
} from '@guestnote/db'
import { revalidatePath } from 'next/cache'
import { newBearerToken } from '../../../../../../lib/bearer-token.ts'
import { currentOrgId, currentOrgs } from '../../../../../../lib/principal.ts'
import { assertWritable } from '../../../../../../lib/trial.ts'
import {
  answer,
  parseId,
  parseNotes,
  parseStatus,
  parseVendorInput,
  type VendorActionResult,
} from '../../../../../../lib/vendor-input.ts'
import { sendVendorLinkMail } from '../../../../../../lib/vendor-link-mail.ts'
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
  await assertWritable(await currentOrgId())
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
  await assertWritable(await currentOrgId())
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
  await assertWritable(await currentOrgId())
  const ctx = await context(weddingId)
  if (!ctx) return { ok: false, error: 'notFound' }
  const id = parseId(linkId)
  const s = parseStatus(status)
  if (!id || !s) return { ok: false, error: 'invalid' }
  const r = await updateWeddingVendor(ctx, id, { status: s })
  if (r.ok) refresh()
  return answer(r)
}

/**
 * "Volledige tijdlijn tonen" (spec 0007): the vendor's link shows the whole day. Any staff, like
 * the status -- the flag is on `wedding_vendors`, not `vendor_links`, for exactly that reason.
 * Saved on its own so it cannot overwrite a note being edited in the same sheet.
 */
export async function setWeddingVendorFullRunSheet(
  weddingId: unknown,
  linkId: unknown,
  on: unknown,
): Promise<VendorActionResult> {
  await assertWritable(await currentOrgId())
  const ctx = await context(weddingId)
  if (!ctx) return { ok: false, error: 'notFound' }
  const id = parseId(linkId)
  if (!id || typeof on !== 'boolean') return { ok: false, error: 'invalid' }
  const r = await updateWeddingVendor(ctx, id, { fullRunSheet: on })
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
  await assertWritable(await currentOrgId())
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
  await assertWritable(await currentOrgId())
  const ctx = await context(weddingId)
  if (!ctx) return { ok: false, error: 'notFound' }
  const id = parseId(linkId)
  if (!id) return { ok: false, error: 'invalid' }
  const r = await removeWeddingVendor(ctx, id)
  if (r.ok) refresh()
  return answer(r)
}

/**
 * The toast's Undo for `removeVendorFromWedding` (spec 0009 C4). Same gate as the remove; the
 * repo answers `duplicate` when the vendor has been added to this wedding again since.
 */
export async function restoreVendorToWedding(
  weddingId: unknown,
  linkId: unknown,
): Promise<VendorActionResult> {
  await assertWritable(await currentOrgId())
  const ctx = await context(weddingId)
  if (!ctx) return { ok: false, error: 'notFound' }
  const id = parseId(linkId)
  if (!id) return { ok: false, error: 'invalid' }
  const r = await restoreWeddingVendor(ctx, id)
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
  await assertWritable(await currentOrgId())
  const ctx = await context(weddingId)
  if (!ctx) return { ok: false, error: 'notFound' }
  const id = parseId(wedVendorId)
  if (!id) return { ok: false, error: 'invalid' }

  const days = ttlDays === undefined ? DEFAULT_VENDOR_LINK_TTL_DAYS : Number(ttlDays)
  if (!Number.isInteger(days) || days < 1 || days > MAX_VENDOR_LINK_TTL_DAYS) {
    return { ok: false, error: 'invalid' }
  }
  return mintLink(ctx, id, days)
}

/**
 * The one place a token is minted, for Create and for Email alike, so the two cannot drift on
 * what is stored (the hash only) or on "create means replace" (the repo's, see `vendor-links.ts`).
 */
async function mintLink(
  ctx: WeddingScope,
  wedVendorId: string,
  days: number,
): Promise<CreateVendorLinkResult> {
  const { token, tokenHash } = newBearerToken()
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000)
  const r = await createVendorLink(ctx, wedVendorId, {
    tokenHash,
    expiresAt,
  })
  if (!r.ok) return { ok: false, error: r.reason }
  refresh()
  return { ok: true, token, expiresAt: expiresAt.toISOString() }
}

/** What `emailVendorLinkAction` answers: Create's result, plus where the mail went. */
export type EmailVendorLinkResult =
  | {
      readonly ok: true
      readonly token: string
      readonly expiresAt: string
      /** The address it went (or was meant to go) to, for "Verstuurd naar ...". */
      readonly sentTo: string
      readonly mailed: boolean
    }
  | { readonly ok: false; readonly error: 'forbidden' | 'notFound' | 'invalid' | 'noEmail' }

/**
 * "Link mailen naar {name}" (spec 0009 A4): Create, then the link by mail to the vendor.
 *
 * **The address is read here, never taken from the client.** It is the vendor's directory
 * address as this caller can read it under `withTenant` (`getWeddingVendors`), so a forged call
 * can mail a link only to an address already on a vendor of a wedding the caller manages -- and
 * only an owner or admin gets that far, because `createVendorLink` refuses everyone else before
 * anything is sent. Rejected: an `email` argument, which would make this a "mail any address a
 * credential" endpoint with a studio's name on it.
 *
 * Read BEFORE the link is made, so a vendor with no address is refused without replacing a live
 * link the planner may already have handed out.
 *
 * **When the mail fails, the link stays.** It exists, the token is returned like Create returns
 * it, and the sheet says the mail did not go and to copy the link instead (`mailed: false`).
 * Rejected: revoking it again, which would leave the planner with nothing in hand for a failure
 * that is usually the address's, not the link's -- and would still have revoked any link that
 * was live before. This is the couple invitation's choice too (`lib/couple-invite.ts`).
 *
 * Language: the wedding's `locale_default`, which `getWeddingVendors` already reads.
 */
export async function emailVendorLinkAction(
  weddingId: unknown,
  wedVendorId: unknown,
): Promise<EmailVendorLinkResult> {
  await assertWritable(await currentOrgId())
  const ctx = await context(weddingId)
  if (!ctx) return { ok: false, error: 'notFound' }
  const id = parseId(wedVendorId)
  if (!id) return { ok: false, error: 'invalid' }

  const [vendors, wedding, orgs] = await Promise.all([
    getWeddingVendors(ctx),
    getWedding(ctx),
    currentOrgs(),
  ])
  const row = vendors?.linked.find((v) => v.id === id)
  if (!vendors || !wedding || !row) return { ok: false, error: 'notFound' }
  const to = row.email?.trim() ?? ''
  if (to === '') return { ok: false, error: 'noEmail' }

  const made = await mintLink(ctx, id, DEFAULT_VENDOR_LINK_TTL_DAYS)
  if (!made.ok) return made

  // A throw from the transport (credentials, network) is the same answer as a refused send: the
  // link is made, the mail is not. `packages/email` has already recorded a refused one.
  const sent = await sendVendorLinkMail({
    to,
    token: made.token,
    locale: vendors.locale,
    studio: orgs.find((o) => o.id === ctx.orgId)?.name ?? '',
    couple: wedding.coupleDisplayName,
    expiresAt: made.expiresAt,
  }).catch(() => null)

  return { ...made, sentTo: to, mailed: sent?.ok === true }
}

export async function revokeVendorLinkAction(
  weddingId: unknown,
  linkId: unknown,
): Promise<{ ok: boolean }> {
  await assertWritable(await currentOrgId())
  const ctx = await context(weddingId)
  if (!ctx) return { ok: false }
  const id = parseId(linkId)
  if (!id) return { ok: false }
  const gone = await revokeVendorLink(ctx, id)
  if (gone.ok) refresh()
  return { ok: gone.ok }
}
