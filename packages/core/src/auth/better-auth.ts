import { passkey } from '@better-auth/passkey'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { nextCookies } from 'better-auth/next-js'
import { emailOTP } from 'better-auth/plugins/email-otp'
import { AUTH_POLICY } from './policy.ts'
import type {
  AuthFailure,
  AuthResult,
  CodeRequested,
  PasskeyAssertion,
  PasskeyCreationOptions,
  PasskeyRegistration,
  PasskeyRequestOptions,
  Session,
  Verified,
} from './types.ts'

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
  /**
   * The Google OAuth client, for the "Continue with Google" sign-in.
   *
   * **Optional, and absent by default.** When it is undefined `socialProviders` stays `{}`
   * and nothing about the OAuth flow is reachable -- `apps/web/src/lib/auth.ts` only passes
   * it when both `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set, so an environment
   * that forgets them gets a login form with no Google button rather than one that fails on
   * click.
   *
   * Social sign-in was ruled out in research/07 (an identity sub-processor on the DPA); that
   * was reversed on a product call 2026-08-29 -- see that file's "Social sign-in added" note.
   */
  google?: { clientId: string; clientSecret: string }

  /**
   * Where a failure the *interface* must not explain goes instead.
   *
   * The sign-in surface renders every passkey failure as nothing, and `actions.ts` narrows
   * the reason to one boolean before it can reach a client. Both are deliberate. Together
   * they meant that when enrollment failed on staging for eleven days, `passkeys` stayed
   * empty and nothing anywhere said why (found 2026-08-31). Silence on screen is a decision;
   * silence in the logs was an accident.
   *
   * A **callback**, not an import, for the same reason `sendCode` and `newId` are: this
   * package reads no environment and knows no provider but Better Auth. Handing it a
   * reporter keeps `apps/web/src/lib/observability.ts` -- and therefore Sentry -- on the far
   * side of the seam, so invariant 5 still describes one vendor and not two.
   *
   * Optional, and a no-op when absent: a script, a test or a migration runner constructs
   * this provider without one and reports nothing.
   */
  report?: (message: string, context: Record<string, unknown>) => void
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
       * accepts Secure cookies from them over plain http. `apps/web/src/env.ts` chose a
       * `.localhost` root domain for development on exactly this basis, so dev and
       * production cookie handling stay identical instead of diverging behind a NODE_ENV
       * branch.
       *
       * That sentence used to name `app.localhost` specifically and claimed the two
       * environments were identical outright. Only the Secure half was ever true -- plain
       * `localhost` is its own public suffix, so `localhost` and `app.localhost` are
       * cross-site and a `SameSite=Lax` cookie will not travel between them. `env.ts`
       * carries the measurement and the fix (a `guestnote.localhost` root domain, 2026-08-19).
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

    /**
     * One social provider: Google, and only when `config.google` was supplied.
     *
     * research/07-auth-and-tenancy.md originally ruled OAuth out entirely -- an identity
     * sub-processor on the DPA, against the EU-residency argument for self-hosting. That was
     * reversed 2026-08-29 on a product call (planners live in Google Workspace; a recognised
     * button lowers first-login drop-off on an invite-only tool). See that file's "Social
     * sign-in added" note for the accepted cost.
     *
     * Built conditionally rather than always-on with empty strings: an env that forgets the
     * client id/secret gets `{}` here and no OAuth surface at all, which is the safe value to
     * land on by omission -- the same rule `GUESTNOTE_MAIL_TRANSPORT` follows.
     */
    socialProviders: config.google
      ? { google: { clientId: config.google.clientId, clientSecret: config.google.clientSecret } }
      : {},

    account: {
      /**
       * Encrypt the OAuth tokens at rest, against the plugin's plaintext default.
       *
       * Same argument as `storeOTP: 'hashed'` below: `accounts` rows are written by an
       * unscoped adapter and carry no RLS, so anything that can read one row should not get a
       * usable Google refresh token out of it. We never call a Google API with these, so
       * encryption costs nothing we use.
       */
      encryptOAuthTokens: true,
      accountLinking: {
        enabled: true,
        /**
         * A Google sign-in whose (Google-verified) email matches an existing `users` row --
         * created earlier by an email code -- adopts that row instead of colliding on the
         * unique email. Safe because our only account-creation paths (emailOTP, Google) both
         * prove the address, so the local row is always `emailVerified: true` and the
         * plugin's `requireLocalEmailVerified` gate (default on) holds.
         */
        trustedProviders: ['google'],
      },
    },

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
     *
     * ## The larger caveat, found 2026-08-30: this covers `/api/auth/*` and nothing else
     *
     * The limiter runs inside `router()`'s `onRequest` hook. A **Server Function** calls
     * `auth.api.*` directly and never enters that router, so none of the reasoning above
     * protects the paths this app actually signs people in through -- `requestCode`,
     * `submitCode`, and now `beginPasskeySignIn`, which fires on page load. The sentence
     * about a loop burning the SES quota describes a defence the sign-in surface does not
     * have.
     *
     * Left standing rather than deleted because it is correct about the OAuth callback and
     * the `[...all]` handler, which do go through the router. The fix is its own change --
     * it needs the still-placeholder thresholds in `policy.ts` decided, and
     * `trustedProxies` above settled first, or any limiter keys every visitor to one
     * bucket. docs/specs/0002 "Not in scope" carries the full argument.
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

        /**
         * `required`, against the plugin's `preferred` default -- and this is the one
         * enrollment setting that sign-in depends on.
         *
         * Sign-in here is usernameless: `generatePasskeyAuthenticationOptions` sets
         * `allowCredentials` only when a session already exists, so an unauthenticated
         * assertion can only ever come from a **discoverable** credential. Under
         * `preferred`, an authenticator is free to mint a non-discoverable one -- which
         * enrols successfully, stores a perfectly valid row in `passkeys`, and can then
         * never be offered at sign-in. Neither the visitor nor the server can tell: the
         * autofill sheet simply lists nothing.
         *
         * Rejected: leaving it `preferred` for wider authenticator support. The cost
         * accepted instead is that an authenticator with no resident-key storage now
         * refuses to enrol -- narrow, because the offer is already gated on
         * `platformAuthenticatorAvailable()` in the app and Touch ID, Face ID and Windows
         * Hello all store discoverable credentials.
         *
         * Nothing overrides it any more: `createPasskeyChallenge` used to pass a per-request
         * `authenticatorAttachment: 'platform'`, which the plugin spreads *after* this
         * object, and that pin was removed 2026-08-31 -- see that method's note for why it
         * is the prime suspect for eleven days of enrollment never completing.
         */
        authenticatorSelection: { residentKey: 'required', requireResidentKey: true },
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

    /**
     * Begin "Continue with Google": hand back the URL to send the browser to.
     *
     * Unlike the code and passkey flows, this one is a full-page redirect to Google and
     * back through `/api/auth/callback/google` (the `[...all]` route handler) -- Better Auth
     * sets the session cookie on the callback response, so there is no Server Action cookie
     * to worry about here. This call only mints the outbound URL.
     *
     * Returns just `{ url }` as plain data; no Better Auth type crosses the seam.
     *
     * ## Two failure surfaces, and both have to be quiet
     *
     * A failure *before* the redirect (misconfigured client, provider unreachable) goes
     * through `classify()` here and the caller renders it as nothing -- a Google button that
     * does not navigate, the same posture the passkey outcomes have.
     *
     * A failure *after* the browser has left for Google -- the visitor cancels at the
     * account chooser, or Better Auth's 10-minute state token expires mid-flow -- is
     * handled by the callback route, not by this function. Without `errorCallbackURL` that
     * route bounces to Better Auth's bare `/api/auth/error` page on the dashboard host,
     * which is exactly the unexplained-screen-then-support-email outcome `login/page.tsx`
     * exists to prevent. So `errorURL` (the login page) is passed through as
     * `errorCallbackURL`: a cancelled Google sign-in lands back on the plain sign-in form.
     * `login/page.tsx` reads only `?reason=`, so the `?error=` Better Auth appends is
     * ignored and the visitor simply sees the form again -- "nothing", as intended.
     *
     * ## Not guarded here
     *
     * The button is only *rendered* when `googleAvailable()` is true. This function is a
     * Server Function -- a POST to its own route (CLAUDE.md invariant 7) -- so a direct
     * request with `config.google` unset still reaches it; `auth.api.signInSocial` then
     * throws and `classify` returns `unavailable`, which the caller renders as nothing.
     */
    async startGoogleSignIn(input: {
      callbackURL: string
      errorURL: string
      headers: Headers
    }): Promise<AuthResult<{ url: string }>> {
      try {
        const result = await auth.api.signInSocial({
          body: {
            provider: 'google',
            callbackURL: input.callbackURL,
            errorCallbackURL: input.errorURL,
          },
          headers: input.headers,
        })
        // `url` is optional in the endpoint's return type (it is absent for the id-token
        // and disableRedirect paths, neither of which this uses). Treat a missing url as a
        // failure the caller can swallow rather than handing back an empty string.
        return result.url
          ? { ok: true, value: { url: result.url } }
          : { ok: false, failure: 'unavailable' }
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

    /**
     * Step one of enrollment: the challenge, for `navigator.credentials.create()`.
     *
     * ## It needs a *fresh* session, not merely a session
     *
     * The plugin puts `freshSessionMiddleware` on this endpoint, which refuses a session
     * older than `session.freshAge` -- one day, unset here so the library default stands.
     * That is exactly right for the only caller today, rung 2 of sign-in, which runs
     * seconds after a code was verified. It is also the thing to remember when account
     * settings grows an "add a passkey" button: **that** call site needs a
     * re-authentication step in front of it, not a wider middleware here.
     *
     * ## The attachment is NOT pinned, and that is a correction
     *
     * This passed `authenticatorAttachment: 'platform'` from 2026-08-19 to 2026-08-31, on
     * the argument that the offer is only shown when `platformAuthenticatorAvailable()` said
     * yes and the copy promises a face or a fingerprint on *this* device -- so leaving it
     * unset would also offer a security key and a phone-by-QR flow, a different promise than
     * the one on screen.
     *
     * **Enrollment never once succeeded during that entire window.** `passkeys` was empty on
     * all three Neon branches for eleven days, and the ceremony did not fail -- it never
     * returned at all, so nothing threw and nothing could be reported. The pin was
     * introduced by `12c5ae3`, the same commit that shipped enrollment, which is an exact
     * match for the failure window. The theory, and it is a theory: a password-manager
     * extension patches `navigator.credentials.create` before the browser sees these
     * options, and a request pinned to a device-bound authenticator is one it neither
     * handles nor cleanly declines.
     *
     * Unpinning is the better product call independently of the bug. A synced credential is
     * worth more than a device-bound one to a planner working across a laptop, a phone and a
     * venue iPad, and refusing password managers -- how most people will actually keep a
     * passkey -- to keep one sentence of copy literally true is the wrong trade. The copy is
     * what should move; docs/specs/0002 carries that amendment.
     *
     * Cost accepted: the OS sheet may now offer a security key or a phone by QR where the
     * copy still says face or fingerprint.
     *
     * `userVerification: preferred` and `attestation: none` are the plugin's defaults and
     * are deliberately left alone. **`residentKey` is not** -- the plugin config above sets
     * it to `required`, because sign-in is usernameless and a non-discoverable credential
     * would enrol cleanly here and then never be offerable. This sentence used to list
     * `residentKey: preferred` among the untouched defaults, which was true until sign-in
     * landed; anyone who "restored the default" on its word would reintroduce exactly the
     * invisible failure that override exists to prevent.
     *
     * ## The challenge travels in a cookie
     *
     * The plugin does not return the challenge for the caller to hold; it stores a signed
     * cookie and a `verifications` row, and `verifyPasskeyRegistration` reads both back.
     * So this call's `Set-Cookie` has to reach the browser, which from a Server Function
     * is `nextCookies()`'s job -- and its `after` hook matches every endpoint rather than
     * only the sign-in ones (read off the installed integration, 2026-08-19). Without that
     * plugin enrollment would fail at the second step with "challenge not found", which
     * looks like a browser problem and is not.
     */
    async createPasskeyChallenge(input: {
      headers: Headers
    }): Promise<AuthResult<PasskeyCreationOptions>> {
      try {
        const options = await auth.api.generatePasskeyRegistrationOptions({
          headers: input.headers,
        })
        return { ok: true, value: options }
      } catch (error) {
        // Reported for the same reason step two is: `beginPasskeyEnrollment` drops the
        // reason, so a stale session or an unreachable database here looks exactly like a
        // visitor who declined. `SESSION_NOT_FRESH` is the expected one and it is worth
        // seeing rather than inferring.
        config.report?.('passkey enrollment challenge refused', { reason: reasonOf(error) })
        return { ok: false, failure: classify(error) }
      }
    },

    /**
     * Step two: hand the attestation back and let the library check it.
     *
     * `registration` is attacker-controlled in full and that is fine, because none of it
     * is trusted. The plugin verifies the attestation against the challenge from the
     * signed cookie, checks the origin against `origin` in the plugin config, checks the
     * RP ID hash against `rpID`, and refuses outright if the challenge's stored user id is
     * not the session's. There is no parameter here through which a caller could bind the
     * credential to somebody else's account -- which is why this takes no user id.
     *
     * `createSession` is left unset. The visitor already has the session this endpoint
     * demanded to run at all; minting a second one would silently rotate the cookie in the
     * middle of a redirect.
     */
    async verifyPasskeyRegistration(input: {
      registration: PasskeyRegistration
      headers: Headers
    }): Promise<AuthResult<null>> {
      try {
        await auth.api.verifyPasskeyRegistration({
          body: { response: input.registration },
          headers: input.headers,
        })
        return { ok: true, value: null }
      } catch (error) {
        /**
         * **The line whose absence cost eleven days.**
         *
         * `onEnroll` in auth-flow.tsx discards this call's result on purpose -- a refused
         * attestation has nothing to retry, so the visitor is let into the dashboard they
         * are already signed in to. Correct, and it made a failing enrollment
         * indistinguishable from a working one from *both* ends: nothing on screen by
         * design, and nothing in the logs by omission. `passkeys` was empty on all three
         * Neon branches from 2026-08-19 to 2026-08-31 and no line anywhere said why.
         *
         * `reasonOf` is what makes the report worth having. The two candidates left after
         * the forensics -- the ceremony never returning an attestation, versus the challenge
         * cookie not surviving the round trip -- are told apart by exactly one string:
         * `CHALLENGE_NOT_FOUND` means the signed cookie did not come back, which is a
         * transport problem (CloudFront, `nextCookies()`), not a browser one.
         */
        const failure = classify(error)
        config.report?.('passkey enrollment failed verification', {
          credentialId: input.registration.id,
          failure,
          reason: reasonOf(error),
        })
        return { ok: false, failure }
      }
    },

    /**
     * Sign-in, step one: the challenge, for `navigator.credentials.get()`.
     *
     * ## It takes no session, and no address
     *
     * The mirror image of `createPasskeyChallenge` above, which demands a *fresh* session.
     * This one is the unauthenticated door: there is nothing to be fresh about yet.
     *
     * There is also no email parameter, and that is not an omission. The plugin populates
     * `allowCredentials` only when a session exists, so every assertion this path produces
     * is against a discoverable credential -- the authenticator decides which account it
     * offers. The address a visitor has typed into the field is never read here and never
     * sent. Adding a parameter for it would create the account-naming argument the whole
     * design is built to not have.
     *
     * ## The challenge travels in a cookie, again
     *
     * Same mechanism as enrollment and the same trap: the plugin stores a signed cookie
     * plus a `verifications` row rather than handing the challenge back, and
     * `verifyPasskeyAssertion` reads both. So this call's `Set-Cookie` has to survive its
     * way to the browser, which from a Server Function is `nextCookies()`'s job. Without
     * it, sign-in fails at the second step with "challenge not found" -- which looks like a
     * browser problem and is not.
     */
    async createPasskeyRequest(input: {
      headers: Headers
    }): Promise<AuthResult<PasskeyRequestOptions>> {
      try {
        const options = await auth.api.generatePasskeyAuthenticationOptions({
          headers: input.headers,
        })
        return { ok: true, value: options }
      } catch (error) {
        // This one runs on page load for every visitor with conditional mediation, so it is
        // the report most likely to become noise. Left in anyway: it is also the first thing
        // that breaks if the database is unreachable, and a silent sign-in page that simply
        // never offers a passkey is exactly the failure this whole file exists to surface.
        config.report?.('passkey sign-in challenge refused', { reason: reasonOf(error) })
        return { ok: false, failure: classify(error) }
      }
    },

    /**
     * Step two: hand the signed assertion back, and let the library mint the session.
     *
     * **This is the one call in the seam that creates a session without a code or a
     * password.** It takes no user id, and there is no argument here through which a caller
     * could choose whose session that is: the plugin looks the credential up by its id,
     * verifies the signature against the challenge from the signed cookie, checks the
     * origin and the RP ID hash, bumps `counter`, and only then creates a session for
     * *that credential's* owner. `assertion.userHandle` is present in the payload and is
     * ignored -- trusting it would be exactly the hole this shape avoids.
     *
     * `setSessionCookie` is called by the plugin itself, so unlike `verifyEmailCode` there
     * is nothing to return but success: `nextCookies()` turns it into a real `Set-Cookie`
     * on the Server Function's response.
     *
     * ## Why a failure is logged here and nowhere else in this file
     *
     * The surface brief requires a counter regression -- a possible cloned authenticator --
     * to be refused, fall back to the code path, **and be logged**. It must never be
     * explained on screen, because saying so tells the wrong person something useful.
     *
     * The seam cannot tell a counter regression from a bad signature: SimpleWebAuthn throws
     * on the former, the plugin catches it, logs the discriminating message through its own
     * logger, and rethrows a flat `AUTHENTICATION_FAILED` (measured on the installed 1.7.1,
     * 2026-08-30). So this logs every failed assertion with the credential it was for, and
     * accepts being wider than the brief asked. The alternative was an
     * `authentication.afterVerification` hook, rejected because it only runs on *success* --
     * it cannot see the case that matters.
     *
     * An audit table is the sink this actually wants; `console.warn` reaches CloudWatch and
     * holds the line until there is one. docs/specs/0002 names it as still open.
     */
    async verifyPasskeyAssertion(input: {
      assertion: PasskeyAssertion
      headers: Headers
    }): Promise<AuthResult<null>> {
      try {
        await auth.api.verifyPasskeyAuthentication({
          body: { response: input.assertion },
          headers: input.headers,
        })
        return { ok: true, value: null }
      } catch (error) {
        const failure = classify(error)
        // Not reported for `passkey_unknown`: a credential we have never stored is an
        // ordinary revocation, not a signal about an authenticator we know.
        if (failure !== 'passkey_unknown') {
          config.report?.('passkey assertion failed verification', {
            credentialId: input.assertion.id,
            failure,
            reason: reasonOf(error),
          })
        }
        return { ok: false, failure }
      }
    },

    /**
     * Whether this session's user already holds a passkey.
     *
     * The one question the enrollment offer could never ask while it lived on rung 2 of the
     * sign-in surface. There, the only thing in reach was "did *this* sign-in use a
     * passkey", so a planner who signed in with a code on a laptop that already held one
     * was offered a second, and the OS sheet answered by telling them so. This is the half
     * of the login brief's state 27 that placement could not cover;
     * `components/auth/enrollment-prompt.tsx` is the caller.
     *
     * **A boolean, not the list.** The caller renders an offer or does not, and the
     * credential ids, device names and AAGUIDs `listPasskeys` returns are exactly the sort
     * of thing that starts being passed one layer further "since we already have it". A
     * settings screen that genuinely needs to enumerate credentials should add its own seam
     * method returning a plain shape, not widen this one -- see the package rule that no
     * provider type crosses this boundary.
     *
     * `sessionMiddleware`, not `freshSessionMiddleware`: reading is not enrolling. A throw
     * here means no session or an unreachable database, and both answer the caller's real
     * question -- "should I offer this" -- with a safe no rather than an unhandled failure
     * on a dashboard render.
     */
    async hasPasskey(headers: Headers): Promise<boolean> {
      try {
        const passkeys = await auth.api.listPasskeys({ headers })
        return passkeys.length > 0
      } catch (error) {
        config.report?.('passkey list refused', { reason: reasonOf(error) })
        return false
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
 * The three code errors come from the plugin's own `EMAIL_OTP_ERROR_CODES`, read off the
 * installed 1.7.1 rather than remembered. The distinction between them is not cosmetic:
 * the surface brief requires "expired" and "invalid" to be different sentences, because
 * one means ask for a new code and the other means look again.
 *
 * `PASSKEY_NOT_FOUND` is `@better-auth/passkey`'s, and lands here for the same reason: it
 * is the one passkey failure that earns a sentence. Its sibling `AUTHENTICATION_FAILED`
 * is deliberately *not* listed -- it falls to `unavailable`, which the sign-in surface
 * renders as nothing.
 *
 * All four are matched on the `code` **key**, not the message: `defineErrorCodes` in
 * `@better-auth/core` builds `{ code: <key>, message: <sentence> }`, so the key is what
 * reaches `body.code`. Verified on the installed package 2026-08-30 rather than assumed,
 * because matching the sentence instead would break silently on any copy edit upstream.
 *
 * Read structurally rather than by importing `APIError`, so the library's types stay
 * inside this file -- which is the entire point of the seam.
 */
/**
 * The provider's own error code, for a log line -- never for the interface.
 *
 * `classify()` deliberately collapses everything it does not recognise into `unavailable`,
 * which is right for choosing a sentence and useless for debugging: `CHALLENGE_NOT_FOUND`
 * and `FAILED_TO_VERIFY_REGISTRATION` are the same `AuthFailure` and completely different
 * problems -- one is a cookie that did not come back, the other an attestation that did not
 * check out.
 *
 * Read structurally, like `classify()`, so no library type crosses the seam. Returns a
 * string rather than a widened `AuthFailure` so it cannot be mistaken for something the
 * interface may render, and falls back to the HTTP status because an error with neither is
 * still worth counting.
 */
function reasonOf(error: unknown): string {
  const code = (error as { body?: { code?: string } })?.body?.code
  if (typeof code === 'string') return code
  const status = (error as { status?: number | string })?.status
  return status === undefined ? 'unknown' : `status:${String(status)}`
}

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
    case 'PASSKEY_NOT_FOUND':
      return 'passkey_unknown'
    default:
      // Better Auth's own limiter answers 429. Everything else is genuinely unknown, and
      // saying so is better than guessing at a cause the visitor could act on.
      //
      // Worth knowing before trusting this branch: it is currently unreachable from every
      // caller in this seam. The limiter lives in the library's router, and each method here
      // is invoked as `auth.api.*` from a Server Function, which bypasses it -- see the
      // `rateLimit` note above. This is a guard against a future router-mediated call, not a
      // live path, and `errors.rateLimited` copy renders for a state nothing produces yet.
      return status === 429 || status === 'TOO_MANY_REQUESTS' ? 'rate_limited' : 'unavailable'
  }
}

export type BetterAuthProvider = ReturnType<typeof createBetterAuthProvider>
