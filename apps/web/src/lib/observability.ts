import 'server-only'
import * as Sentry from '@sentry/nextjs'
import { scrub } from './scrub.ts'

/**
 * The one function the rest of the app calls to report something that went wrong quietly.
 *
 * ## Why this exists at all, rather than `Sentry.captureException` at each call site
 *
 * Because the failures worth reporting here are the ones the interface is *required* to
 * swallow. The sign-in surface renders every passkey failure identically -- as nothing --
 * and `components/auth/actions.ts` narrows the reason to a single boolean before it can
 * reach a client. That is correct for the visitor and it left us blind: eleven days of
 * enrollment failing on staging with `passkeys` empty and not one line anywhere saying so
 * (found 2026-08-31). Silence on screen is a design decision. Silence in the logs was an
 * accident, and this is the file that separates the two.
 *
 * ## Why `packages/core` does not import it
 *
 * `packages/core/src/auth/better-auth.ts` cannot: that package reads no environment and
 * touches no provider but Better Auth, which is invariant 5 and the thing that keeps an auth
 * swap a bounded job. Adding a Sentry import there would put a second vendor behind the same
 * seam. So the seam takes a **reporter callback** as configuration -- exactly as it already
 * takes `sendCode` and `newId` -- and `lib/auth.ts` passes this one in. The package keeps
 * returning plain data to a function it knows nothing about.
 *
 * ## A no-op when there is no DSN
 *
 * `Sentry.captureException` without an initialised client does nothing and does not throw,
 * so this needs no guard of its own: `instrumentation.ts` simply never calls `init`, and
 * every call here evaporates. A fresh clone reports nothing and notices nothing.
 */
export function reportSilentFailure(message: string, context: Record<string, unknown> = {}): void {
  // Scrubbed at the call site as well as in `beforeSend`, and that is not redundant: this
  // context object is attached as structured extra data, and belt-and-braces on the one
  // path that deliberately carries auth-adjacent fields is worth the microseconds.
  const safe = scrub(context)

  /**
   * Logged as well as reported, always.
   *
   * CloudWatch is free at this volume, needs no vendor, and is the only thing that still
   * works when the DSN is unset or Sentry is unreachable -- which is precisely when
   * something is going wrong. `console.warn` and not `error`: these are handled outcomes
   * the product recovers from, and reserving `error` for genuine faults keeps a CloudWatch
   * metric filter useful later.
   */
  console.warn(`[silent-failure] ${message}`, safe)

  Sentry.captureException(new Error(message), {
    // `warning`, not `error`. Every one of these is a path the product handles gracefully;
    // marking them `error` would train whoever is watching to ignore the word.
    level: 'warning',
    // Grouped by the message rather than the synthetic stack, which is this function every
    // time and would collapse unrelated failures into one issue.
    fingerprint: [message],
    extra: safe,
  })
}
