import 'server-only'
import { env } from '../env.ts'

/**
 * Whether Guestnote is a free demo or a product with a trial and a bill. Spec 0005, "Demo mode".
 *
 * `off` is the demo: the demo banner shows, the trial banner, the Billing screen and the
 * trial lock do not exist. `on` carries the civil date billing started, because every studio
 * created before it counts its trial from that day and not from its own creation.
 *
 * The one reader of `env.billingFrom`. Everything else asks this, so "is billing on" has one
 * answer. The variable is not yet wired into `sst.config.ts`, so every deployed stage is a demo
 * until it is; turning billing on is then one SSM parameter and a deploy.
 */
export type BillingMode = { on: false } | { on: true; from: string }

export function billingMode(): BillingMode {
  return resolveBillingMode(env.billingFrom)
}

/**
 * Split from `billingMode()` so the parsing is testable without an environment.
 *
 * Throws on a date that matches the shape and does not exist (`2026-02-31`). `env.ts` checks the
 * shape only, and a malformed value silently meaning "demo" would be the worse failure: whoever
 * set it meant billing on, and would find out from the absence of an invoice.
 */
export function resolveBillingMode(raw: string | undefined): BillingMode {
  if (raw === undefined) return { on: false }
  const parsed = new Date(`${raw}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== raw) {
    throw new Error(
      `GUESTNOTE_BILLING_FROM=${raw} is not a real date. Unset it for demo mode, or give a ` +
        'YYYY-MM-DD day that exists (docs/specs/0005, "Demo mode").',
    )
  }
  return { on: true, from: raw }
}
