/**
 * `@guestnote/billing` -- the billing seam (spec 0005, "Billing").
 *
 * The shape `packages/email` and `packages/storage` have: plain data in and out, config as
 * arguments, no `process.env`, and one file per provider. Today that one file is `noop.ts`,
 * because the provider (Mollie or Stripe) is deliberately not chosen yet. When one lands its SDK
 * is imported from exactly one file here, and banned everywhere else in `biome.json` AND
 * `packages/db/src/no-unsafe-imports.test.ts`, like every other provider (CLAUDE.md invariant 5).
 * There is no ban yet because there is no SDK to ban: a rule naming a package nobody installed
 * would be a guess at its name.
 */

export { createNoopProvider } from './noop.ts'
export { PRICING, type Quote, quote } from './pricing.ts'
export type {
  BillingCycle,
  BillingProvider,
  BillingStatus,
  CheckoutRequest,
  Invoice,
  RedirectResult,
  Subscription,
} from './types.ts'
