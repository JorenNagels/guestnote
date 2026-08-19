import 'server-only'
import { createAuth } from '@guestnote/core/auth'
import { newId, schema } from '@guestnote/db'
import { cookies } from 'next/headers'
import { env } from '../env.ts'
import { getDb } from './db.ts'
import { DEFAULT_LOCALE, LOCALE_COOKIE } from './locales.ts'
import { sendSignInCode } from './mailer.ts'

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
     * The code, by email, through `packages/email`.
     *
     * ## Awaited, against the plugin's own advice
     *
     * `better-auth`'s `emailOTP` types say "it is recommended to not await the email sending to
     * avoid timing attacks" and to use `waitUntil` on serverless. Both are wrong here, and
     * deliberately so:
     *
     *   - The attack that guards against is user enumeration. `disableSignUp: false` means a
     *     code is sent whether or not the address has an account, so there is no branch for the
     *     latency to reveal.
     *   - `lib/db.ts` states the opposite rule for this runtime: "no timers, nothing that
     *     assumes the process keeps running after the response." Next 16's `after()` needs the
     *     adapter to supply `waitUntil`, and OpenNext is deferred to M1a.
     *
     * And awaiting buys something real: a throw here surfaces through `classify()` in
     * packages/core as `AuthFailure: 'unavailable'`, so a visitor is told the request failed
     * instead of being sent to a screen that asks for a code no inbox will ever receive.
     *
     * ## Where the locale comes from
     *
     * `cookies()`, read at call time rather than threaded through the seam.
     *
     * The alternative was widening `AuthConfig.sendCode` to carry a locale and passing it down
     * through `requestEmailCode`. That turned out to be the more invasive of the two for no
     * benefit: this function is only ever invoked by Better Auth inside the request that asked
     * for a code -- a Server Function, or the `/api/auth/[...all]` handler -- so it is already
     * in the async context `cookies()` resolves against, and `packages/core/auth`'s types stay
     * exactly as they were. `next/headers` also belongs here rather than in a package.
     *
     * The `catch` is not defensive padding: `next build` imports route modules while collecting
     * page data, where there is no request and `cookies()` throws. Dutch is the right answer in
     * that case for the same reason it is `DEFAULT_LOCALE` -- lib/locales.ts refuses to guess a
     * language from a request, and this is the case with no request at all to guess from.
     */
    async sendCode({ email, code }) {
      let locale: string = DEFAULT_LOCALE
      try {
        locale = (await cookies()).get(LOCALE_COOKIE)?.value ?? DEFAULT_LOCALE
      } catch {
        // No request context. Keep the default rather than fail the send.
      }

      const result = await sendSignInCode({ to: email, code, locale })
      if (!result.ok) {
        // Thrown, not swallowed: `classify()` turns this into a failure the sign-in surface can
        // render. `mail_deliveries` already has the row with the reason by the time we get here.
        throw new Error(`could not send the sign-in code: ${result.failure} -- ${result.detail}`)
      }
    },
  })
  return cached
}
