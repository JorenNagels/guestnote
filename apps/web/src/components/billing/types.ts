/**
 * What the Billing screen's Server Functions answer (`app/pro/(app)/billing/actions.ts`): codes,
 * never sentences -- the components hold the words.
 */

/** Checkout or the portal. On `ok` the browser goes to the provider's page. */
export type RedirectOutcome =
  | { readonly ok: true; readonly url: string }
  | { readonly ok: false; readonly reason: 'unavailable' | 'failed' | 'forbidden' }

export type InvoiceDetailsValues = {
  readonly billingName: string
  readonly billingEmail: string
  readonly vatNumber: string
}

export type InvoiceDetailsState = {
  readonly errors?: {
    billingName?: 'tooLong'
    billingEmail?: 'invalid'
    vatNumber?: 'invalid'
  }
  readonly form?: 'failed'
  readonly saved?: boolean
  readonly values?: InvoiceDetailsValues
}
