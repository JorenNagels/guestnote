import type { BillingCycle } from './types.ts'

/**
 * The price list, in one place (spec 0005, "Pricing lives in one config file"). **Placeholders
 * from the design**, not a pricing decision: pricing is undecided (spec 0003) and the Billing
 * screen is hidden while `GUESTNOTE_BILLING_FROM` is unset, so these change nothing today.
 * Rejected: `PRODUCT.md`'s tier model, for the same reason.
 *
 * Cents, never floats, the way every amount in this repo is stored.
 */
export const PRICING = {
  /** The studio itself, owner included. Per month, excl. VAT. */
  baseMonthlyCents: 4900,
  /** Each planner beyond the owner. Per month, excl. VAT. */
  seatMonthlyCents: 1900,
  /** A year costs ten months: "2 months free". */
  yearlyMonths: 10,
  /** Belgian VAT, as a whole percentage so the maths stays in integers. */
  vatPercent: 21,
} as const

export type Quote = {
  readonly cycle: BillingCycle
  /** Planners, owner included; never less than one. */
  readonly seats: number
  /** Planners beyond the owner. */
  readonly extraSeats: number
  /** The studio line for this cycle. */
  readonly baseCents: number
  /** One extra planner for this cycle. */
  readonly seatCents: number
  /** `extraSeats * seatCents`. */
  readonly extraCents: number
  /** Excl. VAT: what the Plan card's Total shows. */
  readonly subtotalCents: number
  /** 21, or 0 when a VAT number was given. */
  readonly vatPercent: number
  readonly vatCents: number
  readonly totalCents: number
}

/**
 * The Plan card's line items for `seats` planners on `cycle`.
 *
 * VAT is Belgian 21% unless a VAT number is given, as spec 0005 decided for the placeholder
 * screen. That is the intra-EU reverse-charge rule and it is **not right for a Belgian VAT
 * number**, which is still charged Belgian VAT; the provider that goes live will own the real
 * tax decision, and this line is where to correct it when it does. Rounded half-up to the cent,
 * once, on the subtotal -- not per line, which drifts by a cent on some seat counts.
 */
export function quote(seats: number, cycle: BillingCycle, vatNumber?: string | null): Quote {
  const planners = Number.isFinite(seats) ? Math.max(1, Math.floor(seats)) : 1
  const months = cycle === 'yearly' ? PRICING.yearlyMonths : 1
  const baseCents = PRICING.baseMonthlyCents * months
  const seatCents = PRICING.seatMonthlyCents * months
  const extraSeats = planners - 1
  const extraCents = extraSeats * seatCents
  const subtotalCents = baseCents + extraCents
  const vatPercent = vatNumber?.trim() ? 0 : PRICING.vatPercent
  const vatCents = Math.round((subtotalCents * vatPercent) / 100)
  return {
    cycle,
    seats: planners,
    extraSeats,
    baseCents,
    seatCents,
    extraCents,
    subtotalCents,
    vatPercent,
    vatCents,
    totalCents: subtotalCents + vatCents,
  }
}
