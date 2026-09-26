/**
 * The billing seam's vocabulary (spec 0005, "Billing"). Plain data only: nothing here names a
 * provider, and nothing a provider returns may cross the seam in its own shape. That is what
 * keeps choosing Mollie or Stripe -- deferred on purpose, 2026-09-24 -- one new file in this
 * package instead of a search through the app (CLAUDE.md invariant 5).
 */

export type BillingCycle = 'monthly' | 'yearly'

/** `organizations.billing_status`. Null in the column means `trialing`. */
export type BillingStatus = 'trialing' | 'active' | 'past_due' | 'canceled'

/** One invoice, as the Invoices card lists it. Amount in cents, VAT included. */
export type Invoice = {
  readonly id: string
  /** The provider's human-facing number, e.g. `GN-2026-0001`. */
  readonly number: string
  /** `YYYY-MM-DD`, the day it was issued. */
  readonly issuedOn: string
  readonly totalCents: number
  /** A URL the provider hosts; the page links to it and never proxies it. */
  readonly pdfUrl: string | null
}

/** What a live subscription says about itself, for the paid state's status line. */
export type Subscription = {
  readonly cycle: BillingCycle
  /** `YYYY-MM-DD`, or null when the provider cannot say. */
  readonly nextInvoiceOn: string | null
}

export type CheckoutRequest = {
  readonly orgId: string
  readonly cycle: BillingCycle
  /** Planners, owner included. Pending invitations are not seats until accepted. */
  readonly seats: number
  readonly customerId: string | null
  readonly billingEmail: string | null
  readonly vatNumber: string | null
  /** Where the provider sends the browser back to, absolute. */
  readonly returnUrl: string
}

/**
 * Every command answers with a result, never a throw, so the Billing screen can say what went
 * wrong in words. `unavailable` is the no-op provider's only answer and a real one's answer
 * when it is down; the screen shows it inline rather than pretending a checkout happened.
 */
export type RedirectResult =
  | { readonly ok: true; readonly url: string }
  | { readonly ok: false; readonly reason: 'unavailable' | 'failed' }

export type BillingProvider = {
  /** Named for log lines, as `MailTransport.name` is. Never shown. */
  readonly name: string
  startCheckout(request: CheckoutRequest): Promise<RedirectResult>
  openPortal(input: {
    readonly customerId: string | null
    readonly returnUrl: string
  }): Promise<RedirectResult>
  /**
   * The seat count changed: a planner joined or left. Called so wiring a provider is not a hunt
   * for call sites (spec 0005, "Seats"). Resolves whether or not the provider cared.
   */
  setSeats(input: { readonly orgId: string; readonly seats: number }): Promise<void>
  invoices(customerId: string | null): Promise<readonly Invoice[]>
  subscription(subscriptionId: string | null): Promise<Subscription | null>
}
