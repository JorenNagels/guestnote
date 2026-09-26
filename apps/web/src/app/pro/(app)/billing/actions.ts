'use server'

import type { BillingCycle } from '@guestnote/billing'
import { billingProfile, listTeam, principalForOrg, saveInvoiceDetails } from '@guestnote/db'
import { revalidatePath } from 'next/cache'
import type { InvoiceDetailsState, RedirectOutcome } from '../../../../components/billing/types.ts'
import { appBillingUrl } from '../../../../lib/app-url.ts'
import { getBillingProvider } from '../../../../lib/billing.ts'
import { billingMode } from '../../../../lib/billing-mode.ts'
import { getDb } from '../../../../lib/db.ts'
import { currentCaller } from '../../../../lib/principal.ts'
import { app } from '../../../../lib/routes.ts'

/**
 * The Billing screen's Server Functions (spec 0005, "Billing"). Each is a POST to its own route
 * (invariant 7), so each re-derives what the page decided: billing is on, and the caller is
 * owner or admin of the org in the `gn_org` cookie (`currentCaller` validates it against their
 * memberships). A member, or anyone while billing is off, gets `forbidden` -- the same thing as
 * the page's 404, said in the vocabulary of a result.
 *
 * **Not guarded by the trial lock, on purpose**: this is the way out of it
 * (`app/pro/trial-guard.test.ts` allowlists all three).
 *
 * Nothing here takes an org id, a seat count or a price from the client. The seat count is the
 * live `org_members` count, read here, and the cycle is one of two words.
 */

async function manager() {
  if (!billingMode().on) return null
  const caller = await currentCaller()
  if (!caller || !principalForOrg(caller.memberships, caller.orgId)) return null
  return caller
}

export async function startCheckoutAction(cycle: unknown): Promise<RedirectOutcome> {
  if (cycle !== 'monthly' && cycle !== 'yearly') return { ok: false, reason: 'failed' }
  const caller = await manager()
  if (!caller) return { ok: false, reason: 'forbidden' }
  const [profile, team] = await Promise.all([
    billingProfile(getDb(), caller.memberships, caller.orgId),
    listTeam(getDb(), caller.memberships, caller.orgId),
  ])
  if (!profile || !team) return { ok: false, reason: 'forbidden' }
  return getBillingProvider().startCheckout({
    orgId: caller.orgId,
    cycle: cycle satisfies BillingCycle,
    seats: team.length,
    customerId: profile.billingCustomerId,
    billingEmail: profile.billingEmail,
    vatNumber: profile.vatNumber,
    returnUrl: `${appBillingUrl()}?checkout=done`,
  })
}

export async function openPortalAction(): Promise<RedirectOutcome> {
  const caller = await manager()
  if (!caller) return { ok: false, reason: 'forbidden' }
  const profile = await billingProfile(getDb(), caller.memberships, caller.orgId)
  if (!profile) return { ok: false, reason: 'forbidden' }
  return getBillingProvider().openPortal({
    customerId: profile.billingCustomerId,
    returnUrl: appBillingUrl(),
  })
}

/**
 * Loose on purpose: two letters and 2-13 alphanumerics once spaces, dots and dashes are gone,
 * which every EU VAT number fits (`BE0123456789`, `NL123456789B01`). The provider or VIES
 * validates for real when there is one; this catches a typo'd email pasted into the wrong field.
 */
const VAT = /^[A-Z]{2}[A-Z0-9]{2,13}$/
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MAX_FIELD = 200

const field = (fd: FormData, key: string) => {
  const v = fd.get(key)
  return typeof v === 'string' ? v.trim() : ''
}

export async function saveInvoiceDetailsAction(
  _prev: InvoiceDetailsState,
  formData: FormData,
): Promise<InvoiceDetailsState> {
  const values = {
    billingName: field(formData, 'billingName'),
    billingEmail: field(formData, 'billingEmail'),
    vatNumber: field(formData, 'vatNumber')
      .toUpperCase()
      .replace(/[\s.-]/g, ''),
  }
  const errors: NonNullable<InvoiceDetailsState['errors']> = {}
  if (values.billingName.length > MAX_FIELD) errors.billingName = 'tooLong'
  if (values.billingEmail !== '' && !EMAIL.test(values.billingEmail)) {
    errors.billingEmail = 'invalid'
  }
  if (values.vatNumber !== '' && !VAT.test(values.vatNumber)) errors.vatNumber = 'invalid'
  if (Object.keys(errors).length > 0) return { errors, values }

  const caller = await manager()
  if (!caller) return { form: 'failed', values }
  const saved = await saveInvoiceDetails(getDb(), caller.memberships, caller.orgId, values)
  if (!saved.ok) return { form: 'failed', values }
  // The internal path: `proxy.ts` rewrites the app host's `/billing` to `/pro/billing`.
  revalidatePath(`/pro${app.billing()}`)
  return { saved: true, values }
}
