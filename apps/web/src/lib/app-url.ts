import { env } from '../env.ts'
import { app } from './routes.ts'

/**
 * Absolute URLs on the dashboard host, for links that start somewhere else.
 *
 * Every other href in this app is a path, because `routes.ts` encodes the rule that a
 * href is always the path the browser shows. This module is the one exception, and it
 * exists for one reason: **marketing and the dashboard are different hosts**, so a "log
 * in" link on `guestnote.be` is a cross-origin navigation and a path would keep the
 * visitor on the apex, where the login route does not exist.
 *
 * ## Why the session cannot simply follow them
 *
 * The session cookie is `__Host-` prefixed, which forbids a `Domain` attribute and pins
 * it to exactly one host (proxy.ts leans on this: reaching the origin with a spoofed
 * `x-forwarded-host` "lands on the app branch and gets the login page"). So a session can
 * only ever be minted on, and read from, `app.guestnote.be`. Signing in anywhere else --
 * including in an overlay on the apex -- cannot produce one. Hence: navigate.
 *
 * ## Scheme
 *
 * `http` for `localhost` and nothing else. `localhost` is a *potentially trustworthy
 * origin*, so `__Host-` cookies work over plain http there and dev matches production;
 * every other host gets `https` with no way to opt out.
 */
function originFor(host: string): string {
  const isLocal = env.rootDomain === 'localhost' || env.rootDomain.endsWith('.localhost')
  // From `env.devPort`, which reads `PORT`. This used to hard-code 3000 and say "the dev
  // server's port is not in the environment" -- true when it was written, and made false on
  // 2026-08-21 when `lib/auth.ts` needed the same value for Better Auth's `baseURL` and the
  // passkey plugin's WebAuthn origin. Leaving it would have been the exact failure that
  // docstring warns about: two answers to "what host is the app on" that can disagree.
  //
  // Marketing is prerendered at build time, so this still cannot come from a request
  // and this branch never runs in a deployed environment.
  return isLocal ? `http://${host}:${env.devPort}` : `https://${host}`
}

function appOrigin(): string {
  return originFor(`${env.appSubdomain}.${env.rootDomain}`)
}

/**
 * `https://guestnote.be` -- the apex, as an origin string.
 *
 * Exists for exactly one consumer: the `Access-Control-Allow-Origin` header on
 * `app/api/session-hint/route.ts`. That header has to name a single origin *exactly* --
 * `*` is illegal alongside credentialed requests, and a prefix match would let
 * `guestnote.be.evil.com` read the answer. Derived from the same two env values every
 * other host string comes from, so there is one answer to "what is the apex" rather than
 * a literal in a header that nobody thinks to update.
 */
export function apexOrigin(): string {
  return originFor(env.rootDomain)
}

/** `https://app.guestnote.be/login` -- where a planner signs in, from anywhere. */
export function appLoginUrl(): string {
  return `${appOrigin()}${app.login()}`
}

/**
 * `https://app.guestnote.be/signup` -- where "Continue with Google" returns to from sign-up
 * (spec 0005), so a new planner lands back on the step they were on, not on an empty dashboard.
 */
export function appSignupUrl(): string {
  return `${appOrigin()}${app.signup()}`
}

/**
 * `https://app.guestnote.be/` -- the dashboard, for a link that starts on the apex.
 *
 * Points at the dashboard ROOT rather than `/weddings`, so the app host stays the only
 * thing that decides where a signed-in planner lands. `app/pro/(app)/page.tsx` is the
 * cross-wedding Today screen (spec 0003, S8); before that it redirected to the wedding
 * list, and a link built here would have had to be found and changed on that day.
 */
export function appHomeUrl(): string {
  return `${appOrigin()}${app.home()}`
}

/**
 * `https://app.guestnote.be/billing` -- the trial-reminder mail's button, and where a payment
 * provider sends the browser back to after checkout or the portal (spec 0005).
 */
export function appBillingUrl(): string {
  return `${appOrigin()}${app.billing()}`
}

/**
 * `https://app.guestnote.be/invite/<token>` -- the link inside an invitation email.
 *
 * Absolute because the recipient opens it from a mail client, not from the dashboard. The
 * token is a path segment and never a query, for the reason `app.invite` gives.
 */
export function appInviteUrl(token: string): string {
  return `${appOrigin()}${app.invite(token)}`
}

/**
 * `https://app.guestnote.be/api/session-hint` -- what the apex asks, since it cannot know.
 *
 * The session cookie is `__Host-` prefixed and therefore pinned to the app host, so the
 * apex has no way to read it; and marketing is prerendered behind a *shared* CloudFront
 * cache, so it could not vary on it even if it could read it -- the first signed-in
 * planner's HTML would be served to every prospect for the next 60 seconds. The question
 * has to be asked from the browser, at runtime, of the one host that knows.
 */
export function sessionHintUrl(): string {
  return `${appOrigin()}/api/session-hint`
}
