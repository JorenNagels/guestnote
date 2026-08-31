import * as Sentry from '@sentry/nextjs'
import { env } from './env.ts'
import { scrubEvent } from './lib/scrub.ts'

/**
 * Server-side error reporting. Next calls `register()` once per runtime, before any request.
 *
 * **This file and `instrumentation-client.ts` are the only two places `@sentry/nextjs` is
 * imported**, plus `lib/observability.ts` which wraps `captureException`. That is the same
 * one-file-per-provider rule invariant 5 states for Better Auth and the AWS SDK, applied to
 * a third provider -- except the SDK's own architecture forces the entry points to live at
 * fixed paths, so the rule here is "these three files" rather than "this one".
 *
 * ## Off by default, everywhere
 *
 * No DSN means `Sentry.init` is never called and every `captureException` becomes a no-op.
 * That is deliberate and it is the same rule `GUESTNOTE_MAIL_TRANSPORT` and the Google
 * client pair follow: the value you get by forgetting the variable must be the safe one. A
 * fresh clone runs `npm run dev` reporting nothing, and a deployed environment that has not
 * been given a DSN fails quietly rather than pointing at whatever project it can reach.
 */
export async function register(): Promise<void> {
  // Shape, not presence. A DSN is a URL, and this has to tolerate the placeholder that keeps
  // the SSM parameter existing before there is a real value to put in it -- `secret()` in
  // sst.config.ts fails the whole deploy on a missing parameter, so "not configured yet" has
  // to be expressible as a value rather than an absence. Anything that is not a URL means
  // off, which keeps the safe-by-omission rule intact for a placeholder as well as for unset.
  if (!env.sentryDsn?.startsWith('https://')) return

  Sentry.init({
    dsn: env.sentryDsn,
    /**
     * The stage, not `NODE_ENV`, so staging and production are distinguishable in the
     * dashboard. Derived from the root domain rather than read from a new variable --
     * `app-url.ts` and `lib/auth.ts` already treat that pair as the single answer to "where
     * am I", and a second source of truth is a second thing that can disagree.
     */
    environment: env.rootDomain.includes('staging')
      ? 'staging'
      : env.rootDomain.endsWith('.localhost')
        ? 'development'
        : 'production',

    /**
     * Tracing OFF. Errors only, for now.
     *
     * Performance data is the expensive half of every plan on volume, and this app has no
     * latency question it cannot answer from CloudWatch. Turn it on with a number, not a
     * `1.0`, when there is a real question -- a full sample rate on a Lambda is how a free
     * tier evaporates in an afternoon.
     */
    tracesSampleRate: 0,

    /**
     * The scrubber runs in-process, before anything leaves. `lib/scrub.ts` argues why we do
     * not rely on Sentry's own field-name defaults: every credential this app handles is
     * named something its default list has never heard of.
     *
     * Cast through `unknown` in both directions because `scrubEvent` is deliberately typed
     * on plain records -- it is shared with code that has never heard of Sentry, and giving
     * it the SDK's `ErrorEvent` would drag a provider type into a file the tests import
     * without one. The cast is safe in the way that matters: the function preserves shape
     * and only replaces leaf values, so every field Sentry requires survives it.
     */
    beforeSend: (event) =>
      scrubEvent(event as unknown as Record<string, unknown>) as unknown as typeof event,

    // Breadcrumbs carry request bodies and console output, which on this app means sign-in
    // codes. Scrubbed on the same path rather than disabled, so the trail is still readable.
    beforeBreadcrumb: (crumb) =>
      scrubEvent(crumb as unknown as Record<string, unknown>) as unknown as typeof crumb,

    // No PII, ever. The default is already false; stated because the DPA argument in
    // research/07 section 1 rests on it and a future SDK default should not silently change
    // what this app sends.
    sendDefaultPii: false,
  })
}

/**
 * Next 16 calls this for errors thrown in a nested React Server Component render, which the
 * ordinary error hooks do not see. Re-exported straight from the SDK -- there is no
 * scrubbing to do here that `beforeSend` above does not already do.
 */
export const onRequestError = Sentry.captureRequestError
