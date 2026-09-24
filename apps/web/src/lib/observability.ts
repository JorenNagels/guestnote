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
 * each, and none of them reachable from a component. The cost is process-global mutable
 * state: a registry on `globalThis` that any module can reach by its key. Why it is not a
 * module `let` is in the section on the slots below.
 */

type Reporter = (message: string, context: Record<string, unknown>) => void

/**
 * ## The slots live on `globalThis`, not in this module
 *
 * Next bundles `instrumentation.ts` separately from the app's server components, so each side
 * gets its OWN copy of this module: a `let` here, set by `register()`, was never seen by a page
 * or a Server Function. Found 2026-09-24 when the "Report a problem" button stayed hidden
 * with a real DSN set -- `feedbackAvailable()` read the page bundle's still-null slot -- and the
 * fix was read back the same day in `next dev`: the button showed and a report reached the
 * inbox. The same split implies `reportSilentFailure` has been reaching CloudWatch only, never
 * Sentry, for as long as the reporter slot has existed; that is inferred from the split, not
 * read back from Sentry's history.
 *
 * `Symbol.for` rather than a string property: it is the one key both copies can compute, and it
 * cannot collide with, or be enumerated alongside, anything else on `globalThis`. The cost is
 * that anything knowing the key can overwrite a reporter. Rejected: importing the SDK here,
 * which this file's header rules out. **No test can see the split** -- Vitest loads one copy of
 * this module -- so `observability.test.ts` pins only that a fresh module copy reads the slot a
 * previous copy set, which is the property the split needs.
 *
 * Each slot is null until `instrumentation.ts` installs it, and null forever without a DSN. A
 * no-op default rather than a queue: an event raised before `register()` runs is an event from
 * a request that cannot exist yet, and buffering would mean deciding how much to hold and when
 * to drop it. Losing nothing real is worth more than the machinery.
 */
type Slots = { reporter: Reporter | null; feedback: FeedbackReporter | null }
const SLOTS = Symbol.for('guestnote.observability')
function slots(): Slots {
  const g = globalThis as { [SLOTS]?: Slots }
  g[SLOTS] ??= { reporter: null, feedback: null }
  return g[SLOTS]
}

export function setReporter(next: Reporter | null): void {
  slots().reporter = next
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
  // reserving `error` for genuine faults keeps a CloudWatch metric filter useful later. The
  // `[silent-failure] ` prefix is what such a filter would match on, so it is output and not
  // decoration -- `observability.test.ts` asserts it.
  //
  // JSON log format is set in `sst.config.ts` so this object stays queryable in Logs
  // Insights rather than collapsing to a string. That sentence was false from 2026-08-29 to
  // 2026-09-01: it was configured under `server.logging`, which `sst.aws.Nextjs` drops
  // without a word, and the deployed function logged `Text` the whole time. It is set
  // through `transform.server` now, which does reach the Lambda. Read the config back after
  // a deploy rather than trusting this line -- the last reader of it was wrong for eleven
  // days about the very failure this file exists to make visible.
  console.warn(`[silent-failure] ${message}`, safe)

  slots().reporter?.(message, safe)
}

/**
 * A report a planner chose to send: "Report a problem" (spec 0005). Plain data, so nothing
 * here names the vendor that receives it.
 */
export type Feedback = {
  category: 'bug' | 'idea' | 'question'
  message: string
  name: string
  email: string
  /** Searchable in the inbox: org, wedding, page, locale. Scrubbed like any other context. */
  tags: Record<string, string>
  attachment?: { filename: string; contentType: string; data: Uint8Array } | undefined
}

/** Resolves whether the report is known to have left the process. */
type FeedbackReporter = (feedback: Feedback) => Promise<boolean>

/**
 * Null until `instrumentation.ts` installs one, and null forever without a DSN -- which is
 * exactly when `feedbackAvailable()` is false and the entry points are not rendered. Same
 * pushed-in shape as `setReporter`, for the same reason: this file must not import the SDK.
 */
export function setFeedbackReporter(next: FeedbackReporter | null): void {
  slots().feedback = next
}

export function feedbackAvailable(): boolean {
  return slots().feedback !== null
}

/**
 * Hand a report to the inbox. Resolves false when there is nowhere to send it or it did not
 * leave in time, so the caller can say so rather than thank the planner for a report that went
 * nowhere. Awaited, because the reporter flushes: see `instrumentation.ts`.
 *
 * The message itself is NOT scrubbed: it is what the planner typed for us to read, and the
 * scrubber matches on key names, which a free-text body does not have. The tags are.
 */
export async function reportFeedback(feedback: Feedback): Promise<boolean> {
  const feedbackReporter = slots().feedback
  if (!feedbackReporter) return false
  return feedbackReporter({ ...feedback, tags: scrub(feedback.tags) as Record<string, string> })
}
