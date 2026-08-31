'use server'

import type {
  AuthFailure,
  PasskeyAssertion,
  PasskeyCreationOptions,
  PasskeyRegistration,
  PasskeyRequestOptions,
} from '@guestnote/core/auth'
import { cookies, headers } from 'next/headers'
import { appHomeUrl, appLoginUrl } from '../../lib/app-url.ts'
import { getAuth } from '../../lib/auth.ts'
import { isLocale, LOCALE_COOKIE, type Locale } from '../../lib/locales.ts'

/**
 * The Server Functions the sign-in surface calls.
 *
 * proxy.ts is explicit that it does NOT do authorization, and quotes Next's own warning
 * that "Server Functions are POST requests to the route that uses them, so a matcher
 * change can silently remove proxy coverage". Most of these are unauthenticated by
 * nature -- they are how you become authenticated -- so what matters there instead is that
 * every guard they DO need lives inside them: input shape, and the rule that none of them
 * takes an argument naming an account.
 *
 * ## Two of the four passkey functions are authenticated, and two are not
 *
 * **`beginPasskeyEnrollment` / `finishPasskeyEnrollment` are authenticated**, behind a
 * *fresh* session check inside the seam. They are here rather than under `(app)/` because
 * enrollment is offered on rung 2 of this surface, in the seconds after a code was
 * verified, which is where research/07 says it converts.
 *
 * **`beginPasskeySignIn` / `finishPasskeySignIn` are not**, and cannot be: they are the
 * door. What stands in for a session check there is that neither takes an argument naming
 * an account -- see each one's note. This paragraph used to claim all the passkey functions
 * were authenticated, which was true until sign-in landed (docs/specs/0002) and is the kind
 * of sentence that quietly becomes a false security argument.
 *
 * ## What none of them get
 *
 * Better Auth's rate limiter. It runs in the library's own router and therefore only
 * covers `/api/auth/*`; a Server Function calls `auth.api.*` directly and goes straight
 * past it. That is a real gap on the *email* path especially, where each unmetered call is
 * an SES send -- recorded in docs/specs/0002 "Not in scope" and owed its own change.
 *
 * `beginPasskeySignIn` changes the shape of that gap and the change is worth naming: it is
 * the first of these that runs **without anyone pressing anything**, on mount, for every
 * visitor whose browser does conditional mediation. So the unmetered baseline is now
 * ordinary login-page traffic rather than a deliberate act, and each of those writes a
 * `verifications` row that nothing prunes until M10. Still deferred -- production is not
 * deployed and `requestCode` is strictly more expensive per call -- but it must close before
 * a `v*` tag.
 */

/**
 * The interface's view of a step's outcome.
 *
 * `failure` is the seam's enum, unchanged. Mapping it to a message is the client's job,
 * because the message depends on the locale and the locale is already resolved there --
 * and because a Server Function returning rendered prose is a Server Function that has
 * quietly taken over the presentation layer.
 */
export type StepResult = { ok: true } | { ok: false; failure: AuthFailure; attemptsLeft?: number }

/**
 * Loose on purpose, and not the security boundary.
 *
 * The real address validity test is whether mail arrives; anything stricter here rejects
 * legitimate addresses (an apostrophe, a long new TLD, a plus tag) to catch a typo the
 * next screen catches anyway. This exists so an obvious slip is caught before a code is
 * sent, not to police RFC 5321.
 */
const LOOKS_LIKE_EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

export async function requestCode(email: string): Promise<StepResult> {
  const address = email.trim()
  if (!LOOKS_LIKE_EMAIL.test(address)) return { ok: false, failure: 'unavailable' }

  const result = await getAuth().requestEmailCode({ email: address })
  // Note what is NOT returned: anything that differs between a known and an unknown
  // address. The seam guarantees that shape; this keeps the guarantee by passing it
  // through rather than enriching it.
  return result.ok ? { ok: true } : { ok: false, failure: result.failure }
}

export async function submitCode(email: string, code: string): Promise<StepResult> {
  // The session cookie is set on THIS action's response, by the `nextCookies()` plugin
  // in packages/core/src/auth/better-auth.ts. Without that plugin the sign-in succeeds
  // and the browser is handed nothing -- which looks exactly like the flow working and
  // the session evaporating on the next navigation.
  const result = await getAuth().verifyEmailCode({
    email: email.trim(),
    code,
    headers: await headers(),
  })
  if (result.ok) {
    return { ok: true }
  }
  return result.attemptsLeft === undefined
    ? { ok: false, failure: result.failure }
    : { ok: false, failure: result.failure, attemptsLeft: result.attemptsLeft }
}

/**
 * Begin "Continue with Google": return the URL the browser should navigate to.
 *
 * The client does `window.location.assign(url)` -- a real navigation, not a `fetch` --
 * because the OAuth flow is a full-page round trip to Google and back through
 * `/api/auth/callback/google`, where Better Auth sets the session cookie itself. So unlike
 * `submitCode`, no cookie is set on this action's response.
 *
 * Both URLs are absolute origins from `lib/app-url.ts` (not bare paths), because Better
 * Auth redirects the browser to them from its own callback route:
 *   - `callbackURL` -- `appHomeUrl()`, the dashboard, on success.
 *   - `errorURL` -- `appLoginUrl()`, so a visitor who cancels at Google's account chooser
 *     (or whose 10-minute OAuth state expires) lands back on the sign-in form instead of
 *     Better Auth's bare `/api/auth/error` page. See the seam method for why that matters.
 *
 * Failure carries no reason, matching the passkey actions: every way this fails is one the
 * surface renders as nothing -- the button does not navigate, or the visitor is returned
 * to the plain login form.
 */
export async function startGoogleSignIn(): Promise<{ ok: true; url: string } | { ok: false }> {
  const result = await getAuth().startGoogleSignIn({
    callbackURL: appHomeUrl(),
    errorURL: appLoginUrl(),
    headers: await headers(),
  })
  return result.ok ? { ok: true, url: result.value.url } : { ok: false }
}

/**
 * Writes the language choice for a surface whose URLs carry no language prefix.
 *
 * lib/locales.ts settled why the dashboard uses a cookie rather than a path segment: a
 * language prefix is an SEO device, and a planner should not lose their place by
 * switching language.
 *
 * **2026-08-21: it stays a cookie, and this is now the dashboard's writer too.** This used
 * to say "at M3 this writes the user row instead" and that the pre-login case was "exactly
 * the case this surface is, permanently". Both halves are now wrong: M3 shipped on cookies
 * (`lib/prefs.ts` argues why -- a user row here is a query in front of every render), and
 * `components/nav/account-menu.tsx` imports this rather than declaring a second copy, so it
 * serves the signed-in surface as well.
 */
export async function setLocale(locale: Locale): Promise<void> {
  if (!isLocale(locale)) return
  const store = await cookies()
  store.set(LOCALE_COOKIE, locale, {
    path: '/',
    sameSite: 'lax',
    httpOnly: false,
    maxAge: 60 * 60 * 24 * 365,
  })
}

/**
 * Enrollment, step one: ask for a challenge.
 *
 * ## Why the failure carries no reason
 *
 * Everything else on this surface hands `AuthFailure` up so the client can pick a sentence.
 * Not here: `SilentPasskeyOutcome` in `passkey.ts` is emphatic that every passkey failure
 * renders identically, as nothing -- one of them means a possible cloned authenticator, and
 * naming it on screen tells the wrong person something useful. So the reason is dropped at
 * the seam rather than carried to a client that must never render it. Making it
 * unrepresentable beats remembering not to show it.
 *
 * The `Set-Cookie` this call produces is load-bearing -- it carries the challenge that
 * `finishPasskeyEnrollment` verifies against. `nextCookies()` is what turns it into a real
 * cookie on a Server Function's response; see the seam's own note on that.
 */
export async function beginPasskeyEnrollment(): Promise<
  { ok: true; options: PasskeyCreationOptions } | { ok: false }
> {
  const result = await getAuth().createPasskeyChallenge({ headers: await headers() })
  return result.ok ? { ok: true, options: result.value } : { ok: false }
}

/**
 * Enrollment, step two: hand the attestation back for verification.
 *
 * `registration` arrives from the browser and is therefore attacker-controlled in full.
 * That is safe here and only here: the seam checks the attestation against a challenge the
 * server itself put in a signed cookie, checks the origin and the RP ID, and refuses if the
 * challenge's user is not the session's. There is no argument on this function through which
 * a caller could attach a credential to another account -- which is why it takes no user id.
 */
export async function finishPasskeyEnrollment(
  registration: PasskeyRegistration,
): Promise<{ ok: boolean }> {
  const result = await getAuth().verifyPasskeyRegistration({
    registration,
    headers: await headers(),
  })
  return { ok: result.ok }
}

/**
 * Sign-in, step one: ask for a challenge to sign.
 *
 * Takes nothing, and that is the guard. This runs for anyone who can reach the login page,
 * so the only way to keep it from being an account-probing oracle is to give it no account
 * to probe with -- no email, no user id, no token. The seam's `createPasskeyRequest` has
 * the rest of the argument: the assertion that comes back is against a discoverable
 * credential, chosen by the authenticator, so the address in the email field is neither
 * read nor sent.
 *
 * Reason dropped on failure, as with enrollment: there is no branch here a visitor could
 * act on, and `SilentPasskeyOutcome` in `passkey.ts` is emphatic about what a passkey
 * failure renders.
 *
 * The `Set-Cookie` this produces carries the challenge that `finishPasskeySignIn` verifies
 * against. `nextCookies()` is what makes it real on a Server Function's response.
 */
export async function beginPasskeySignIn(): Promise<
  { ok: true; options: PasskeyRequestOptions } | { ok: false }
> {
  const result = await getAuth().createPasskeyRequest({ headers: await headers() })
  return result.ok ? { ok: true, options: result.value } : { ok: false }
}

/**
 * Sign-in, step two: hand the signed assertion back. **A session is minted here.**
 *
 * `assertion` is attacker-controlled in full, and takes no user id for the same reason
 * `finishPasskeyEnrollment` does not: the account comes off the *stored* credential the
 * server looks up by id, after checking the signature against a challenge it put in its own
 * signed cookie and checking the origin and RP ID. There is no argument on this function
 * through which a caller could choose whose session to receive.
 *
 * ## One bit of the reason survives, and only one
 *
 * Every other passkey function here drops the failure entirely, because
 * `SilentPasskeyOutcome` requires the browser-side outcomes to render identically, and the
 * server-side refusals it does not name -- a counter regression above all, which means a
 * possible cloned authenticator -- have to render the same way. This one returns `gone`.
 *
 * `gone` is true for exactly one seam failure -- `passkey_unknown`, a credential this
 * deployment has never stored -- and false for every other, so a counter regression, a bad
 * signature and an unreachable server all arrive at the client wearing the same face. The
 * dangerous distinction stays *unrepresentable* rather than merely unrendered, which is the
 * rule this file already runs on; what changes is that the one failure a visitor can act on
 * is now sayable. Their passkey is gone and the code path still works, and refusing to tell
 * them that leaves an autofill sheet that does nothing and no reason why.
 *
 * docs/specs/0002-signing-in-with-a-passkey.md records the rejected alternative: silence
 * for everything, which is simpler and produces exactly that dead end.
 */
export async function finishPasskeySignIn(
  assertion: PasskeyAssertion,
): Promise<{ ok: true } | { ok: false; gone: boolean }> {
  const result = await getAuth().verifyPasskeyAssertion({
    assertion,
    headers: await headers(),
  })
  return result.ok ? { ok: true } : { ok: false, gone: result.failure === 'passkey_unknown' }
}
