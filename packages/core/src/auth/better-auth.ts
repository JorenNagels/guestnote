import { passkey } from '@better-auth/passkey'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { nextCookies } from 'better-auth/next-js'
import { emailOTP } from 'better-auth/plugins/email-otp'
import { AUTH_POLICY } from './policy.ts'
import type { AuthFailure, AuthResult, CodeRequested, Session, Verified } from './types.ts'

/**
 * **The only file in this repository allowed to import Better Auth.**
 *
 * `biome.json` restricts the import to this path, and
 * `packages/db/src/no-unsafe-imports.test.ts` enforces the same rule independently -- a
 * lint rule can be silenced with an inline comment, a test cannot.
 *
 * research/07-auth-and-tenancy.md section 1 is what that buys: with the seam intact,
 * moving off Better Auth is "a one-weekend reversal in either direction". It only stays
 * true while this file is the whole surface, so everything below returns plain data and
 * leaks no library types upward.
 *
 * ## Configuration is arguments, never `process.env`
 *
 * Same rule `hosts.ts` states for itself. `apps/web/src/env.ts` is the single env reader,
 * and it composes this in `apps/web/src/lib/auth.ts`. A module-level env read here would
 * make the package unusable from a script, a test or a migration runner.
 */

export type AuthConfig = {
  /** A Drizzle instance. Typed loosely on purpose: this package does not depend on @guestnote/db. */
  // biome-ignore lint/suspicious/noExplicitAny: the adapter's own signature is Record<string, any>.
  db: any
  /** The Drizzle schema namespace. Table keys are plural, which `usePlural` below expects. */
  schema: Record<string, unknown>
  /** Signing key for sessions and tokens. */
  secret: string
  /** Absolute origin this instance answers on, e.g. `https://app.guestnote.be`. */
  baseURL: string
  /**
   * The WebAuthn Relying Party ID. **`app.guestnote.be`, never `guestnote.be`.**
   *
   * A passkey scoped to a registrable suffix is usable by every subdomain beneath it, and
   * PH4 serves per-tenant wedding sites on `<slug>.guestnote.be` -- script there could
   * request assertions for planner credentials. `rp.id` is hashed into the authenticator
   * at creation and can never be edited afterwards, so a change here invalidates every
   * passkey in existence. It is the single most consequential value in this file.
   */
  rpID: string
  rpName: string
  /** Where the six-digit code goes. SES is not wired yet; today this logs. */
  sendCode: (args: { email: string; code: string; type: string }) => Promise<void>
  /** uuidv7, from @guestnote/db. See `generateId` below for why this is not optional. */
  newId: () => string
}

export function createBetterAuthProvider(config: AuthConfig) {
  const auth = betterAuth({
    secret: config.secret,
    baseURL: config.baseURL,

    database: drizzleAdapter(config.db, {
      provider: 'pg',
      schema: config.schema,
      // Better Auth's models are singular (`user`, `session`); every table in this repo
      // is plural. One flag rather than five modelName overrides.
      usePlural: true,
      // Neon's pooler is transaction-mode. Letting the adapter open its own multi
      // statement transactions across a pooled connection is the failure
      // docs/adr/0001-rls-through-neon-pooler.md exists to document; the operations here
      // are single-statement anyway.
      transaction: false,
    }),

    advanced: {
      /**
       * Names the session cookie `__Host-guestnote.session_token`, exactly.
       *
       * The `__Host-` prefix is not decoration: a browser refuses to accept a cookie with
       * that prefix unless it is Secure, `Path=/`, and carries NO `Domain` attribute --
       * which pins it to exactly one host. `proxy.ts` rests a security argument on this,
       * noting that reaching the origin with a spoofed `x-forwarded-host` "lands on the
       * app branch and gets the login page, because the session cookie is `__Host-`
       * prefixed". Better Auth's default name has no prefix, so that argument was
       * describing something that was not true until this line existed.
       *
       * Set through `cookies` rather than `cookiePrefix`, and that distinction is the
       * whole point: with `useSecureCookies` on, `cookiePrefix` gets `__Secure-` glued in
       * FRONT of it, producing `__Secure-__Host-guestnote.session_token`. That name does
       * not START with `__Host-`, so a browser applies only the weaker `__Secure-` rules
       * -- Secure required, `Domain` still permitted -- and the host-pinning the comment
       * above claims silently is not there. Measured, not assumed. An explicit `name`
       * overrides the prefix entirely.
       *
       * It is also why sign-in on the apex could never work: the cookie physically
       * cannot be shared with `app.guestnote.be`. See `lib/app-url.ts`.
       */
      cookies: {
        session_token: { name: '__Host-guestnote.session_token' },
      },

      /**
       * Required by the prefix above, and safe locally: `localhost` and every
       * `*.localhost` subdomain are *potentially trustworthy origins*, so a browser
       * accepts Secure cookies from them over plain http. `apps/web/src/env.ts` chose
       * `app.localhost` for development on exactly this basis, so dev and production
       * cookie handling stay identical instead of diverging behind a NODE_ENV branch.
       */
      useSecureCookies: false,

      /**
       * `secure` set as an ATTRIBUTE rather than via `useSecureCookies`, because that
       * flag also glues `__Secure-` onto the front of the name -- measured: it does so
       * even when an explicit `name` is given, which the option docs imply it should not.
       * A browser rejects a `__Host-` cookie outright unless it is Secure, so the
       * attribute is mandatory; the flag is not.
       */
      defaultCookieAttributes: { secure: true, sameSite: 'lax', path: '/' },

      database: {
        /**
         * uuid, not Better Auth's default `text`.
         *
         * Every policy in 0001_rls.sql casts `current_setting('app.user_id', true)::uuid`,
         * and six columns already hold a uuid foreign key to `users.id`. Getting this
         * wrong is a column-type migration across all of them after real users exist,
         * which is exactly what packages/db/src/schema/auth.ts warns about.
         *
         * uuidv7 rather than v4 so the primary key is time-ordered and index inserts stay
         * local -- the same choice packages/db makes everywhere else.
         */
        generateId: () => config.newId(),
      },
    },

    // No password, ever. There is no reset flow to build, no hashing parameters to get
    // wrong, and nothing to leak.
    emailAndPassword: { enabled: false },

    // No social providers: research/07-auth-and-tenancy.md rules them out because an
    // identity sub-processor would undo the EU-residency argument for self-hosting.
    socialProviders: {},

    session: {
      expiresIn: AUTH_POLICY.sessionTtlSeconds,
      updateAge: AUTH_POLICY.sessionRefreshSeconds,
    },

    /**
     * Both halves of this are corrections to a default, not decoration.
     *
     * The installed `@better-auth/core` documents them: *"By default, rate limiting is only
     * enabled on production"*, and `storage` defaults to `"memory"`. So before this block there
     * was **no limiter at all outside production**, and inside it one limiter per Lambda
     * container -- which counts a handful of requests before a cold start forgets them.
     *
     * That was survivable while `sendCode` was a `console.info`. It is not now: each request
     * past the limit is a real email, against a sandbox ceiling of 200 a day and 1 a second, and
     * a loop pointed at the sign-in form would burn the quota for every other user and put the
     * domain's sending reputation at risk. `enabled: true` also means the limiter is exercised
     * in development, so its behaviour is something a developer sees rather than discovers.
     *
     * `storage: 'database'` needs the `rate_limits` table -- `packages/db/src/schema/mail.ts`,
     * whose export is named `rateLimits` because `usePlural` above resolves the model that way.
     *
     * Not set here, and flagged for M1a: `advanced.ipAddress.trustedProxies`. The limiter keys
     * on client IP, and the documented behaviour with that option unset is to trust "only
     * single-value IP headers". Behind CloudFront `x-forwarded-for` is a chain, so until it is
     * configured every request will key to the same value and this table becomes decorative.
     */
    rateLimit: { enabled: true, storage: 'database' },

    plugins: [
      emailOTP({
        otpLength: AUTH_POLICY.codeLength,
        expiresIn: AUTH_POLICY.codeTtlSeconds,
        allowedAttempts: AUTH_POLICY.maxCodeAttempts,
        /**
         * Hashed, not the plugin's `"plain"` default.
         *
         * `verifications.value` is where the live code sits (see schema/auth.ts). Storing it
         * readable was defensible while the code only ever reached a developer's terminal; it
         * is not now that it is a credential in transit to a real inbox, because anything that
         * can read one row of that table gets a five-minute window into any account.
         *
         * Safe to change: the plugin's own types document that `resendStrategy` "falls back to
         * `rotate` when OTP is hashed", and `rotate` is already the default -- so "send me a new
         * code" keeps working and simply issues a new one rather than resending the old.
         */
        storeOTP: 'hashed',
        // First verification creates the account. That IS the registration flow for this
        // product -- there is no self-serve signup, and a planner's staff arrive by
        // invitation, so the only accounts that can exist are ones someone asked for.
        disableSignUp: false,
        async sendVerificationOTP({ email, otp, type }) {
          await config.sendCode({ email, code: otp, type })
        },
      }),

      passkey({
        rpID: config.rpID,
        rpName: config.rpName,
        origin: config.baseURL,
      }),

      // MUST be last. It lets Server Actions set the session cookie; without it the
      // cookie is only ever written by the route handler, and `submitCode` would verify
      // successfully and hand back nothing.
      nextCookies(),
    ],
  })

  return {
    handler: auth.handler,

    async requestEmailCode(input: { email: string }): Promise<AuthResult<CodeRequested>> {
      try {
        await auth.api.sendVerificationOTP({ body: { email: input.email, type: 'sign-in' } })
        return {
          ok: true,
          value: {
            resendAfterSeconds: AUTH_POLICY.resendCooldownSeconds,
            expiresInSeconds: AUTH_POLICY.codeTtlSeconds,
          },
        }
      } catch (error) {
        return { ok: false, failure: classify(error) }
      }
    },

    async verifyEmailCode(input: {
      email: string
      code: string
      headers: Headers
    }): Promise<AuthResult<Verified>> {
      try {
        // `nextCookies()` is what turns this into a Set-Cookie on the Server Action's
        // response. Without that plugin the sign-in succeeds and the browser is handed
        // nothing, which looks exactly like the flow working and the session vanishing.
        const result = await auth.api.signInEmailOTP({
          body: { email: input.email, otp: input.code },
          headers: input.headers,
        })
        return {
          ok: true,
          value: { userId: result.user.id, needsName: !result.user.name },
        }
      } catch (error) {
        return { ok: false, failure: classify(error) }
      }
    },

    async getSession(headers: Headers): Promise<Session | null> {
      const result = await auth.api.getSession({ headers })
      if (!result) return null
      return {
        userId: result.user.id,
        email: result.user.email,
        name: result.user.name || null,
        // Org resolution is not Better Auth's business -- research/07 section 2 keeps
        // `organizations` and `org_members` hand-rolled precisely so authorization never
        // reads from the session. It stays null until the shell resolves it from the URL
        // joined against the membership tables.
        lastOrgId: null,
      }
    },

    async signOut(headers: Headers): Promise<void> {
      await auth.api.signOut({ headers })
    },
  }
}

/**
 * Better Auth's failures, in this codebase's vocabulary.
 *
 * The three codes come from the plugin's own `EMAIL_OTP_ERROR_CODES`, read off the
 * installed 1.7.1 rather than remembered. The distinction between them is not cosmetic:
 * the surface brief requires "expired" and "invalid" to be different sentences, because
 * one means ask for a new code and the other means look again.
 *
 * Read structurally rather than by importing `APIError`, so the library's types stay
 * inside this file -- which is the entire point of the seam.
 */
function classify(error: unknown): AuthFailure {
  const code = (error as { body?: { code?: string } })?.body?.code
  const status = (error as { status?: number | string })?.status

  switch (code) {
    case 'OTP_EXPIRED':
      return 'code_expired'
    case 'INVALID_OTP':
      return 'code_wrong'
    case 'TOO_MANY_ATTEMPTS':
      return 'code_spent'
    default:
      // Better Auth's own limiter answers 429. Everything else is genuinely unknown, and
      // saying so is better than guessing at a cause the visitor could act on.
      return status === 429 || status === 'TOO_MANY_REQUESTS' ? 'rate_limited' : 'unavailable'
  }
}

export type BetterAuthProvider = ReturnType<typeof createBetterAuthProvider>
