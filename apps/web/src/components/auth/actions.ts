'use server'

import type { AuthFailure, PasskeyCreationOptions, PasskeyRegistration } from '@guestnote/core/auth'
import { cookies, headers } from 'next/headers'
import { getAuth } from '../../lib/auth.ts'
import { isLocale, LOCALE_COOKIE, type Locale } from '../../lib/locales.ts'

/**
 * The Server Functions the sign-in surface calls.
 *
 * proxy.ts is explicit that it does NOT do authorization, and quotes Next's own warning
 * that "Server Functions are POST requests to the route that uses them, so a matcher
 * change can silently remove proxy coverage". The first three are unauthenticated by
 * nature -- they are how you become authenticated -- so what matters there instead is that
 * every guard they DO need lives inside them: input shape, and rate limiting behind the
 * seam.
 *
 * **The two passkey functions are the exception, and they are not unauthenticated.** Both
 * sit behind a session check inside the seam, and a fresh one at that. They are still here
 * rather than under `(app)/` because enrollment is offered on rung 2 of this surface, in
 * the seconds after a code was verified, which is where research/07 says it converts.
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
 * Writes the language choice for a surface whose URLs carry no language prefix.
 *
 * lib/locales.ts settled why the dashboard uses a cookie rather than a path segment: a
 * language prefix is an SEO device, and a planner should not lose their place by
 * switching language. At M3 this writes the user row instead and the cookie becomes the
 * pre-login fallback -- which is exactly the case this surface is, permanently.
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
