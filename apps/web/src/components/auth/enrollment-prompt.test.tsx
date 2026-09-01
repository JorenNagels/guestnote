import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The shell's post-login passkey offer.
 *
 * ## Where these tests came from
 *
 * Most of them were `describe('passkey enrollment on rung 2')` in `auth-flow.test.tsx` until
 * 2026-09-01, when the offer moved off the sign-in surface onto the shell. They are moved
 * rather than rewritten: the ceremony is the same three hops with the same silence rules,
 * and a rewrite would have quietly dropped whichever branch nobody remembered.
 *
 * Two did not survive the move, and neither is a loss:
 *
 *   - "holds the redirect open while the offer is standing" -- rung 2's 380ms redirect was
 *     the thing that made an offer rendered there unreadable. There is no redirect here.
 *   - "leaves for the dashboard when the offer is declined" -- dismissing now just closes a
 *     card on a page the planner is already on.
 *
 * What replaces them is the marker-stripping assertion below, which is this file's version
 * of the same rule: **never navigate while a ceremony is outstanding.**
 *
 * ## What is mocked
 *
 * The two Server Functions, the browser ceremony, and `next/navigation`. `Button` renders
 * for real, because `busy` / `disabled` are half of what these tests assert and a stubbed
 * button would let both disappear silently.
 */
const beginPasskeyEnrollment = vi.fn()
const finishPasskeyEnrollment = vi.fn()
const reportCeremonyFailure = vi.fn()
const platformAuthenticatorAvailable = vi.fn()
const createPasskey = vi.fn()
const replace = vi.fn()
let searchParams = 'welcome=passkey'

vi.mock('./actions.ts', () => ({
  beginPasskeyEnrollment: (...a: unknown[]) => beginPasskeyEnrollment(...a),
  finishPasskeyEnrollment: (...a: unknown[]) => finishPasskeyEnrollment(...a),
  reportCeremonyFailure: (...a: unknown[]) => reportCeremonyFailure(...a),
}))

vi.mock('./passkey.ts', () => ({
  platformAuthenticatorAvailable: () => platformAuthenticatorAvailable(),
  createPasskey: (...a: unknown[]) => createPasskey(...a),
}))

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(searchParams),
  usePathname: () => '/weddings',
  useRouter: () => ({ replace: (...a: unknown[]) => replace(...a) }),
}))

const { EnrollmentPrompt } = await import('./enrollment-prompt.tsx')

/**
 * Just enough of the two WebAuthn shapes to be passed around. Deliberately not realistic:
 * `passkey.ts` owns encoding and is tested on its own, and every assertion here is about
 * which hop ran and what the screen did next.
 */
const CREATION_OPTIONS = {
  challenge: 'Y2hhbGxlbmdl',
  rp: { id: 'app.localhost', name: 'Guestnote' },
  user: { id: 'dXNlcg', name: 'ilse@studiowit.be', displayName: 'Ilse' },
  pubKeyCredParams: [{ type: 'public-key' as const, alg: -7 }],
}

const REGISTRATION = {
  id: 'credential-id',
  rawId: 'Y3JlZGVudGlhbC1pZA',
  type: 'public-key' as const,
  clientExtensionResults: {},
  response: { clientDataJSON: 'e30', attestationObject: 'o2M', transports: ['internal'] },
}

const LABELS = {
  title: 'TITLE-ENROLL',
  body: 'BODY-ENROLL',
  confirm: 'ACTION-ENROLL-CONFIRM',
  dismiss: 'ACTION-ENROLL-DISMISS',
  busy: 'BUSY-ENROLLING',
}

beforeEach(() => {
  vi.clearAllMocks()
  searchParams = 'welcome=passkey'
  platformAuthenticatorAvailable.mockResolvedValue(true)
  // The happy path by default, so a test that wants a failure states which of the three hops
  // fails rather than which two succeed.
  beginPasskeyEnrollment.mockResolvedValue({ ok: true, options: CREATION_OPTIONS })
  createPasskey.mockResolvedValue(REGISTRATION)
  finishPasskeyEnrollment.mockResolvedValue({ ok: true })
  reportCeremonyFailure.mockResolvedValue(undefined)
})

const renderPrompt = () => {
  const user = userEvent.setup()
  return { user, ...render(<EnrollmentPrompt labels={LABELS} />) }
}

/**
 * Waits for the capability effect rather than asserting immediately: the answer arrives from
 * a promise, so the card cannot be in the first paint.
 */
const offer = () => screen.findByText('TITLE-ENROLL')
const enrollButton = () => screen.getByRole('button', { name: 'ACTION-ENROLL-CONFIRM' })
const dismissButton = () => screen.getByRole('button', { name: 'ACTION-ENROLL-DISMISS' })

describe('when the offer is shown at all', () => {
  it('appears in the moment after a sign-in that did not use a passkey', async () => {
    renderPrompt()
    expect(await offer()).toBeInTheDocument()
  })

  it('stays away without the marker, so it is a moment and not a standing nag', async () => {
    // Not cosmetic: `createPasskeyChallenge` is behind `freshSessionMiddleware`, so an offer
    // shown a day later would fail -- silently, because every passkey failure here renders
    // as nothing. The marker is what keeps the prompt inside the window the seam allows.
    searchParams = ''
    renderPrompt()

    await waitFor(() => expect(platformAuthenticatorAvailable).not.toHaveBeenCalled())
    expect(screen.queryByText('TITLE-ENROLL')).not.toBeInTheDocument()
  })

  it('ignores a marker with the wrong value rather than any marker at all', async () => {
    searchParams = 'welcome=1'
    renderPrompt()

    await waitFor(() => expect(platformAuthenticatorAvailable).not.toHaveBeenCalled())
    expect(screen.queryByText('TITLE-ENROLL')).not.toBeInTheDocument()
  })

  it('stays away when the device has no authenticator to keep one in', async () => {
    // The bug this pins predates the move: the offer was once gated on the deployment being
    // able to VERIFY a passkey, which says nothing about this device being able to MAKE one,
    // so a desktop with no Touch ID was told it could sign in with a fingerprint.
    platformAuthenticatorAvailable.mockResolvedValue(false)
    renderPrompt()

    await waitFor(() => expect(platformAuthenticatorAvailable).toHaveBeenCalled())
    expect(screen.queryByText('TITLE-ENROLL')).not.toBeInTheDocument()
  })
})

describe('the enrollment ceremony', () => {
  it('runs all three hops and hands the challenge through unchanged', async () => {
    const { user } = renderPrompt()
    await offer()

    await user.click(enrollButton())
    await waitFor(() => expect(finishPasskeyEnrollment).toHaveBeenCalledWith(REGISTRATION))
    // The challenge has to reach the ceremony unchanged: the server bound it to a cookie, so
    // a re-derived or defaulted options object would fail verification.
    expect(createPasskey).toHaveBeenCalledWith(CREATION_OPTIONS, expect.any(Function))
  })

  it('shows the busy label while the OS sheet is open, without collapsing the button', async () => {
    // A ceremony can sit on a face or a fingerprint for half a minute. `button.tsx` argues
    // that a control which vanishes mid-request reads as the tap having failed.
    let release: (value: unknown) => void = () => {}
    createPasskey.mockReturnValue(
      new Promise((resolve) => {
        release = resolve
      }),
    )
    const { user } = renderPrompt()
    await offer()

    await user.click(enrollButton())
    expect(await screen.findByRole('button', { name: 'BUSY-ENROLLING' })).toBeInTheDocument()
    expect(dismissButton()).toBeDisabled()

    await act(async () => {
      release(REGISTRATION)
    })
    await waitFor(() => expect(finishPasskeyEnrollment).toHaveBeenCalled())
  })

  it('returns to the offer when the visitor dismisses the OS sheet, saying nothing', async () => {
    // `SilentPasskeyOutcome`: a dismissed sheet is routine and deliberate, and must never be
    // dressed as an error. Retryable, because the visitor may have fat-fingered it.
    createPasskey.mockResolvedValue('cancelled')
    const { user } = renderPrompt()
    await offer()

    await user.click(enrollButton())
    await waitFor(() => expect(enrollButton()).toBeEnabled())
    expect(screen.getByText('TITLE-ENROLL')).toBeInTheDocument()
    expect(finishPasskeyEnrollment).not.toHaveBeenCalled()
  })

  it('closes without a word when the server cannot issue a challenge', async () => {
    // There is nothing to retry -- pressing again hits the same refusal -- and they are
    // already signed in, so the dashboard they are looking at is where they belong.
    beginPasskeyEnrollment.mockResolvedValue({ ok: false })
    const { user } = renderPrompt()
    await offer()

    await user.click(enrollButton())
    await waitFor(() => expect(screen.queryByText('TITLE-ENROLL')).not.toBeInTheDocument())
    expect(createPasskey).not.toHaveBeenCalled()
  })

  it('closes without a word when verification is refused, and never says why', async () => {
    // A refusal can mean a counter regression, i.e. a possibly cloned authenticator.
    // passkey.ts: saying so on screen "tells the wrong person something useful".
    finishPasskeyEnrollment.mockResolvedValue({ ok: false })
    const { user } = renderPrompt()
    await offer()

    await user.click(enrollButton())
    await waitFor(() => expect(screen.queryByText('TITLE-ENROLL')).not.toBeInTheDocument())
  })

  it('survives a thrown Server Function -- the venue-wifi case -- without hanging', async () => {
    beginPasskeyEnrollment.mockRejectedValue(new Error('offline'))
    const { user } = renderPrompt()
    await offer()

    await user.click(enrollButton())
    await waitFor(() => expect(screen.queryByText('TITLE-ENROLL')).not.toBeInTheDocument())
  })

  it('closes on dismiss without running any ceremony', async () => {
    const { user } = renderPrompt()
    await offer()

    await user.click(dismissButton())
    expect(screen.queryByText('TITLE-ENROLL')).not.toBeInTheDocument()
    expect(createPasskey).not.toHaveBeenCalled()
  })
})

/**
 * The instrumentation, and the reason it has its own describe.
 *
 * `test-critic` found on 2026-09-01 that the enrollment ceremony's failure reporter was
 * never once invoked by the old suite -- the only assertion touching it was
 * `expect.any(Function)`, so an empty callback body passed. That callback is the thing built
 * to stop the next eleven-day silence, and it was the least-tested code in the range.
 */
describe('what reaches the log when the ceremony fails', () => {
  it('names the WebAuthn failure the screen is not allowed to name', async () => {
    createPasskey.mockImplementation(async (_options: unknown, onFailure: (f: unknown) => void) => {
      onFailure({ name: 'NotSupportedError', message: 'no resident key' })
      return 'cancelled'
    })
    const { user } = renderPrompt()
    await offer()

    await user.click(enrollButton())

    await waitFor(() =>
      expect(reportCeremonyFailure).toHaveBeenCalledWith(
        'enroll',
        'NotSupportedError',
        'no resident key',
      ),
    )
    // And still says nothing on screen: the offer is simply back, ready to retry.
    expect(screen.getByText('TITLE-ENROLL')).toBeInTheDocument()
  })

  it('reports a transport failure on the challenge hop, which is where the silence was', async () => {
    beginPasskeyEnrollment.mockRejectedValue(new TypeError('Failed to fetch'))
    const { user } = renderPrompt()
    await offer()

    await user.click(enrollButton())

    await waitFor(() =>
      expect(reportCeremonyFailure).toHaveBeenCalledWith(
        'enroll',
        'ActionTransport',
        expect.stringContaining('beginPasskeyEnrollment'),
      ),
    )
  })

  it('reports a transport failure on the verification hop, the last blind spot', async () => {
    finishPasskeyEnrollment.mockRejectedValue(new TypeError('Failed to fetch'))
    const { user } = renderPrompt()
    await offer()

    await user.click(enrollButton())

    await waitFor(() =>
      expect(reportCeremonyFailure).toHaveBeenCalledWith(
        'enroll',
        'ActionTransport',
        expect.stringContaining('finishPasskeyEnrollment'),
      ),
    )
  })

  it('does not report a refusal the seam already reported', async () => {
    // `ok: false` produced a report inside the seam. A second one here would double-count.
    finishPasskeyEnrollment.mockResolvedValue({ ok: false })
    const { user } = renderPrompt()
    await offer()

    await user.click(enrollButton())
    await waitFor(() => expect(screen.queryByText('TITLE-ENROLL')).not.toBeInTheDocument())

    expect(reportCeremonyFailure).not.toHaveBeenCalled()
  })
})

/**
 * The rule the rung-2 redirect used to carry, in the one place that still has a write worth
 * protecting: **never navigate away while a ceremony is outstanding.** A navigation with the
 * OS sheet open posts the attestation from a dying document, which is exactly what a server
 * redirect did for eleven days.
 */
describe('stripping the marker', () => {
  it('does not touch the URL while the ceremony is in flight', async () => {
    let release: (value: unknown) => void = () => {}
    createPasskey.mockReturnValue(
      new Promise((resolve) => {
        release = resolve
      }),
    )
    const { user } = renderPrompt()
    await offer()

    await user.click(enrollButton())
    await waitFor(() => expect(createPasskey).toHaveBeenCalled())
    expect(replace).not.toHaveBeenCalled()

    await act(async () => {
      release(REGISTRATION)
    })
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/weddings', { scroll: false }))
  })

  it('strips it on dismiss, so a reload does not re-ask something answered', async () => {
    const { user } = renderPrompt()
    await offer()

    await user.click(dismissButton())
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/weddings', { scroll: false }))
  })

  it('leaves the URL alone when there was no marker to strip', async () => {
    searchParams = ''
    renderPrompt()

    await waitFor(() => expect(platformAuthenticatorAvailable).not.toHaveBeenCalled())
    expect(replace).not.toHaveBeenCalled()
  })
})

describe('how it sits beside the dashboard', () => {
  it('is a labelled region and not a dialog, so it cannot steal focus', async () => {
    renderPrompt()
    await offer()

    expect(screen.getByRole('region', { name: 'TITLE-ENROLL' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('does not move focus off whatever the planner was reading', async () => {
    render(
      <>
        <button type="button">elders</button>
        <EnrollmentPrompt labels={LABELS} />
      </>,
    )
    const elsewhere = screen.getByRole('button', { name: 'elders' })
    act(() => elsewhere.focus())

    await offer()

    expect(document.activeElement).toBe(elsewhere)
  })
})

/** `fireEvent` and not `userEvent` here: nothing is typed, and the shell's own tests do the same. */
describe('the dismiss control while working', () => {
  it('cannot be pressed mid-ceremony', async () => {
    createPasskey.mockReturnValue(new Promise(() => {}))
    renderPrompt()
    await offer()

    fireEvent.click(enrollButton())

    await waitFor(() => expect(dismissButton()).toBeDisabled())
    fireEvent.click(dismissButton())
    expect(screen.getByText('TITLE-ENROLL')).toBeInTheDocument()
  })
})
