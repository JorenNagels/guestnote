import * as Sentry from '@sentry/nextjs'
import { env } from './env.ts'
import { setFeedbackReporter, setReporter } from './lib/observability.ts'
import { scrubEvent, stripFeedbackRequest } from './lib/scrub.ts'

/**
 * Server-side error reporting. Next calls `register()` once per runtime, before any request.
 *
 * **This is the only file in the repo that imports `@sentry/nextjs`**, which is the same
 * one-file-per-provider rule invariant 5 states for Better Auth and the AWS SDK, applied to
 * a third provider. `lib/observability.ts` does not import it: the vendor is pushed in
 * through `setReporter()` below, precisely so nothing a component can reach ever pulls the
 * SDK into its module graph.
 *
 * That sentence used to read "this file and `instrumentation-client.ts`", **and no such file
 * exists** -- `env.ts` argues deliberately that the browser SDK is not shipped, so the
 * comment named a file whose existence would have contradicted its neighbour. It also
 * claimed `observability.ts` wrapped `captureException`, which stopped being true when that
 * file was rewritten around the reporter slot. Corrected 2026-09-01 after `tenancy-auditor`
 * pointed out that the rule was asserted here and enforced nowhere: it is in `biome.json`
 * and `packages/db/src/no-unsafe-imports.test.ts` now, both, for the reason that file gives
 * -- a lint rule can be silenced inline and a test cannot.
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

  /**
   * Hand `lib/observability.ts` a Sentry-backed reporter, rather than letting it import the
   * SDK itself.
   *
   * That file explains why the direction matters: `@sentry/nextjs` drags a webpack bundler
   * plugin into its module graph, so any app module importing it breaks every test that
   * transitively reaches it. Pushing the vendor in from here -- the one file Next loads on
   * the server and no test loads at all -- keeps `@sentry/nextjs` reachable from exactly one
   * place, which is what invariant 5 asks of a provider library.
   */
  setReporter((message, context) => {
    Sentry.captureException(new Error(message), {
      // `warning`, not `error`. Every one of these is a path the product handles
      // gracefully; marking them `error` would train whoever is watching to ignore the word.
      level: 'warning',
      // Grouped by message rather than the synthetic stack, which is this callback every
      // time and would collapse unrelated failures into a single issue.
      fingerprint: [message],
      extra: context,
    })
  })

  /**
   * "Report a problem" (spec 0005) lands in Sentry's User Feedback inbox, which has the
   * resolved/unresolved state a bug list needs and emails on a new item -- rejected: GitHub
   * Issues, because the repository is public and every report would be published with the
   * planner's address on it. Server-side `captureFeedback`, so no browser SDK is shipped;
   * `env.ts` argues why that matters.
   *
   * The reporter's name and email go on the feedback, not on the event's `user`: they are what
   * the planner typed into a form addressed to us, which is not the `sendDefaultPii` default
   * above changing its mind.
   */
  // Registered after `init`, so it runs after the request integration that attaches the
  // cookie-carrying request: client processors run in registration order. `lib/scrub.ts`
  // says why feedback events need this and `beforeSend` does not reach them.
  Sentry.getClient()?.addEventProcessor(stripFeedbackRequest)

  setFeedbackReporter(async (feedback) => {
    Sentry.captureFeedback(
      {
        message: feedback.message,
        name: feedback.name,
        email: feedback.email,
        ...(feedback.tags.page ? { url: feedback.tags.page } : {}),
        tags: { ...feedback.tags, category: feedback.category },
      },
      feedback.attachment ? { attachments: [feedback.attachment] } : undefined,
    )
    // Flushed before the Server Function answers, not left to the SDK's background queue:
    // Lambda freezes the process the moment the response is sent, and a queued envelope then
    // leaves on the next invocation or never. Two seconds bounds how long "Send" can hang on a
    // slow ingest; `false` means it had not left by then, and the planner is told to retry.
    // `true` means the queue drained, NOT that Sentry accepted it: measured 2026-09-24 in `next dev`
    // against an unroutable DSN, which still resolved `true`. A rejected report is lost without a word;
    // the planner has the email thread to fall back on.
    return Sentry.flush(2000)
  })
}

/**
 * Next 16 calls this for errors thrown in a nested React Server Component render, which the
 * ordinary error hooks do not see. Re-exported straight from the SDK -- there is no
 * scrubbing to do here that `beforeSend` above does not already do.
 */
export const onRequestError = Sentry.captureRequestError
