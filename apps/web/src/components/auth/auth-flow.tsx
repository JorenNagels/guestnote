'use client'

import { AUTH_POLICY } from '@guestnote/core/auth'
import { ArrivalBadge } from '@guestnote/ui/arrival-badge'
import { Button, LinkButton } from '@guestnote/ui/button'
import { Field } from '@guestnote/ui/field'
import { InlineError } from '@guestnote/ui/inline-error'
import { LiveRegion } from '@guestnote/ui/live-region'
import { LocaleSwitcher } from '@guestnote/ui/locale-switcher'
import { StepIndicator } from '@guestnote/ui/step-indicator'
import { type ReactNode, useCallback, useEffect, useRef, useState, useTransition } from 'react'
import type { Locale } from '../../lib/locales.ts'
import { app } from '../../lib/routes.ts'
import { Wordmark } from '../brand/wordmark.tsx'
import {
  beginPasskeySignIn,
  finishPasskeySignIn,
  reportCeremonyFailure,
  requestCode,
  setLocale,
  startGoogleSignIn,
  submitCode,
} from './actions.ts'
import { type AuthCopy, fill, splitAround } from './copy.ts'
import { WELCOME_PARAM, WELCOME_PASSKEY } from './enrollment-prompt.tsx'
import { KeyIcon } from './icons.tsx'
import {
  conditionalMediationAvailable,
  platformAuthenticatorAvailable,
  signInWithPasskey,
} from './passkey.ts'
import { reportingCatch } from './reporting.ts'
import { Stage, type StageContent } from './stage.tsx'

type Props = {
  copy: AuthCopy
  locale: Locale
  locales: readonly Locale[]
  /** Whether the deployment can verify a passkey at all. `passkeysAvailable()` on the seam. */
  passkeysEnabled: boolean
  /**
   * Whether to draw the "Continue with Google" button below the form. `googleAvailable()`
   * on the seam -- true only when the Google OAuth client env vars are set, so an
   * unconfigured environment shows no button rather than one that fails on click.
   */
  googleEnabled: boolean
  /** An invitation binds the address: pre-filled and not editable. */
  boundEmail?: string
  /** The sentence above the field on an invitation landing. */
  lead?: string
  /** Rendered instead of the form. An expired or unusable invitation ends here. */
  blocked?: string
  /** Rendered above a usable form. A session that expired mid-work arrives with one. */
  notice?: string
  /** Where rung 2 hands off. */
  continueHref: string
  /** What the panel beside the form shows. Absent on narrow viewports it simply is not drawn. */
  stage: StageContent
  /**
   * Sign-up (spec 0005) reuses this whole flow for its Account step, and these four props are
   * the only places it differs. Rejected: a second component for sign-up -- the passkey,
   * Google and code machinery above is exactly what must not exist twice.
   *
   * `heading` replaces rung 0's "Sign in" title (not on an invitation, which has its own).
   */
  heading?: string
  /**
   * Sign-up's four labels (Account, Studio, Wedding, Team) in place of the three rungs. The
   * index stays put across the rungs: verifying an address is still the Account step.
   */
  steps?: Readonly<{ labels: readonly string[]; current: number }>
  /** Replaces the line under the column; sign-in's own points at `/signup`. */
  footer?: ReactNode
  /** Where "Continue with Google" comes back to. Absent is the dashboard. */
  googleReturn?: 'signup'
}

/** 0 identify, 1 verify, 2 arrive. Monotonic; the passkey path skips 1 entirely. */
type Rung = 0 | 1 | 2

/**
 * How the session on rung 2 was obtained, and the only thing rung 2 still does with it.
 *
 * Until 2026-09-01 this gated an enrollment offer rendered here. It no longer does: the
 * offer moved to `components/auth/enrollment-prompt.tsx` on the shell, which is where
 * `auth-flow.tsx` said it belonged from the day it was written. What survives the move is
 * this one fact, because the shell cannot derive it -- only this component knows which
 * rung the visitor came off.
 *
 * So it now decides one thing: whether `continueHref` carries `?welcome=passkey`. Someone
 * who just signed in *with* a passkey plainly has one, and offering to create another
 * produces an OS sheet that says "you already have one", which reads as the product not
 * knowing what it just did.
 *
 * The half this cannot answer -- signing in with a code on a device that already holds a
 * passkey -- is now answered on the server instead, by `hasPasskey()` in
 * `(app)/layout.tsx`. That was rejected in docs/specs/0002 as "a query on every sign-in
 * that leaks whether this account has a passkey to anyone who reaches rung 2"; behind the
 * shell's session it is neither, because the only person who can read the answer is the
 * account's owner. The spec is amended rather than silently overtaken.
 *
 * It still over-reaches in one direction, accepted knowingly: a **cross-device** sign-in --
 * the QR flow `passkey.ts` deliberately does not suppress -- proves a passkey exists on a
 * *phone*, not on the laptop in front of the visitor. So that planner gets no marker and no
 * offer. Rejected the narrower gate on the assertion's `authenticatorAttachment`, because
 * `PasskeyAssertion` does not carry that field and reading it would mean trusting a
 * client-supplied value to decide what to show. The cost is a missed offer on the rarest of
 * the three paths.
 */
type SignedInWith = 'code' | 'passkey'

/** Matches the ground transition in descent.css. Changing one means changing both. */
const DESCENT_MS = 380

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  )
}

const LOOKS_LIKE_EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

/**
 * The whole passkey sign-in ceremony, both paths, as three outcomes.
 *
 * Module scope rather than a closure inside the component, and that is not only a hooks
 * convenience: the conditional path and the explicit button run *identical* ceremonies and
 * differ by one argument. Two copies would be two places to forget that a `gone` result is
 * the only one allowed to speak.
 *
 * `'silent'` collapses every outcome the interface renders as nothing -- a dismissed sheet,
 * a browser that cannot, an aborted request, a server that refused the assertion. The first
 * two arrive as `SilentPasskeyOutcome` from passkey.ts, which argues why they are one
 * outcome; the last two can only be seen here, which is why this function is where they
 * join. `finishPasskeySignIn` in actions.ts has the rest: why only `gone` survives the trip.
 */
async function runPasskeySignIn(init?: {
  mediation?: 'conditional'
  signal?: AbortSignal
}): Promise<'ok' | 'gone' | 'silent'> {
  const challenge = await beginPasskeySignIn().catch(
    reportingCatch('signin', 'beginPasskeySignIn', { ok: false } as const),
  )
  if (!challenge.ok) return 'silent'

  const assertion = await signInWithPasskey(challenge.options, {
    ...init,
    /**
     * Fire-and-forget: a diagnostic must never delay or fail the ceremony it describes.
     *
     * **`NotAllowedError` on the conditional path is not reported**, and that exclusion is
     * the difference between a signal and a flood. A conditional request is offered on every
     * single page view and is *expected* to end unused -- the visitor types their email, or
     * the 60-second WebAuthn deadline passes -- and the spec hands out `NotAllowedError` for
     * exactly that. Reporting it would put one event on every login page view that did not
     * use a passkey, which is most of them, against a 5,000/month tier.
     *
     * Every other name still reports on both paths, including `NotAllowedError` from the
     * *explicit* control -- there someone pressed a button, so a refusal is worth knowing.
     */
    onFailure: (failure) => {
      if (init?.mediation === 'conditional' && failure.name === 'NotAllowedError') return
      void reportCeremonyFailure('signin', failure.name, failure.message).catch(() => {})
    },
  })
  // A `SilentPasskeyOutcome` is a string; an assertion is an object. Narrowed on the shape
  // rather than a flag, the same way `enrollment-prompt.tsx` narrows -- it keeps passkey.ts's "every
  // silent outcome is one outcome" promise from needing a second representation here.
  if (typeof assertion === 'string') return 'silent'

  /**
   * The abort is checked HERE, before the next line, and not only by the caller afterwards.
   *
   * `finishPasskeySignIn` is the call that mints the session -- the plugin sets the cookie
   * itself. Checking the signal after it returns would be checking after the dangerous
   * thing already happened, which is the inverse of this repo's rule.
   *
   * The failure it prevents, on venue wifi: the visitor picks their passkey, the verify
   * round trip is in flight, they see nothing happen and press Continue with their email
   * already typed. `onIdentify` aborts and sends a code. The passkey request then completes
   * server-side anyway -- counter bumped, session row created, `Set-Cookie` delivered -- so
   * the browser is signed in while the screen asks for a code that cost an SES send. Bailing
   * first means an aborted ceremony never reaches the server at all.
   */
  if (init?.signal?.aborted) return 'silent'

  // Only the throw is ours: an `ok: false` answer already produced a report inside the seam,
  // and reporting it again would double-count.
  const verified = await finishPasskeySignIn(assertion).catch(
    reportingCatch('signin', 'finishPasskeySignIn', { ok: false, gone: false } as const),
  )
  if (verified.ok) return 'ok'
  return verified.gone ? 'gone' : 'silent'
}

/**
 * The whole sign-in flow: one route segment, one state machine, three rungs.
 *
 * ## Why it is one component and not three routes
 *
 * A rung change must not remount the field being typed into and must not cost a
 * navigation. The scene this is designed against is a planner on venue wifi with one bar
 * of signal; a page load between "enter your email" and "enter your code" is a place for
 * that connection to fail with the visitor's input already gone.
 *
 * It also makes the descent readable. The ground moves and the column does not, which
 * only reads as one continuous movement if the column is literally the same element
 * throughout. Three routes give three columns that happen to look alike.
 *
 * ## What it deliberately does not do
 *
 * No method menu. The passkey control appears only when the browser cannot offer the
 * credential from the field itself, and never at primary weight.
 */
export function AuthFlow({
  copy,
  locale,
  locales,
  passkeysEnabled,
  googleEnabled,
  boundEmail,
  lead,
  blocked,
  notice,
  continueHref,
  stage,
  heading,
  steps,
  footer,
  googleReturn,
}: Props) {
  const [rung, setRung] = useState<Rung>(0)
  const [email, setEmail] = useState(boundEmail ?? '')
  const [error, setError] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const [resendIn, setResendIn] = useState(0)
  // Kept as two separate answers rather than one derived boolean, because the interface asks
  // two different questions of them, and the answers diverge. `conditional` decides which
  // ceremony runs at rung 0 -- the autofill sheet, or an explicit control; `platform` is what
  // says this device can KEEP a passkey, which is rung 2's question. The single boolean this
  // replaced conflated them, and rung 2 offered a passkey to devices with no authenticator
  // to store one in.
  //
  // Neither is the whole gate: `showPasskeyControl` below adds its own terms, and that
  // const is where the current rule lives. `platformAvailable` kept a second reader --
  // rung 2's enrollment offer -- until that moved to the shell on 2026-09-01 and started
  // asking the browser itself.
  const [conditionalAvailable, setConditionalAvailable] = useState(false)
  const [platformAvailable, setPlatformAvailable] = useState(false)
  const [signedInWith, setSignedInWith] = useState<SignedInWith>('code')
  // Not `startTransition`: `onGoogle` ends in a full-page navigation to Google, so the
  // transition would never resolve. A plain flag disables the button while the URL is
  // being minted -- long enough that a second click cannot fire a second round trip.
  const [googlePending, setGooglePending] = useState(false)
  // Not `startTransition` either, and for the sharper version of the same reason: the OS
  // sheet is a human deciding, not a request in flight. See `onPasskey`.
  const [passkeyPending, setPasskeyPending] = useState(false)
  const [pending, startTransition] = useTransition()

  const emailRef = useRef<HTMLInputElement>(null)
  const codeRef = useRef<HTMLInputElement>(null)
  /**
   * The conditional passkey request's abort handle.
   *
   * A conditional `navigator.credentials.get()` has no natural end -- it stays open,
   * attached to the browser's autofill sheet, until somebody uses it or aborts it. This
   * component owns that lifetime because it is the only thing that knows when the request
   * has stopped being relevant: on unmount, and the moment the visitor commits to the email
   * path instead. Left running, it can resolve onto a rung that no longer exists.
   */
  const conditionalAbort = useRef<AbortController | null>(null)
  // Rung 0 is the landing state, so its field must not be stolen from a visitor who has
  // already started typing by the time hydration finishes.
  const hasMoved = useRef(false)

  /**
   * Decide whether an explicit passkey control is needed.
   *
   * Runs once, and asks the two questions in the order that matters: if the browser can
   * offer the credential from the field, the field is the affordance and we add nothing.
   * The control exists only for the browsers that have a platform authenticator but no
   * conditional mediation.
   */
  useEffect(() => {
    if (!passkeysEnabled) return
    let cancelled = false
    void (async () => {
      const [conditional, platform] = await Promise.all([
        conditionalMediationAvailable(),
        platformAuthenticatorAvailable(),
      ])
      if (cancelled) return
      setConditionalAvailable(conditional)
      setPlatformAvailable(platform)
    })()
    return () => {
      cancelled = true
    }
  }, [passkeysEnabled])

  /**
   * Offer the passkey from inside the browser's own autofill sheet, from first paint.
   *
   * **This is the entire passkey affordance on a modern browser.** The interface draws no
   * button and no prompt; the email field's `autocomplete="username webauthn"` is what
   * attaches the credential to the sheet, and this open request is what the sheet resolves.
   * If nothing appears to happen here, that is the feature working -- see
   * `showPasskeyControl` below for the browsers that need a visible control instead.
   *
   * Not gated on `platformAvailable`. Conditional mediation is exactly the case where the
   * credential need not live on this device: the platform is free to draw a QR and take the
   * assertion from a phone, which passkey.ts is careful not to suppress.
   *
   * Suppressed on an invitation landing, and on a blocked one. `boundEmail` means the
   * address is pinned on purpose, and a discoverable credential ignores it entirely -- so
   * the sheet could sign someone in as a different account while the invitation sits
   * unclaimed with nothing on screen saying so. Same argument that already hides the Google
   * button there. `blocked` replaces the whole form, including the field this ceremony
   * attaches to: without that term an expired or unusable invitation would still fire an
   * unauthenticated challenge request, write a `verifications` row and open a `get()` the
   * page has no input for the browser to hang it on.
   *
   * ## The dependency array is primitives, and that is load-bearing
   *
   * `copy` was in here and it made the effect **retrigger itself indefinitely**. `copy` is
   * an object from the RSC payload, so its identity changes on any re-render of the route --
   * and this effect causes exactly such a re-render: `beginPasskeySignIn` sets the challenge
   * cookie, `nextCookies()` writes it through `cookies().set()`, and Next 16 documents that
   * as unconditionally re-rendering the page. So: effect runs, POSTs, gets a new `copy`
   * identity back, cleanup aborts the in-flight `credentials.get()`, effect fires again. One
   * round trip at a time, forever, a `verifications` row per lap, and the credential never
   * stays in the autofill sheet long enough for anyone to pick it -- the feature not working
   * at all, on the browsers it is entirely aimed at.
   *
   * The two strings are what the body actually reads, and they compare by value, so a real
   * locale switch re-runs this once instead of never. Found by review 2026-08-31, invisible
   * to the suite because `auth-flow.test.tsx` passes a module-constant `COPY` whose identity
   * never changes -- which is the "no E2E layer" gap in docs/specs/0002 biting immediately.
   */
  const passkeyGoneMessage = copy.errors.passkeyGone
  const arriveTitle = copy.arrive.title

  useEffect(() => {
    if (!passkeysEnabled || !conditionalAvailable || boundEmail || blocked) return

    const controller = new AbortController()
    conditionalAbort.current = controller

    void (async () => {
      const outcome = await runPasskeySignIn({
        mediation: 'conditional',
        signal: controller.signal,
      })
      // The abort path lands here too, as `silent`. Checking the signal keeps a request the
      // flow deliberately cancelled from writing state onto whatever rung replaced it.
      if (controller.signal.aborted) return
      if (outcome === 'silent') return
      if (outcome === 'gone') {
        setError(passkeyGoneMessage)
        return
      }
      hasMoved.current = true
      setError(null)
      setSignedInWith('passkey')
      setRung(2)
      setAnnouncement(arriveTitle)
    })()

    return () => {
      controller.abort()
      conditionalAbort.current = null
    }
  }, [passkeysEnabled, conditionalAvailable, boundEmail, blocked, passkeyGoneMessage, arriveTitle])

  /** Focus follows the rung, so a keyboard or screen-reader user lands on the new control. */
  useEffect(() => {
    if (!hasMoved.current) return
    const next = rung === 0 ? emailRef.current : rung === 1 ? codeRef.current : null
    next?.focus()
  }, [rung])

  useEffect(() => {
    if (resendIn <= 0) return
    const id = setTimeout(() => setResendIn((n) => n - 1), 1000)
    return () => clearTimeout(id)
  }, [resendIn])

  function messageFor(failure: string, attemptsLeft?: number): string {
    switch (failure) {
      case 'code_wrong':
        return attemptsLeft === 1
          ? copy.errors.codeWrongOne
          : fill(copy.errors.codeWrong, { attempts: attemptsLeft ?? 0 })
      case 'code_spent':
        return copy.errors.codeSpent
      case 'code_expired':
        return copy.errors.codeExpired
      case 'rate_limited':
        return copy.errors.rateLimited
      case 'delivery_failed':
        return copy.errors.deliveryFailed
      // Reached only if a future caller hands a raw `AuthFailure` here. The passkey paths
      // set this sentence directly, because `finishPasskeySignIn` narrows the seam's enum
      // to a single boolean before it crosses back. Listed anyway so the two cannot drift
      // into rendering different words for the same failure.
      case 'passkey_unknown':
        return copy.errors.passkeyGone
      default:
        return copy.errors.unavailable
    }
  }

  function send(address: string) {
    startTransition(async () => {
      let result: Awaited<ReturnType<typeof requestCode>>
      try {
        result = await requestCode(address)
      } catch {
        // The venue-wifi case. Nothing typed is lost -- `email` is still in state and the
        // rung has not moved -- and the message says so rather than blaming the address.
        setError(copy.errors.offline)
        return
      }
      if (!result.ok) {
        setError(messageFor(result.failure))
        return
      }
      hasMoved.current = true
      setError(null)
      setRung(1)
      setResendIn(AUTH_POLICY.resendCooldownSeconds)
      setAnnouncement(fill(copy.verify.sentTo, { email: address }))
    })
  }

  function onIdentify() {
    const address = (boundEmail ?? email).trim()
    if (!LOOKS_LIKE_EMAIL.test(address)) {
      setError(copy.errors.emailFormat)
      return
    }
    // The visitor has chosen the code path, so the conditional request is now waiting for
    // an answer to a question nobody is asking. Aborted here rather than only on unmount:
    // this component does not unmount between rungs -- that is the point of it being one
    // component -- so without this the request stays open across rung 1 and can resolve a
    // passkey sign-in on top of a code the visitor is halfway through typing.
    conditionalAbort.current?.abort()
    setEmail(address)
    send(address)
  }

  /**
   * The explicit passkey control, for browsers with an authenticator but no conditional UI.
   *
   * Same ceremony as the effect above with one difference: no `mediation`, so the OS sheet
   * opens immediately rather than waiting inside an autofill list this browser cannot draw.
   *
   * Not wrapped in `startTransition`, for the reason `enrollment-prompt.tsx` gives: the middle hop is a
   * sheet waiting on a face or a finger, which can sit there for half a minute, and a React
   * transition should not be held open for the length of a human decision. `passkeyPending`
   * is the busy signal instead -- and it doubles as the "we are waiting" state the surface
   * brief asks for on the cross-device path, where the platform is drawing a QR and the
   * screen's only honest job is to say it has not finished.
   *
   * **No abort here, and it is safe only because of a gate two screens away:**
   * `showPasskeyControl` requires `!conditionalAvailable` and the conditional effect
   * requires `conditionalAvailable`, so the two ceremonies are mutually exclusive and this
   * one can never race the one holding `conditionalAbort`. If that gate ever widens -- and
   * it is one term away, as adding `!boundEmail` just showed -- this needs its own
   * controller, or two concurrent `get()` calls end up sharing one.
   */
  async function onPasskey() {
    setPasskeyPending(true)
    const outcome = await runPasskeySignIn()
    setPasskeyPending(false)

    if (outcome === 'silent') return
    if (outcome === 'gone') {
      setError(copy.errors.passkeyGone)
      return
    }
    hasMoved.current = true
    setError(null)
    setSignedInWith('passkey')
    setRung(2)
    setAnnouncement(copy.arrive.title)
  }

  function onVerify() {
    const code = codeRef.current?.value ?? ''
    startTransition(async () => {
      let result: Awaited<ReturnType<typeof submitCode>>
      try {
        result = await submitCode(email, code)
      } catch {
        setError(copy.errors.offline)
        return
      }
      if (!result.ok) {
        setError(
          result.attemptsLeft === undefined
            ? messageFor(result.failure)
            : messageFor(result.failure, result.attemptsLeft),
        )
        return
      }
      hasMoved.current = true
      setError(null)
      setRung(2)
      setAnnouncement(copy.arrive.title)
    })
  }

  /**
   * "Continue with Google": ask the server for the outbound URL, then navigate to it.
   *
   * A real navigation, not a transition -- the OAuth flow leaves the app entirely and comes
   * back through `/api/auth/callback/google`, which is where the session cookie is set.
   *
   * This handler only owns the step *before* the redirect: minting the URL. If that fails
   * (client misconfigured, Google unreachable) the button re-enables and nothing else
   * happens -- the same silent posture the passkey outcomes have. A failure *after* the
   * redirect (the visitor cancels at Google, the state token expires) never returns here;
   * `errorCallbackURL` in the seam sends it back to this same login form instead.
   *
   * `googlePending` is left true on the success path so the button cannot be double-fired
   * in the moment before the page unloads.
   */
  async function onGoogle() {
    setGooglePending(true)
    const result = await startGoogleSignIn(googleReturn).catch(() => ({ ok: false }) as const)
    if (!result.ok) {
      setGooglePending(false)
      return
    }
    window.location.assign(result.url)
  }

  /**
   * Whether rung 0 draws an explicit passkey control.
   *
   * `!boundEmail && !blocked`: an invitation must not offer a way to sign in as somebody
   * else, and a blocked one has no form at all. The `blocked` term is belt to the JSX's
   * braces -- this control already renders inside the `blocked ? … : …` false branch, so it
   * is unreachable there either way. Stated here anyway so the rule lives in one place and
   * matches the conditional effect above, which has no JSX to hide behind and where its
   * absence was a real bug.
   *
   * This used to have a sibling, `canEnroll`, sharing the same capability answer for rung
   * 2's enrollment offer. That offer moved to the shell on 2026-09-01 and took its gate
   * with it -- `platformAuthenticatorAvailable()` is now asked again in
   * `enrollment-prompt.tsx`, on the device that would keep the credential, which is the
   * only place the answer means anything.
   */
  const showPasskeyControl =
    passkeysEnabled && platformAvailable && !conditionalAvailable && !boundEmail && !blocked

  /**
   * Where rung 2 hands off, with the marker that opens the shell's enrollment offer.
   *
   * The whole of what this component now contributes to enrollment: it knows which rung the
   * visitor came off and the shell does not. Everything else -- can this device keep a
   * passkey, does this user already have one, and the ceremony itself -- is decided over
   * there. See `SignedInWith`.
   *
   * Parsed rather than string-concatenated, because `continueHref` is a prop and `/invite`
   * passes its own: a bare `+ '?welcome=passkey'` silently produces a second `?` the day one
   * of them grows a query. The base is `location.href` -- a relative href resolves against
   * the current document, which is what a browser would do with it anyway -- and only the
   * path and query come back out, because `routes.ts` requires a href to be the path the
   * browser shows.
   */
  // `useCallback` so the redirect effect below can depend on it honestly rather than on its
  // two inputs with a suppression -- a hand-listed dependency array is exactly how the
  // `copy`-identity retrigger loop above got written in the first place.
  const arrivalHref = useCallback((): string => {
    // `passkeysEnabled` as well as the rung: a deployment that cannot verify a passkey has
    // no offer for the shell to draw, and a URL advertising a feature that does not exist is
    // a small lie the shell would then have to see through. It is the same answer the
    // server gate reaches independently -- cheap here, and it keeps the marker meaning
    // exactly what it says.
    if (!passkeysEnabled || signedInWith === 'passkey') return continueHref
    const url = new URL(continueHref, window.location.href)
    url.searchParams.set(WELCOME_PARAM, WELCOME_PASSKEY)
    return `${url.pathname}${url.search}`
  }, [continueHref, passkeysEnabled, signedInWith])

  /**
   * Rung 2 leaves on its own.
   *
   * Signing in ends in the dashboard, not on a screen that congratulates you for signing
   * in. Rung 2 is a transition, not a destination -- long enough for the ground to finish
   * its last step so the descent resolves rather than being cut off, and no longer.
   *
   * **It used to be held open by an enrollment offer standing on it, and nothing holds it
   * now.** That hold existed because the offer was rendered here and a 380ms redirect ran
   * straight over it. With the offer on the shell there is nothing on this rung to wait
   * for, and the rule it enforced -- never navigate away from an outstanding write -- moved
   * with the ceremony to `enrollment-prompt.tsx`, which is the file that now has a write to
   * protect.
   *
   * An effect rather than a `setTimeout` inside `onVerify`: the cleanup cancels a redirect
   * already in flight if the rung changes underneath it, which a bare timeout could not.
   *
   * The button below stays as the fallback: if this navigation is blocked or slow, a dead
   * end is worse than a redundant control.
   */
  useEffect(() => {
    if (rung !== 2) return
    const id = window.setTimeout(
      () => window.location.assign(arrivalHref()),
      prefersReducedMotion() ? 0 : DESCENT_MS,
    )
    return () => window.clearTimeout(id)
  }, [rung, arrivalHref])

  const [sentBefore, sentAfter] = splitAround(copy.verify.sentTo, 'email')

  return (
    <div className="signin">
      {/* In the DOM from first paint, and only its text changes. A live region inserted
          at the same moment as its message is frequently never announced at all. */}
      <LiveRegion message={announcement} />

      <div className="flex flex-col">
        <div className="flex items-center justify-between gap-4 px-5 py-4 lg:px-8 lg:pt-6">
          <div className="flex items-center gap-2 text-sm font-semibold tracking-tight">
            <Wordmark className="h-5 w-auto" />
            <span>Guestnote</span>
          </div>
          <LocaleSwitcher
            locales={locales}
            current={locale}
            label={copy.language}
            disabled={pending}
            onSelect={(next) => startTransition(() => setLocale(next))}
          />
        </div>

        <div className="flex flex-1 items-center justify-center px-5 pt-4 pb-8 lg:px-8">
          {/* The column never changes width or horizontal position between rungs. */}
          <div className="w-full max-w-[21rem]">
            {/* Depth is never the only signal: the rung is named in words, because the one
              screen in this product with no status chip on it still has to say where
              you are. */}
            <StepIndicator
              className="mb-6"
              steps={steps?.labels ?? [copy.steps.public, copy.steps.verifying, copy.steps.private]}
              current={steps?.current ?? rung}
            />

            {rung === 0 && (
              <>
                <h1 className="mb-1.5 text-2xl leading-tight font-semibold tracking-tight">
                  {boundEmail ? copy.invite.title : (heading ?? copy.signIn.title)}
                </h1>
                <p className="mb-6 text-sm leading-relaxed text-muted-foreground">
                  {lead ?? copy.signIn.help}
                </p>

                {blocked ? (
                  <InlineError>{blocked}</InlineError>
                ) : (
                  <>
                    {notice && (
                      <p className="mb-4 text-xs leading-relaxed text-muted-foreground">{notice}</p>
                    )}
                    <Field
                      id="auth-email"
                      ref={emailRef}
                      label={copy.signIn.emailLabel}
                      type="email"
                      inputMode="email"
                      /* `webauthn` LAST, per spec. This attribute IS the passkey
                       affordance: conditional mediation offers the credential inside the
                       browser's own autofill sheet, attached to this field. */
                      autoComplete="username webauthn"
                      placeholder={copy.signIn.emailPlaceholder}
                      value={boundEmail ?? email}
                      readOnly={Boolean(boundEmail)}
                      invalid={Boolean(error)}
                      errorId="auth-email-error"
                      onChange={(e) => setEmail(e.currentTarget.value)}
                      onKeyDown={(e) => e.key === 'Enter' && onIdentify()}
                    />
                    {error && <InlineError id="auth-email-error">{error}</InlineError>}
                    {boundEmail && (
                      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                        {copy.invite.locked}
                      </p>
                    )}
                    <Button
                      className="mt-3.5"
                      busy={pending}
                      busyLabel={copy.busy.sending}
                      onClick={onIdentify}
                    >
                      {copy.signIn.continue}
                    </Button>
                    {showPasskeyControl && (
                      <Button
                        variant="secondary"
                        className="mt-2 h-10"
                        icon={<KeyIcon />}
                        busy={passkeyPending}
                        busyLabel={copy.busy.checking}
                        onClick={() => void onPasskey()}
                      >
                        {copy.signIn.passkey}
                      </Button>
                    )}
                    {/* Google sits below the primary path, under a divider -- the secondary
                      method position (shadcn login-01/04, the "one unambiguous primary CTA"
                      argument). Hidden on an invitation landing: that flow pins the address
                      on purpose, and a Google button is a way to pick a different one.
                      research/07's "Social sign-in added 2026-08-29" note has the why. */}
                    {googleEnabled && !boundEmail && (
                      <>
                        {/* The whole divider is decorative: a screen reader still reaches
                          the form and the button by normal traversal, and `role="separator"`
                          on the label would push the word itself out of the a11y tree
                          (browsers force `presentation` on a separator's descendants). */}
                        <div
                          className="my-4 flex items-center gap-3 text-xs text-muted-foreground"
                          aria-hidden="true"
                        >
                          <span className="h-px flex-1 bg-[var(--gn-input,var(--input))]" />
                          {copy.signIn.orContinue}
                          <span className="h-px flex-1 bg-[var(--gn-input,var(--input))]" />
                        </div>
                        <Button
                          variant="secondary"
                          className="h-10"
                          icon={<GoogleGIcon />}
                          disabled={googlePending}
                          onClick={() => void onGoogle()}
                        >
                          {copy.signIn.google}
                        </Button>
                      </>
                    )}
                  </>
                )}
              </>
            )}

            {rung === 1 && (
              <>
                <h1 className="mb-1.5 text-2xl leading-tight font-semibold tracking-tight">
                  {copy.verify.title}
                </h1>
                <p className="mb-6 text-sm leading-relaxed text-muted-foreground">
                  {/* The address is shown back and stays correctable. "Wrong address" is the
                    most common recovery on this screen and must not cost a page. */}
                  {sentBefore}
                  <span className="font-medium break-words text-foreground">{email}</span>
                  {sentAfter}
                </p>
                <Field
                  id="auth-code"
                  ref={codeRef}
                  label={copy.verify.codeLabel}
                  type="text"
                  inputMode="numeric"
                  /* What puts the code above the keyboard on iOS, straight from Mail.
                   Load-bearing, not decoration. */
                  autoComplete="one-time-code"
                  maxLength={AUTH_POLICY.codeLength + 1}
                  placeholder="······"
                  numeric
                  invalid={Boolean(error)}
                  errorId="auth-code-error"
                  onKeyDown={(e) => e.key === 'Enter' && onVerify()}
                />
                {error && <InlineError id="auth-code-error">{error}</InlineError>}
                <Button
                  className="mt-3.5"
                  busy={pending}
                  busyLabel={copy.busy.checking}
                  onClick={onVerify}
                >
                  {copy.verify.submit}
                </Button>
                <div className="mt-3.5 flex items-baseline justify-between gap-4">
                  <LinkButton
                    onClick={() => {
                      hasMoved.current = true
                      setError(null)
                      setRung(0)
                    }}
                  >
                    {copy.verify.otherAddress}
                  </LinkButton>
                  {/* Disabled with a visible countdown, never a silently ignored tap. */}
                  <LinkButton disabled={resendIn > 0 || pending} onClick={() => send(email)}>
                    {resendIn > 0
                      ? fill(copy.verify.resendIn, { seconds: resendIn })
                      : copy.verify.resend}
                  </LinkButton>
                </div>
              </>
            )}

            {rung === 2 && (
              <>
                <ArrivalBadge className="mb-4" />
                <h1 className="mb-1.5 text-2xl leading-tight font-semibold tracking-tight">
                  {copy.arrive.title}
                </h1>
                <p className="mb-6 text-sm leading-relaxed text-muted-foreground">
                  {copy.arrive.body}
                </p>
                {/* The fallback for a blocked or slow auto-redirect, and it carries the
                    same href the timer does -- including the `?welcome=passkey` marker.
                    Two paths off this rung, one destination; `arrivalHref` is where that
                    is decided so it cannot be decided twice differently. */}
                <Button className="mt-1" onClick={() => window.location.assign(arrivalHref())}>
                  {copy.arrive.continue}
                </Button>

                {/* No enrollment offer here any more. It is the shell's, as this file always
                    said it should be -- `components/auth/enrollment-prompt.tsx`, reached by
                    the marker on the href above. Moved 2026-09-01, which is also what let
                    `login/page.tsx` have its redirect back. */}
              </>
            )}
          </div>
        </div>

        {/*
        The line every login page needs and this one needs more than most: the form asks
        for an address, and the only question it raises -- "what if I do not have one" --
        had no answer on screen. Until spec 0005 the honest answer was "invite-only"; now it
        is a way in, a plain link to sign-up, and sign-up passes its own line instead.
      */}
        <p className="text-muted-foreground shrink-0 px-5 pb-6 text-xs leading-relaxed lg:px-8">
          {footer ?? (
            <>
              {copy.noAccount.prompt}{' '}
              <a
                href={app.signup()}
                className="font-medium text-foreground underline underline-offset-[3px]"
              >
                {copy.noAccount.link}
              </a>
            </>
          )}
        </p>
      </div>

      <Stage rung={rung} content={stage} />
    </div>
  )
}

/**
 * The Google "G", in its four fixed brand colours.
 *
 * Google's sign-in branding guidelines forbid recolouring the mark and require it on a
 * white background, so it does not take `currentColor` like the icons above and it carries
 * its own white tile -- which also lets it read on the dark theme's transparent button.
 * Paths are Google's own official asset, untouched.
 */
function GoogleGIcon() {
  return (
    <span className="inline-flex size-5 items-center justify-center rounded-sm bg-white">
      <svg viewBox="0 0 48 48" aria-hidden="true" className="size-3.5">
        <path
          fill="#EA4335"
          d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
        />
        <path
          fill="#4285F4"
          d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 3-2.26 5.54-4.78 7.25l7.73 6c4.51-4.18 7.09-10.36 7.09-17.72z"
        />
        <path
          fill="#FBBC05"
          d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
        />
        <path
          fill="#34A853"
          d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
        />
      </svg>
    </span>
  )
}
