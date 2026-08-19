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
   * Defaults to `localhost` so a fresh clone runs `npm run dev` with no configuration:
   * `app.localhost:3000` and `els-en-jan.localhost:3000` then take exactly the branches
   * the deployed app takes. Chrome, Edge and Firefox resolve any `*.localhost` to
   * loopback with no DNS entry (RFC 6761), and -- the reason it beats a `.test` domain
   * -- `localhost` is a *potentially trustworthy origin*, so `__Host-` prefixed cookies
   * work over plain http. That keeps dev and production cookie handling identical,
   * which matters once Better Auth lands.
   *
   * If a deployed environment forgets to set this, every host fails to match and the
   * app 404s everything. That is the intended failure: a visible outage, not the
   * marketing site quietly served under a customer's name.
   */
  GUESTNOTE_ROOT_DOMAIN: z.string().min(1).default('localhost'),

  /**
   * The single label the dashboard and couple portal answer on. `pro` permanently
   * redirects here. Everything else below the root domain is a tenant slug or a
   * reserved word.
   */
  GUESTNOTE_APP_SUBDOMAIN: z.string().min(1).default('app'),

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
  // Left as `undefined` rather than coerced to '': `lib/mailer.ts` distinguishes "not set,
  // so decide from NODE_ENV" from "set to something", and an empty string would collapse
  // that distinction into the branch with the worse failure mode.
  mailTransport: parsed.data.GUESTNOTE_MAIL_TRANSPORT,
  awsRegion: parsed.data.AWS_REGION,
} as const
