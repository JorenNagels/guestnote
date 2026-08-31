import 'server-only'
import { z } from 'zod'

/**
 * The only place in this app that reads `process.env`.
 *
 * Two reasons that rule is worth enforcing rather than merely preferring:
 *
 *  1. research/05-architecture.md section 9's promise that the hosting choice reverses
 *     in a weekend only holds while nothing in app code is adapter-aware. Environment
 *     injection is the one thing every host does differently, so it gets exactly one
 *     seam.
 *  2. In deployed environments these arrive from SSM Parameter Store SecureStrings at
 *     `/guestnote/<env>/*`. A second reader is a second thing to wire up, and the one
 *     that gets forgotten.
 *
 * `import 'server-only'` makes importing this from a Client Component a build error
 * rather than a leaked secret.
 */

const schema = z.object({
  /**
   * The domain host resolution is performed against, port stripped.
   *
   * Defaults to `guestnote.localhost` so a fresh clone runs `npm run dev` with no
   * configuration: `app.guestnote.localhost:3000` and
   * `els-en-jan.guestnote.localhost:3000` then take exactly the branches the deployed app
   * takes. Chrome, Edge and Firefox resolve any `*.localhost` to loopback with no DNS entry
   * (RFC 6761), and -- the reason it beats a `.test` domain -- every `*.localhost` name is a
   * *potentially trustworthy origin*, so `__Host-` prefixed cookies work over plain http.
   *
   * ## Why the extra label, added 2026-08-19
   *
   * **This said plain `localhost` until 2026-08-19, on the stated grounds that it "keeps dev
   * and production cookie handling identical". That claim was half true, and the wrong
   * half cost real time.** The `Secure` / `__Host-` part of it holds. Same-site does not:
   * SameSite is computed on the registrable domain, `localhost` is its own public suffix, so
   * `localhost` and `app.localhost` are **cross-site** to a browser. A `SameSite=Lax` cookie
   * therefore does not travel between them -- while in production `guestnote.be` and
   * `app.guestnote.be` share the registrable domain `guestnote.be` and it does.
   *
   * With the extra label, `guestnote.localhost` and `app.guestnote.localhost` share the
   * registrable domain `guestnote.localhost`, and dev finally matches production on both
   * counts rather than one. That is what makes the apex's signed-in probe testable locally
   * at all -- see `app/api/session-hint/route.ts`.
   *
   * The cost is longer URLs to type, and that any passkey or session created against
   * `app.localhost` stops resolving. Both are development-only and both are worth it.
   *
   * If a deployed environment forgets to set this, every host fails to match and the
   * app 404s everything. That is the intended failure: a visible outage, not the
   * marketing site quietly served under a customer's name.
   */
  GUESTNOTE_ROOT_DOMAIN: z.string().min(1).default('guestnote.localhost'),

  /**
   * The single label the dashboard and couple portal answer on. `pro` permanently
   * redirects here. Everything else below the root domain is a tenant slug or a
   * reserved word.
   */
  GUESTNOTE_APP_SUBDOMAIN: z.string().min(1).default('app'),

  /**
   * The port `next dev` is listening on, for building an absolute local origin.
   *
   * Exists because `lib/auth.ts`'s `origin()` hard-coded `:3000` and therefore LIED the
   * moment the dev server ran anywhere else -- which happens routinely, since `next dev`
   * silently picks the next free port when 3000 is taken. Better Auth uses that origin as
   * its `baseURL` and the passkey plugin uses it verbatim as the WebAuthn `origin`, so a
   * wrong port makes passkey registration fail an origin check with no useful message.
   *
   * `PORT` and not a `GUESTNOTE_`-prefixed name: it is the variable Next itself honours, so
   * `PORT=3001 next dev` makes the server and this agree by construction rather than by
   * remembering to set two things. Ignored in production, where the origin is https on the
   * default port.
   *
   * **The auto-increment case works for a reason worth naming**, because the sentence above
   * does not cover it: when 3000 is taken nobody sets `PORT`, so on that reasoning this
   * would still default to 3000 and still lie. It does not, because `next dev` writes the
   * port it actually BOUND back into `process.env.PORT` after listening -- see
   * `next/dist/server/lib/start-server.js:295` -- `process.env.PORT = port + ''`, commented
   * "Store the selected port to: expose it to render workers" -- verified on 16.3.1. So
   * parsing on first request sees 3001 even though no shell set it. The corollary is the
   * thing to remember: do not move this parse to build time to speed up boot, because at
   * build time the port has not been bound and the value is wrong.
   */
  //
  // `.catch(3000)` and not just `.default(3000)`: an exported-but-empty `PORT=` -- which a CI
  // runner or a stray `export PORT=` leaves behind routinely -- coerces to `0`, fails
  // `.positive()`, and would take the entire app down at import with a message about copying
  // `.env.example`. A malformed dev-only port must not be fatal; a wrong one is a bad local
  // origin, which is recoverable, and `catch` is the difference between the two.
  PORT: z.coerce.number().int().positive().catch(3000),

  /**
   * Neon, POOLED (the `-pooler` host), connected as `app_user`.
   *
   * **Optional here on purpose, and validated lazily in lib/db.ts instead.** `next build`
   * evaluates route modules while collecting page data, so a required value would make
   * DATABASE_URL a *build-time* dependency -- breaking CI, container builds and M1a's CDK
   * bundling, none of which should need database credentials to compile TypeScript.
   *
   * The cost is that a missing value surfaces on the first request rather than at build.
   * That is precisely what /api/health exists to catch, and `createPool` already throws a
   * message naming the pooled host.
   */
  DATABASE_URL: z.string().optional(),

  /**
   * Signs sessions and one-time codes.
   *
   * Optional here and validated lazily in `lib/auth.ts`, for the same reason
   * DATABASE_URL is: `next build` evaluates route modules while collecting page data, so
   * a required value would make a secret a *build-time* dependency and break CI, container
   * builds and M1a's CDK bundling -- none of which should need credentials to compile
   * TypeScript.
   *
   * In development `lib/auth.ts` substitutes a fixed local value so a fresh clone runs
   * with no setup. It refuses to do that anywhere else.
   */
  BETTER_AUTH_SECRET: z.string().optional(),

  /**
   * The Google OAuth client, for the "Continue with Google" sign-in button.
   *
   * **Both optional, and the button only appears when both are set** (`lib/auth.ts` passes
   * `google` to the seam only then). That is the same "safe by omission" rule
   * `GUESTNOTE_MAIL_TRANSPORT` follows: an environment that forgets these gets a login form
   * with no Google button, never a button that 500s on click. Social sign-in itself was a
   * 2026-08-29 reversal of research/07's no-OAuth decision -- see that file's "Social sign-in
   * added" note for the cost.
   *
   * Optional here (not required) for the same reason `BETTER_AUTH_SECRET` is: `next build`
   * evaluates route modules while collecting page data, and a required value would make these
   * a build-time dependency. Deployed values come from SSM at `/guestnote/<env>/*`.
   */
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),

  /**
   * Sentry's ingest endpoint. **Optional, and unset means error reporting is off.**
   *
   * The same safe-by-omission rule as the Google pair above: an environment that forgets
   * this reports nothing, rather than crashing on boot or silently pointing at whatever
   * project it can reach. `src/instrumentation.ts` is the only reader.
   *
   * ## Server-side only, and NOT `NEXT_PUBLIC_`
   *
   * A DSN is a write-only ingest URL and is safe to publish -- it is in the client bundle of
   * every site that reports browser errors. This one is deliberately not, for two reasons
   * that have nothing to do with secrecy:
   *
   *   1. **Invariant 6.** A browser file cannot import this module (`server-only`), so a
   *      client SDK would have to read `process.env` itself, and this app has exactly one
   *      env reader.
   *   2. **The login bundle.** `components/auth/copy.ts` refuses to ship a message catalogue
   *      to this surface because it is "the first thing an unauthenticated visitor downloads
   *      on a phone with one bar of signal at a venue". The Sentry browser SDK is tens of
   *      kilobytes against that same argument, and it would be inconsistent to spend it here
   *      after refusing to spend it there.
   *
   * The cost is that a browser-side exception -- a WebAuthn ceremony throwing in an OS we
   * have never tested on -- is invisible. Accepted for now because the failures being chased
   * are server-side, and revisitable: it is a client config file and a `NEXT_PUBLIC_` twin,
   * not a rearrangement.
   *
   * ## The organisation is on Sentry's EU region, and that is not reversible
   *
   * `de.sentry.io`, hosted in Germany. research/07 section 1's EU-residency argument for
   * self-hosting auth is only true while nothing leaves, and an error tracker sees stack
   * frames from the sign-in path. The region is chosen at organisation creation and **cannot
   * be changed afterwards** -- switching means a new organisation and a new DSN.
   *
   * Sentry is a data sub-processor either way; that cost is accepted, and it is why
   * `lib/scrub.ts` runs in-process rather than trusting Sentry's own field-name defaults.
   */
  SENTRY_DSN: z.string().optional(),

  /**
   * Which mail transport to build: `ses` sends, `console` renders to disk and prints.
   *
   * **Optional, and resolved in `lib/mailer.ts` rather than defaulted here**, because the
   * default is not a constant -- it is `console` in development and `ses` everywhere else,
   * exactly like `secretFor()`'s `DEV_SECRET`. A `.default('console')` on this line would be
   * the dangerous version: a deployed environment that forgot to set the variable would fall
   * back to writing sign-in codes into CloudWatch and never sending them, which looks like
   * working software right up until a customer cannot sign in.
   *
   * So the safe value is the one you get by omission, and `console` has to be asked for.
   */
  GUESTNOTE_MAIL_TRANSPORT: z.enum(['ses', 'console']).optional(),

  /**
   * The region SES, the identity and the configuration set all live in.
   *
   * Defaulted rather than required because the Lambda runtime injects `AWS_REGION` on every
   * invocation and `.envrc` exports it locally, so in practice this is never unset -- but a
   * wrong region fails in a confusing way (an unverified-identity error against an account
   * that has verified the identity, in another region), which is worth naming here.
   *
   * `eu-central-1` is not incidental. ADR 0002 verified `guestnote.be` there, Neon is in
   * `aws-eu-central-1`, and the EU-residency argument in research/07 section 1 for
   * self-hosting auth is only true while nothing leaves.
   */
  AWS_REGION: z.string().min(1).default('eu-central-1'),
})

const parsed = schema.safeParse(process.env)

if (!parsed.success) {
  const detail = parsed.error.issues
    .map((issue) => `  ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n')
  throw new Error(
    `Invalid environment for @guestnote/web:\n${detail}\n\n` +
      'Copy .env.example to .env.local and fill it in. Secrets in deployed ' +
      'environments come from SSM at /guestnote/<env>/*, never from a committed file.',
  )
}

export const env = {
  rootDomain: parsed.data.GUESTNOTE_ROOT_DOMAIN,
  appSubdomain: parsed.data.GUESTNOTE_APP_SUBDOMAIN,
  databaseUrl: parsed.data.DATABASE_URL ?? '',
  betterAuthSecret: parsed.data.BETTER_AUTH_SECRET ?? '',
  googleClientId: parsed.data.GOOGLE_CLIENT_ID ?? '',
  googleClientSecret: parsed.data.GOOGLE_CLIENT_SECRET ?? '',
  // Left `undefined` rather than coerced to '', like `mailTransport` below: `sentryDsn`
  // being absent is what turns reporting off, and an empty string is a value that would
  // have the SDK initialise against nothing.
  sentryDsn: parsed.data.SENTRY_DSN,
  // Left as `undefined` rather than coerced to '': `lib/mailer.ts` distinguishes "not set,
  // so decide from NODE_ENV" from "set to something", and an empty string would collapse
  // that distinction into the branch with the worse failure mode.
  mailTransport: parsed.data.GUESTNOTE_MAIL_TRANSPORT,
  awsRegion: parsed.data.AWS_REGION,
  devPort: parsed.data.PORT,
} as const
