import 'server-only'
import { createAuth } from '@guestnote/core/auth'
import { newId, schema } from '@guestnote/db'
import { env } from '../env.ts'
import { getDb } from './db.ts'

/**
 * The app's single auth instance.
 *
 * `packages/core/auth` takes its configuration as arguments -- the rule `hosts.ts` states
 * for that package -- so this is where env, the database and the schema are joined to it.
 * Everything else in the app imports `getAuth()`, never Better Auth.
 *
 * Memoised for the same reason `getDb()` is: on Lambda the module scope survives between
 * invocations, so a warm container reuses one instance instead of rebuilding the whole
 * plugin chain per request. Deferred rather than module-scope for the same reason too --
 * `next build` imports route modules while collecting page data, and an eager construction
 * would turn a secret into a build-time dependency.
 */
let cached: ReturnType<typeof createAuth> | undefined

/**
 * A fixed, obviously-fake secret for local development.
 *
 * Committed on purpose. It only ever signs sessions issued by a developer's own machine,
 * and the alternative -- every clone needing a generated secret before `npm run dev` does
 * anything -- costs more than it protects. `secretFor()` refuses to use it anywhere but
 * development, so it cannot leak into a deployed environment by omission.
 */
const DEV_SECRET = 'guestnote-development-only-not-a-secret-0000000000'

function secretFor(): string {
  if (env.betterAuthSecret) return env.betterAuthSecret
  if (process.env.NODE_ENV === 'development') return DEV_SECRET
  throw new Error(
    'BETTER_AUTH_SECRET is not set. It signs sessions and one-time codes, so a missing ' +
      'value would silently invalidate every session on the next deploy. In deployed ' +
      'environments it comes from SSM at /guestnote/<env>/*. See .env.example.',
  )
}

/**
 * The dashboard host, as an absolute origin.
 *
 * Derived from the same two values `proxy.ts` resolves hosts with, rather than read from
 * its own environment variable, so there is one answer to "what host is the app on" and
 * not two that can disagree. `lib/app-url.ts` derives its link from the same pair.
 */
function origin(): string {
  const host = `${env.appSubdomain}.${env.rootDomain}`
  const isLocal = env.rootDomain === 'localhost' || env.rootDomain.endsWith('.localhost')
  return isLocal ? `http://${host}:3000` : `https://${host}`
}

export function getAuth() {
  if (cached) return cached

  cached = createAuth({
    db: getDb(),
    schema,
    secret: secretFor(),
    baseURL: origin(),
    /**
     * `app.guestnote.be` in production, `app.localhost` locally -- and never the apex in
     * either. A passkey scoped to a registrable suffix is usable by every subdomain
     * beneath it, and PH4 puts per-tenant wedding sites there. `rp.id` is hashed into the
     * authenticator at creation and can never be changed, so this value is permanent from
     * the first passkey onward.
     */
    rpID: `${env.appSubdomain}.${env.rootDomain}`,
    rpName: 'Guestnote',
    newId,

    /**
     * SES is not wired yet, deliberately -- the mail pipeline is its own piece of work.
     * Until it is, the code goes to the server console, which is the only channel that
     * exists. Loud on purpose: a code you cannot find is a dead end.
     */
    async sendCode({ email, code, type }) {
      console.info(`\n  [guestnote] ${type} code for ${email}: ${code}\n`)
    },
  })
  return cached
}
