import 'server-only'
import { scrub } from './scrub.ts'

/**
 * Where a failure the interface is required to hide goes instead.
 *
 * ## Why the failures worth reporting are exactly the invisible ones
 *
 * The sign-in surface renders every passkey failure identically -- as nothing -- and
 * `components/auth/actions.ts` narrows the reason to one boolean before it can reach a
 * client. Both are deliberate and both stay. Together they hid a broken enrollment for
 * eleven days: `passkeys` empty on all three Neon branches, three challenge rows written on
 * staging, and not one line anywhere naming a cause (2026-08-31). Silence on screen is a
 * design decision. Silence in the logs was an accident, and this is the file that keeps them
 * apart.
 *
 * ## This file imports no vendor, and that is load-bearing
 *
 * It used to `import * as Sentry from '@sentry/nextjs'`, and that broke every test that
 * transitively reached it: the SDK pulls a **webpack bundler plugin** into its module graph,
 * which throws `The URL must be of scheme file` the moment Vitest loads it. `actions.ts`
 * imports this, and `login/page.test.tsx` imports that, so one import here reached across
 * the app.
 *
 * So the vendor is *pushed in* rather than pulled: `instrumentation.ts` -- which Next loads
 * once, on the server, outside any test -- calls `setReporter()` with a Sentry-backed
 * function. Nothing else in the app knows Sentry exists.
 *
 * That is the same shape invariant 5 states for Better Auth and the AWS SDK, and the same
 * shape `packages/core`'s `report` callback uses one layer down. Three vendors, one file
 * each, and none of them reachable from a component. The cost is a mutable module-level
 * slot, which is the price of a seam that must not be imported.
 */

type Reporter = (message: string, context: Record<string, unknown>) => void

/**
 * Null until `instrumentation.ts` installs one, and null forever when there is no DSN.
 *
 * A no-op default rather than a queue: an event raised before `register()` runs is an event
 * from a request that cannot exist yet, and buffering would mean deciding how much to hold
 * and when to drop it. Losing nothing real is worth more than the machinery.
 */
let reporter: Reporter | null = null

export function setReporter(next: Reporter | null): void {
  reporter = next
}

/**
 * Report something the product handled gracefully and the visitor must not be told about.
 *
 * Both sinks, always, and the pairing is the point: CloudWatch needs no vendor, costs
 * nothing at this volume, and is the one that still works when the DSN is unset or Sentry is
 * unreachable -- which is exactly when something is going wrong.
 */
export function reportSilentFailure(message: string, context: Record<string, unknown> = {}): void {
  // Scrubbed here as well as in `beforeSend`, and not redundantly: this object is attached
  // as structured data and this is the one path that deliberately carries auth-adjacent
  // fields. The CloudWatch line below never reaches `beforeSend` at all.
  const safe = scrub(context)

  // `warn`, not `error`: every one of these is a path the product recovers from, and
  // reserving `error` for genuine faults keeps a CloudWatch metric filter useful later.
  // JSON log format is set in sst.config.ts so this object stays queryable in Logs Insights
  // rather than collapsing to a string.
  console.warn(`[silent-failure] ${message}`, safe)

  reporter?.(message, safe)
}
