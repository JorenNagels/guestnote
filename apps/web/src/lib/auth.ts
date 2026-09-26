import 'server-only'
import { createAuth } from '@guestnote/core/auth'
import { acceptInvitationByHash, newId, resolveInvitationByHash, schema } from '@guestnote/db'
import { cookies } from 'next/headers'
import { env } from '../env.ts'
import { seatsChanged } from './billing.ts'
import { getDb } from './db.ts'
import { DEFAULT_LOCALE, LOCALE_COOKIE } from './locales.ts'
import { sendSignInCode } from './mailer.ts'
import { reportSilentFailure } from './observability.ts'

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
 *
 * ## The port was hard-coded to 3000, and that was a real bug
 *
 * `next dev` silently takes the next free port when 3000 is busy, which is the ordinary
 * case on a machine running more than one project -- so this function confidently returned
 * an origin the server was not on. Two things consume it and both break quietly: Better
 * Auth's `baseURL`, and the passkey plugin's `origin`, which WebAuthn compares against the
 * browser's actual origin and rejects with nothing useful to read.
 *
 * Fixed 2026-08-21 by taking the port from `env.devPort`, which reads `PORT` -- the variable
 * `next dev` itself honours, so `PORT=3001 next dev` keeps the two in step without anyone
 * having to remember a second setting. Production is https on the default port, so the port
 * is omitted there rather than defaulted.
 */
function origin(): string {
  const host = `${env.appSubdomain}.${env.rootDomain}`
  const isLocal = env.rootDomain === 'localhost' || env.rootDomain.endsWith('.localhost')
  return isLocal ? `http://${host}:${env.devPort}` : `https://${host}`
}

export function getAuth() {
  if (cached) return cached

  cached = createAuth({
    db: getDb(),
    schema,
    secret: secretFor(),
    baseURL: origin(),
    /**
     * `app.guestnote.be` in production, `app.guestnote.localhost` locally -- and never the apex in
     * either. A passkey scoped to a registrable suffix is usable by every subdomain
     * beneath it, and PH4 puts per-tenant wedding sites there. `rp.id` is hashed into the
     * authenticator at creation and can never be changed, so this value is permanent from
     * the first passkey onward.
     */
    rpID: `${env.appSubdomain}.${env.rootDomain}`,
    rpName: 'Guestnote',
    newId,

    /**
     * Where the seam sends a failure the interface is required not to explain.
     *
     * Passed as a function for the same reason `sendCode` and `newId` are: `packages/core`
     * knows no provider but Better Auth, so Sentry stays on this side of the seam. See
     * `lib/observability.ts` for what it does and why the silence needed breaking.
     */
    report: reportSilentFailure,

    /**
     * The Google OAuth client, passed only when BOTH halves are set.
     *
     * `env.ts` keeps these optional so a `next build` needs no credentials; the seam keeps
     * `socialProviders` empty when `google` is undefined. Composing the object here -- rather
     * than always passing `{ clientId: env.googleClientId, ... }` with empty strings -- is
     * what makes "forgot to configure Google" resolve to "no button" instead of "a button
     * that fails an OAuth handshake". Same shape as `secretFor()`'s dev fallback: the value
     * you get by omission is the safe one.
     */
    ...(env.googleClientId && env.googleClientSecret
      ? { google: { clientId: env.googleClientId, clientSecret: env.googleClientSecret } }
      : {}),

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

    /**
     * The database half of invitations, over `resolve_invitation` and `accept_invitation`
     * (migration 0007). Neither touches a table from here: each is one call to a SECURITY
     * DEFINER function, which is why this is not a third unscoped writer in `lib/db.ts`.
     * The seam hashes the token first, so what arrives here is already the hash.
     */
    invitations: {
      async resolve(tokenHash) {
        const r = await resolveInvitationByHash(getDb(), tokenHash)
        return (
          r && {
            weddingId: r.weddingId,
            email: r.email,
            role: r.role,
            orgName: r.orgName,
            inviterName: r.inviterName,
            status: r.status,
          }
        )
      },
      async accept(tokenHash, userId) {
        const r = await acceptInvitationByHash(getDb(), tokenHash, userId)
        if (r.outcome !== 'accepted') return r
        // A planner joined: the seat count moved (spec 0005). A no-op while billing is off.
        await seatsChanged(r.orgId, userId)
        return { outcome: 'accepted', role: r.role }
      },
    },
  })
  return cached
}
