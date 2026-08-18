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
} as const
