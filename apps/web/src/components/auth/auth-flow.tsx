'use client'

import { AUTH_POLICY } from '@guestnote/core/auth'
import { Button, LinkButton } from '@guestnote/ui/button'
import { Field } from '@guestnote/ui/field'
import { InlineError } from '@guestnote/ui/inline-error'
import { LiveRegion } from '@guestnote/ui/live-region'
import { LocaleSwitcher } from '@guestnote/ui/locale-switcher'
import { useEffect, useRef, useState, useTransition } from 'react'
import type { Locale } from '../../lib/locales.ts'
import { Wordmark } from '../brand/wordmark.tsx'
import { requestCode, setLocale, submitCode } from './actions.ts'
import { type AuthCopy, fill, splitAround } from './copy.ts'
import { conditionalMediationAvailable, platformAuthenticatorAvailable } from './passkey.ts'
import { Stage, type StageContent } from './stage.tsx'

type Props = {
  copy: AuthCopy
  locale: Locale
  locales: readonly Locale[]
  /** False until W3. See `passkeysAvailable()` on the seam. */
  passkeysEnabled: boolean
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
}

/** 0 identify, 1 verify, 2 arrive. Monotonic; the passkey path skips 1 entirely. */
type Rung = 0 | 1 | 2

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
  boundEmail,
  lead,
  blocked,
  notice,
  continueHref,
  stage,
}: Props) {
  const [rung, setRung] = useState<Rung>(0)
  const [email, setEmail] = useState(boundEmail ?? '')
  const [error, setError] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const [resendIn, setResendIn] = useState(0)
  const [showPasskeyControl, setShowPasskeyControl] = useState(false)
  const [pending, startTransition] = useTransition()

  const emailRef = useRef<HTMLInputElement>(null)
  const codeRef = useRef<HTMLInputElement>(null)
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
      if (!cancelled) setShowPasskeyControl(platform && !conditional)
    })()
    return () => {
      cancelled = true
    }
  }, [passkeysEnabled])

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
    setEmail(address)
    send(address)
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

      // Signing in ends in the dashboard, not on a screen that congratulates you for
      // signing in. Rung 2 is a transition, not a destination -- long enough for the
      // ground to finish its last step so the descent resolves rather than being cut off,
      // and no longer.
      //
      // The button below stays as the fallback: if this navigation is blocked or slow,
      // a dead end is worse than a redundant control.
      window.setTimeout(
        () => window.location.assign(continueHref),
        prefersReducedMotion() ? 0 : DESCENT_MS,
      )
    })
  }

  const stepLabel =
    rung === 0 ? copy.steps.public : rung === 1 ? copy.steps.verifying : copy.steps.private
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
            <div className="mb-6 flex items-center gap-2 text-xs">
              <div className="flex gap-1" aria-hidden="true">
                {([0, 1, 2] as const).map((i) => (
                  <span
                    key={i}
                    className={`h-0.5 w-5 rounded-full bg-current transition-opacity duration-300 ${
                      i <= rung ? 'opacity-100' : 'opacity-25'
                    }`}
                  />
                ))}
              </div>
              <span className="font-semibold">{stepLabel}</span>
            </div>

            {rung === 0 && (
              <>
                <h1 className="mb-1.5 text-2xl leading-tight font-semibold tracking-tight">
                  {boundEmail ? copy.invite.title : copy.signIn.title}
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
                      <Button variant="secondary" className="mt-2 h-10" icon={<KeyIcon />}>
                        {copy.signIn.passkey}
                      </Button>
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
                <div className="mb-4 inline-flex size-9 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <TickIcon />
                </div>
                <h1 className="mb-1.5 text-2xl leading-tight font-semibold tracking-tight">
                  {copy.arrive.title}
                </h1>
                <p className="mb-6 text-sm leading-relaxed text-muted-foreground">
                  {copy.arrive.body}
                </p>
                <Button className="mt-1" onClick={() => window.location.assign(continueHref)}>
                  {copy.arrive.continue}
                </Button>

                {/* The enrollment prompt belongs to the post-login success moment, which is
                  the shell's, not this surface's -- prompting mid-sign-in converts worse.
                  It is rendered here only while there is no shell to host it, and it is
                  gated on the same flag as everything else passkey-shaped, so it cannot
                  offer a credential the deployment could not verify. M3 moves it. */}
                {passkeysEnabled && (
                  <div className="mt-7 rounded-[var(--radius)] border-input border p-4">
                    <h2 className="mb-1 text-sm font-semibold">{copy.enroll.title}</h2>
                    <p className="mb-3.5 text-xs leading-relaxed text-muted-foreground">
                      {copy.enroll.body}
                    </p>
                    <Button className="h-9" icon={<KeyIcon />}>
                      {copy.enroll.confirm}
                    </Button>
                    <Button variant="secondary" className="mt-2 h-8">
                      {copy.enroll.dismiss}
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/*
        The line every login page needs and this one needs more than most: the form asks
        for an address, and the only question it raises -- "what if I do not have one" --
        had no answer on screen. The honest answer is that there is no self-serve signup,
        so it is also the thing that stops a planner hunting for a Create account link
        that will never exist.
      */}
        <p className="text-muted-foreground shrink-0 px-5 pb-6 text-xs leading-relaxed lg:px-8">
          {copy.noAccount}
        </p>
      </div>

      <Stage rung={rung} content={stage} />
    </div>
  )
}

function KeyIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      aria-hidden="true"
      className="size-3.5"
    >
      <rect x="2.5" y="6.5" width="11" height="7.5" rx="1.6" />
      <path d="M5.2 6.5V4.4a2.8 2.8 0 015.6 0v2.1" />
    </svg>
  )
}

function TickIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
      className="size-4"
    >
      <path d="M3.5 8.5l3 3 6-6.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
