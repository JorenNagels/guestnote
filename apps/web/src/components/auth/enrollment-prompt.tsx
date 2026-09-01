'use client'

import { Button } from '@guestnote/ui/button'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import {
  beginPasskeyEnrollment,
  finishPasskeyEnrollment,
  reportCeremonyFailure,
} from './actions.ts'
import { KeyIcon } from './icons.tsx'
import { createPasskey, platformAuthenticatorAvailable } from './passkey.ts'
import { reportingCatch } from './reporting.ts'

/**
 * The marker the sign-in flow puts on `continueHref`, and the only thing that opens this
 * prompt.
 *
 * A query rather than a cookie: a cookie written during sign-in is a fourth thing that can
 * be set and never cleared, and `cookies().set()` from a Server Function is the exact
 * mechanism that re-rendered the login route and broke enrollment for eleven days. A query
 * is also the one form of this signal a reader can see in the URL bar while debugging,
 * which is worth something on a flow that was invisible for that long.
 */
export const WELCOME_PARAM = 'welcome'
export const WELCOME_PASSKEY = 'passkey'

export type EnrollmentLabels = Readonly<{
  title: string
  body: string
  confirm: string
  dismiss: string
  busy: string
}>

type Phase = 'offered' | 'working' | 'settled'

/**
 * "Keep a passkey on this device?", asked once, in the moment after a sign-in that did not
 * use one.
 *
 * ## Why this is on the shell and not on the login surface
 *
 * It was rung 2 of `auth-flow.tsx` from 2026-08-19 to 2026-09-01, and that file said
 * throughout that the offer belongs to the post-login moment on the shell -- prompting
 * mid-sign-in converts worse, because the visitor is still executing "get in", not "set
 * this up". It lived there only because there was no shell to host it. There is now.
 *
 * The move buys back something concrete beyond the conversion argument: **the login page
 * gets its redirect back.** Sending a signed-in visitor to the dashboard is what made
 * enrollment structurally impossible for eleven days -- asking for a challenge sets a
 * cookie, `cookies().set()` re-renders the route, and the re-render hit the guard with the
 * OS sheet still open. The guard was deleted on 2026-08-31 to unblock the feature, at the
 * cost of a signed-in visitor being shown a sign-in form. With the ceremony running here
 * instead there is no flow left on `/login` to protect, and `login/page.tsx` carries the
 * rest of that argument.
 *
 * ## Why it is gated on a just-signed-in marker and not on "this user has no passkey"
 *
 * Because `createPasskeyChallenge` sits behind the plugin's `freshSessionMiddleware`, which
 * refuses a session older than a day. A standing "you have no passkey yet" nag in the shell
 * would work on day one and start failing on day two -- and every passkey failure on this
 * path renders as nothing, by design, so nobody would ever see it happening. The marker
 * keeps the prompt inside the window where the seam already says the call is legal.
 *
 * **This is the thing to remember when account settings grows an "add a passkey" button:**
 * that call site needs a re-authentication step in front of it, not a wider middleware in
 * the seam. `better-auth.ts`'s `createPasskeyChallenge` makes the same point from the other
 * side.
 *
 * ## Three gates, each answering a different question
 *
 * **`offer`** -- resolved on the server in `(app)/layout.tsx`: the deployment can verify a
 * passkey, and this user has none yet. That second half is what rung 2 could never ask. It
 * only knew whether *this* sign-in used a passkey, so a planner who signed in with a code
 * on a laptop that already held one was offered a second, and the OS sheet answered by
 * telling them they already had it. That is the half of the login brief's state 27 the old
 * placement could not reach, and the reason the gate is worth a round trip.
 *
 * **`welcome=passkey`** -- they just signed in, and not with a passkey. Written by
 * `auth-flow.tsx`, which is the only place that knows which rung they came off.
 *
 * **`platformAuthenticatorAvailable()`** -- this device has somewhere to keep one. Offering
 * a face or a fingerprint to a desktop with no authenticator is an offer that can only
 * fail, which was a real bug on rung 2 before it was gated.
 */
export function EnrollmentPrompt({ labels }: { labels: EnrollmentLabels }) {
  const params = useSearchParams()
  const pathname = usePathname()
  const router = useRouter()
  const [available, setAvailable] = useState(false)
  const [phase, setPhase] = useState<Phase>('offered')

  const welcomed = params.get(WELCOME_PARAM) === WELCOME_PASSKEY

  useEffect(() => {
    if (!welcomed) return
    let cancelled = false
    void platformAuthenticatorAvailable().then((yes) => {
      if (!cancelled) setAvailable(yes)
    })
    return () => {
      cancelled = true
    }
  }, [welcomed])

  /**
   * Strip the marker once the moment is over, so a reload or a back-button does not re-ask
   * something already answered.
   *
   * **On `settled` only, never on `working`.** A navigation while the OS sheet is open is
   * the exact failure that cost eleven days: the attestation posts from a document that is
   * being replaced and dies with it. `router.replace` is a soft navigation and the sheet is
   * modal over the page, so it would very likely survive -- but the rule is "never navigate
   * away from an outstanding write", not "this particular navigation is probably fine".
   *
   * `scroll: false` because this is a correction to the URL, not a change of destination,
   * and the planner is already reading whatever the dashboard put on screen.
   */
  useEffect(() => {
    if (phase !== 'settled' || !welcomed) return
    router.replace(pathname, { scroll: false })
  }, [phase, welcomed, router, pathname])

  /**
   * Three hops, two of them across the network, and every failure is silent.
   *
   * Moved from `auth-flow.tsx`'s `onEnroll` with the substance unchanged, including why
   * each branch lands where it does: back on the offer when the browser or the visitor said
   * no, straight to `settled` when the server did, because that one has nothing to retry
   * and `SilentPasskeyOutcome` forbids saying which of the four it was.
   *
   * Not a `startTransition`: the middle hop is a human deciding, which can sit for half a
   * minute, and a React transition should not be held open for that. `phase` is the busy
   * signal instead.
   */
  async function onEnroll() {
    setPhase('working')

    const challenge = await beginPasskeyEnrollment().catch(
      reportingCatch('enroll', 'beginPasskeyEnrollment', { ok: false } as const),
    )
    if (!challenge.ok) {
      setPhase('settled')
      return
    }

    const created = await createPasskey(challenge.options, (failure) => {
      void reportCeremonyFailure('enroll', failure.name, failure.message).catch(() => {})
    })
    // A `SilentPasskeyOutcome` is a string; an attestation is an object. Narrowing on the
    // shape rather than a flag keeps passkey.ts's "every silent outcome is one outcome"
    // promise from needing a second representation here.
    if (typeof created === 'string') {
      setPhase('offered')
      return
    }

    // Settled either way, and that is not a shrug. A verification failure means the server
    // rejected an attestation it had itself challenged -- a counter regression, a bad
    // origin, a cloned authenticator -- and none of those get better by pressing again.
    //
    // The `.catch` here swallows a *transport* failure: the Server Function never reaching
    // the server, or answering non-2xx. When that happens the seam is never entered so its
    // report never runs, and the ceremony succeeded so the ceremony reporter never runs
    // either. Both instrumented paths sit on the far side of exactly this line, which is
    // why enrollment could fail leaving a challenge row, no passkey row and no log line
    // anywhere (2026-08-19 to 2026-08-31). `ok: false` from the seam is NOT reported here
    // -- that already produced a report inside the seam. Only the throw is ours.
    await finishPasskeyEnrollment(created).catch(
      reportingCatch('enroll', 'finishPasskeyEnrollment', { ok: false }),
    )
    setPhase('settled')
  }

  if (!welcomed || !available || phase === 'settled') return null

  return (
    <section
      // A labelled region and not a dialog: this arrives beside the dashboard the planner
      // actually asked for, and must not take focus from it. A modal here would interrupt
      // the very moment that moving off the login surface exists to protect. `<section>`
      // with an accessible name IS `role="region"`, and the element carries it for free.
      aria-label={labels.title}
      className="border-border bg-background fixed inset-x-3 bottom-3 z-50 rounded-[var(--radius)] border p-4 shadow-lg md:inset-x-auto md:right-4 md:bottom-4 md:w-80 print:hidden"
    >
      <h2 className="mb-1 text-sm font-semibold">{labels.title}</h2>
      <p className="text-muted-foreground mb-3.5 text-xs leading-relaxed">{labels.body}</p>
      <Button
        className="h-9"
        icon={<KeyIcon />}
        busy={phase === 'working'}
        busyLabel={labels.busy}
        onClick={() => void onEnroll()}
      >
        {labels.confirm}
      </Button>
      {/* Disabled rather than hidden while the ceremony runs. The OS sheet is modal over the
          page anyway, and a control that vanishes mid-request reads as the tap having
          failed -- the same argument button.tsx makes for never collapsing a busy button. */}
      <Button
        variant="secondary"
        className="mt-2 h-8"
        disabled={phase === 'working'}
        onClick={() => setPhase('settled')}
      >
        {labels.dismiss}
      </Button>
    </section>
  )
}
