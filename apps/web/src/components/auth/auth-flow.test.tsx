import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { COPY, STAGE } from './auth-flow.fixture.ts'

/**
 * The sign-in flow: three rungs, one component, one state machine.
 *
 * ## What is mocked
 *
 * Only the two seams that leave the browser: `./actions.ts` (Server Functions, which are
 * POST requests here) and `./passkey.ts` (browser capability, tested directly in its own
 * two files). Everything else renders for real -- `Field`, `Button`, `InlineError`,
 * `LiveRegion`, `LocaleSwitcher`, `Stage`. That is the point: the assertions below are
 * about what a planner on a phone actually gets, and a mocked `Field` would let
 * `autocomplete="one-time-code"` disappear without a single test noticing.
 */
const requestCode = vi.fn()
const submitCode = vi.fn()
const setLocale = vi.fn()
const startGoogleSignIn = vi.fn()
const conditionalMediationAvailable = vi.fn()
const platformAuthenticatorAvailable = vi.fn()
const createPasskey = vi.fn()
const signInWithPasskey = vi.fn()
const beginPasskeyEnrollment = vi.fn()
const finishPasskeyEnrollment = vi.fn()
const beginPasskeySignIn = vi.fn()
const finishPasskeySignIn = vi.fn()

vi.mock('./actions.ts', () => ({
  requestCode: (...args: unknown[]) => requestCode(...args),
  submitCode: (...args: unknown[]) => submitCode(...args),
  setLocale: (...args: unknown[]) => setLocale(...args),
  startGoogleSignIn: (...args: unknown[]) => startGoogleSignIn(...args),
  beginPasskeyEnrollment: (...args: unknown[]) => beginPasskeyEnrollment(...args),
  finishPasskeyEnrollment: (...args: unknown[]) => finishPasskeyEnrollment(...args),
  beginPasskeySignIn: (...args: unknown[]) => beginPasskeySignIn(...args),
  finishPasskeySignIn: (...args: unknown[]) => finishPasskeySignIn(...args),
}))

vi.mock('./passkey.ts', () => ({
  conditionalMediationAvailable: () => conditionalMediationAvailable(),
  platformAuthenticatorAvailable: () => platformAuthenticatorAvailable(),
  createPasskey: (...args: unknown[]) => createPasskey(...args),
  signInWithPasskey: (...args: unknown[]) => signInWithPasskey(...args),
}))

const { AuthFlow } = await import('./auth-flow.tsx')

/** Matches DESCENT_MS in auth-flow.tsx, which matches the ground transition in descent.css. */
const DESCENT_MS = 380

/**
 * Just enough of the two WebAuthn shapes to be passed around.
 *
 * Deliberately not realistic: `passkey.ts` owns encoding and decoding and is tested on its
 * own, and every assertion in this file is about which hop ran and what the screen did
 * next. A real attestation here would only make a failure harder to read.
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

const REQUEST_OPTIONS = { challenge: 'Y2hhbGxlbmdl', rpId: 'app.localhost' }

const ASSERTION = {
  id: 'credential-id',
  rawId: 'Y3JlZGVudGlhbC1pZA',
  type: 'public-key' as const,
  clientExtensionResults: {},
  response: { clientDataJSON: 'e30', authenticatorData: 'YXV0aA', signature: 'c2ln' },
}

const assign = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  requestCode.mockResolvedValue({ ok: true })
  submitCode.mockResolvedValue({ ok: true })
  startGoogleSignIn.mockResolvedValue({
    ok: true,
    url: 'https://accounts.google.com/o/oauth2/v2/auth?x=1',
  })
  // Passkeys off unless a test turns them on: the capability effect otherwise races with
  // every unrelated assertion.
  conditionalMediationAvailable.mockResolvedValue(false)
  platformAuthenticatorAvailable.mockResolvedValue(false)
  // The happy enrollment path by default, so a test that wants a failure states which of
  // the three hops fails rather than which two succeed.
  beginPasskeyEnrollment.mockResolvedValue({ ok: true, options: CREATION_OPTIONS })
  createPasskey.mockResolvedValue(REGISTRATION)
  finishPasskeyEnrollment.mockResolvedValue({ ok: true })
  // The sign-in ceremony's happy path, for the same reason: a test that wants a failure
  // names the hop that fails. `signInWithPasskey` is only ever *reached* when a test turns
  // a capability on, so these defaults are inert everywhere else.
  beginPasskeySignIn.mockResolvedValue({ ok: true, options: REQUEST_OPTIONS })
  signInWithPasskey.mockResolvedValue(ASSERTION)
  finishPasskeySignIn.mockResolvedValue({ ok: true })

  // jsdom's `location.assign` is a no-op that logs "Not implemented"; `vi.spyOn` on it
  // records nothing (measured). Replacing the whole object is what makes rung 2 observable.
  Object.defineProperty(window, 'location', {
    value: { ...window.location, assign, href: 'http://app.localhost:3000/' },
    writable: true,
    configurable: true,
  })
})

afterEach(() => {
  vi.useRealTimers()
})

type Overrides = Partial<Parameters<typeof AuthFlow>[0]>

function renderFlow(overrides: Overrides = {}) {
  const user = userEvent.setup()
  const result = render(
    <AuthFlow
      copy={COPY}
      locale="nl"
      locales={['nl', 'en', 'fr']}
      passkeysEnabled={false}
      googleEnabled={false}
      continueHref="/weddings"
      stage={STAGE}
      {...overrides}
    />,
  )
  return { user, ...result }
}

const emailField = () => screen.getByLabelText('LABEL-EMAIL')
const codeField = () => screen.getByLabelText('LABEL-CODE')
const liveRegion = () => document.querySelector('[aria-live="polite"]')

/**
 * Advances the faked clock one second per step, flushing React between each.
 *
 * A single large jump is not equivalent: the resend countdown re-arms itself from an
 * effect, so only the timeout already on the queue would fire and the chain would stop
 * after one tick.
 */
async function tick(seconds: number): Promise<void> {
  for (let i = 0; i < seconds; i++) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000)
    })
  }
}

/** Drives rung 0 to rung 1 with a valid address. */
async function reachVerifyRung(
  user: ReturnType<typeof userEvent.setup>,
  email = 'ilse@studiowit.be',
) {
  await user.type(emailField(), email)
  await user.click(screen.getByRole('button', { name: 'ACTION-CONTINUE' }))
  await screen.findByText('TITLE-VERIFY')
}

describe('rung 0 — identify', () => {
  it('lands on the sign-in screen', () => {
    renderFlow()
    expect(screen.getByRole('heading', { name: 'TITLE-SIGNIN' })).toBeInTheDocument()
    expect(screen.getByText('HELP-SIGNIN')).toBeInTheDocument()
  })

  it('names the rung in words, not only in depth', () => {
    // "Depth is never the only signal" -- the one screen in the product with no status chip
    // still has to say where you are.
    renderFlow()
    expect(screen.getByText('STEP-PUBLIC')).toBeInTheDocument()
  })

  it('offers the address field as the whole affordance', () => {
    renderFlow()
    const field = emailField()
    expect(field).toHaveAttribute('type', 'email')
    expect(field).toHaveAttribute('inputmode', 'email')
    expect(field).toHaveAttribute('placeholder', 'PLACEHOLDER-EMAIL')
  })

  it('puts `webauthn` LAST in autocomplete, per spec', () => {
    // This attribute IS the passkey affordance: conditional mediation offers the credential
    // inside the browser's own autofill sheet, attached to this field. The order is
    // specified, and a browser that does not see `webauthn` last may ignore it entirely.
    renderFlow()
    expect(emailField()).toHaveAttribute('autocomplete', 'username webauthn')
  })

  it('answers the question an empty login page always raises', () => {
    renderFlow()
    expect(screen.getByText('NO-ACCOUNT')).toBeInTheDocument()
  })

  it('draws no passkey button and no method menu', () => {
    renderFlow()
    expect(screen.queryByRole('button', { name: 'ACTION-PASSKEY' })).not.toBeInTheDocument()
  })

  it('has the live region in the DOM from first paint, empty', () => {
    // A live region inserted at the same moment as its message is frequently never
    // announced. Its presence before there is anything to say is the entire contract.
    renderFlow()
    expect(liveRegion()).toBeInTheDocument()
    expect(liveRegion()).toHaveTextContent('')
  })

  it('shows the language switcher, because it is the one claim provable before login', () => {
    renderFlow()
    const nav = screen.getByRole('navigation', { name: 'Taal' })
    expect(within(nav).getByText('NL')).toHaveAttribute('aria-current', 'true')
    expect(within(nav).getByRole('button', { name: 'EN' })).toBeInTheDocument()
    expect(within(nav).getByRole('button', { name: 'FR' })).toBeInTheDocument()
  })

  it('does not make the current language a control that does nothing', () => {
    renderFlow()
    const nav = screen.getByRole('navigation', { name: 'Taal' })
    expect(within(nav).queryByRole('button', { name: 'NL' })).not.toBeInTheDocument()
  })

  it('writes a language choice through the action', async () => {
    const { user } = renderFlow()
    await user.click(screen.getByRole('button', { name: 'FR' }))
    await waitFor(() => expect(setLocale).toHaveBeenCalledWith('fr'))
  })
})

describe('address validation, before anything is sent', () => {
  it.each([
    ['no at sign', 'ilse.studiowit.be'],
    ['nothing after the at', 'ilse@'],
    ['a space', 'a b@c.be'],
  ])('refuses %s without calling the server', async (_name, address) => {
    const { user } = renderFlow()
    await user.type(emailField(), address)
    await user.click(screen.getByRole('button', { name: 'ACTION-CONTINUE' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('ERR-EMAIL-FORMAT')
    expect(requestCode).not.toHaveBeenCalled()
  })

  it('stays on rung 0 when the address is refused', async () => {
    const { user } = renderFlow()
    await user.type(emailField(), 'nope')
    await user.click(screen.getByRole('button', { name: 'ACTION-CONTINUE' }))
    await screen.findByRole('alert')
    expect(screen.getByRole('heading', { name: 'TITLE-SIGNIN' })).toBeInTheDocument()
  })

  it('wires the error to the field for a screen reader, not just visually', async () => {
    const { user } = renderFlow()
    await user.type(emailField(), 'nope')
    await user.click(screen.getByRole('button', { name: 'ACTION-CONTINUE' }))
    await screen.findByRole('alert')
    expect(emailField()).toHaveAttribute('aria-invalid', 'true')
    expect(emailField()).toHaveAttribute('aria-describedby', 'auth-email-error')
    expect(document.getElementById('auth-email-error')).toHaveTextContent('ERR-EMAIL-FORMAT')
  })

  it('keeps what was typed, so nothing has to be retyped', async () => {
    const { user } = renderFlow()
    await user.type(emailField(), 'nope')
    await user.click(screen.getByRole('button', { name: 'ACTION-CONTINUE' }))
    await screen.findByRole('alert')
    expect(emailField()).toHaveValue('nope')
  })

  it('sends a valid address, trimmed', async () => {
    const { user } = renderFlow()
    await user.type(emailField(), '  ilse@studiowit.be  ')
    await user.click(screen.getByRole('button', { name: 'ACTION-CONTINUE' }))
    await waitFor(() => expect(requestCode).toHaveBeenCalledWith('ilse@studiowit.be'))
  })

  it('submits on Enter, without reaching for the button', async () => {
    const { user } = renderFlow()
    await user.type(emailField(), 'ilse@studiowit.be{Enter}')
    await waitFor(() => expect(requestCode).toHaveBeenCalledWith('ilse@studiowit.be'))
  })
})

describe('rung 0 → 1', () => {
  it('moves to the verify rung on success', async () => {
    const { user } = renderFlow()
    await reachVerifyRung(user)
    expect(screen.getByText('STEP-VERIFYING')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'TITLE-SIGNIN' })).not.toBeInTheDocument()
  })

  it('announces the send politely, with the address in it', async () => {
    const { user } = renderFlow()
    await reachVerifyRung(user)
    await waitFor(() =>
      expect(liveRegion()).toHaveTextContent('SENT-BEFORE ilse@studiowit.be SENT-AFTER'),
    )
  })

  it('shows the address back, so a wrong one is visible before the code arrives', async () => {
    const { user } = renderFlow()
    await reachVerifyRung(user)
    expect(screen.getByText('ilse@studiowit.be')).toBeInTheDocument()
  })

  it('gives the code field the attribute that lifts it from Mail on iOS', async () => {
    // `one-time-code` is what puts the code above the keyboard. Load-bearing, not decoration.
    const { user } = renderFlow()
    await reachVerifyRung(user)
    expect(codeField()).toHaveAttribute('autocomplete', 'one-time-code')
    expect(codeField()).toHaveAttribute('inputmode', 'numeric')
  })

  it('allows one more character than the code length, so an extra digit is visible', async () => {
    const { user } = renderFlow()
    await reachVerifyRung(user)
    expect(codeField()).toHaveAttribute('maxlength', '7')
  })

  it('is one field and never six boxes', async () => {
    const { user } = renderFlow()
    await reachVerifyRung(user)
    expect(screen.getAllByRole('textbox')).toHaveLength(1)
  })
})

describe('when the send fails', () => {
  it.each([
    ['rate_limited', 'ERR-RATE-LIMITED'],
    ['delivery_failed', 'ERR-DELIVERY-FAILED'],
    ['unavailable', 'ERR-UNAVAILABLE'],
  ])('renders %s as its own message', async (failure, message) => {
    requestCode.mockResolvedValue({ ok: false, failure })
    const { user } = renderFlow()
    await user.type(emailField(), 'ilse@studiowit.be')
    await user.click(screen.getByRole('button', { name: 'ACTION-CONTINUE' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    expect(screen.getByRole('heading', { name: 'TITLE-SIGNIN' })).toBeInTheDocument()
  })

  it('blames the connection, not the address, when the request throws', async () => {
    // The venue-wifi case. Nothing typed is lost and the rung has not moved.
    requestCode.mockRejectedValue(new Error('network'))
    const { user } = renderFlow()
    await user.type(emailField(), 'ilse@studiowit.be')
    await user.click(screen.getByRole('button', { name: 'ACTION-CONTINUE' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('ERR-OFFLINE')
    expect(emailField()).toHaveValue('ilse@studiowit.be')
  })
})

describe('rung 1 — verify', () => {
  it('submits the typed code against the remembered address', async () => {
    const { user } = renderFlow()
    await reachVerifyRung(user)
    await user.type(codeField(), '194720')
    await user.click(screen.getByRole('button', { name: 'ACTION-SUBMIT' }))
    await waitFor(() => expect(submitCode).toHaveBeenCalledWith('ilse@studiowit.be', '194720'))
  })

  it('submits on Enter', async () => {
    const { user } = renderFlow()
    await reachVerifyRung(user)
    await user.type(codeField(), '194720{Enter}')
    await waitFor(() => expect(submitCode).toHaveBeenCalled())
  })

  it('uses the plural message when more than one attempt remains', async () => {
    submitCode.mockResolvedValue({ ok: false, failure: 'code_wrong', attemptsLeft: 2 })
    const { user } = renderFlow()
    await reachVerifyRung(user)
    await user.type(codeField(), '000000')
    await user.click(screen.getByRole('button', { name: 'ACTION-SUBMIT' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('ERR-CODE-WRONG 2')
  })

  it('switches to the singular message on the last attempt', async () => {
    // The one plural in the whole flow, and a separate key rather than an ICU rule.
    submitCode.mockResolvedValue({ ok: false, failure: 'code_wrong', attemptsLeft: 1 })
    const { user } = renderFlow()
    await reachVerifyRung(user)
    await user.type(codeField(), '000000')
    await user.click(screen.getByRole('button', { name: 'ACTION-SUBMIT' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('ERR-CODE-WRONG-ONE')
  })

  it.each([
    ['code_spent', 'ERR-CODE-SPENT'],
    ['code_expired', 'ERR-CODE-EXPIRED'],
  ])('tells %s apart from a wrong code', async (failure, message) => {
    // "expired", never "invalid" -- the two need different copy because the recovery differs.
    submitCode.mockResolvedValue({ ok: false, failure })
    const { user } = renderFlow()
    await reachVerifyRung(user)
    await user.type(codeField(), '194720')
    await user.click(screen.getByRole('button', { name: 'ACTION-SUBMIT' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(message)
  })

  it('falls back to the generic message for an unrecognised failure', async () => {
    submitCode.mockResolvedValue({ ok: false, failure: 'something_new' })
    const { user } = renderFlow()
    await reachVerifyRung(user)
    await user.type(codeField(), '194720')
    await user.click(screen.getByRole('button', { name: 'ACTION-SUBMIT' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('ERR-UNAVAILABLE')
  })

  it('says offline when verification throws', async () => {
    submitCode.mockRejectedValue(new Error('network'))
    const { user } = renderFlow()
    await reachVerifyRung(user)
    await user.type(codeField(), '194720')
    await user.click(screen.getByRole('button', { name: 'ACTION-SUBMIT' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('ERR-OFFLINE')
  })

  it('wires the code error to the code field', async () => {
    submitCode.mockResolvedValue({ ok: false, failure: 'code_expired' })
    const { user } = renderFlow()
    await reachVerifyRung(user)
    await user.type(codeField(), '194720')
    await user.click(screen.getByRole('button', { name: 'ACTION-SUBMIT' }))
    await screen.findByRole('alert')
    expect(codeField()).toHaveAttribute('aria-describedby', 'auth-code-error')
  })

  it('goes back to the address without costing a page, clearing the error', async () => {
    // "Wrong address" is the most common recovery on this screen.
    submitCode.mockResolvedValue({ ok: false, failure: 'code_expired' })
    const { user } = renderFlow()
    await reachVerifyRung(user)
    await user.type(codeField(), '194720')
    await user.click(screen.getByRole('button', { name: 'ACTION-SUBMIT' }))
    await screen.findByRole('alert')

    await user.click(screen.getByRole('button', { name: 'ACTION-OTHER-ADDRESS' }))
    expect(screen.getByRole('heading', { name: 'TITLE-SIGNIN' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('keeps the address when going back, so it can be corrected rather than retyped', async () => {
    const { user } = renderFlow()
    await reachVerifyRung(user)
    await user.click(screen.getByRole('button', { name: 'ACTION-OTHER-ADDRESS' }))
    expect(emailField()).toHaveValue('ilse@studiowit.be')
  })
})

describe('the resend cooldown', () => {
  it('starts disabled, showing what it is waiting for', async () => {
    const { user } = renderFlow()
    await reachVerifyRung(user)
    const resend = screen.getByRole('button', { name: /RESEND-IN/ })
    expect(resend).toBeDisabled()
    expect(resend).toHaveTextContent('RESEND-IN 30')
  })

  it('counts down and becomes pressable, never a silently ignored tap', async () => {
    // ## Why this test uses fireEvent and act, and no waitFor
    //
    // Testing Library auto-advances fake timers inside `waitFor` ONLY when it detects
    // Jest's -- `jestFakeTimersAreEnabled()` guards on a `jest` global that Vitest does not
    // define. So under `vi.useFakeTimers()` every `findBy*`/`waitFor` polls on a clock
    // nothing advances and blocks until the test times out. Measured, at 5s, twice.
    //
    // The way through is to do no async polling while the clock is faked: `fireEvent` is
    // synchronous, and `act(async …)` flushes the transition's microtasks. `toFake` is
    // narrowed for the same reason as the delay test above -- faking queueMicrotask and
    // MessageChannel stalls React's scheduler.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    renderFlow()

    fireEvent.change(emailField(), { target: { value: 'ilse@studiowit.be' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'ACTION-CONTINUE' }))
    })
    expect(screen.getByText('TITLE-VERIFY')).toBeInTheDocument()

    // Disabled with a visible countdown, never a silently ignored tap.
    expect(screen.getByRole('button', { name: /RESEND-IN/ })).toBeDisabled()

    // One tick, to prove it is counting rather than merely sitting there.
    await tick(1)
    expect(screen.getByRole('button', { name: /RESEND-IN/ })).toHaveTextContent('RESEND-IN 29')

    // One second at a time. The countdown is a CHAIN of timeouts -- each tick's effect
    // schedules the next -- so a single 29s jump fires only the timers already on the queue
    // and leaves the rest unscheduled. Ticking gives React's passive effects a chance to
    // register the next one, which is what the component actually does in a browser.
    await tick(29)

    const resend = screen.getByRole('button', { name: 'ACTION-RESEND' })
    expect(resend).toBeEnabled()

    await act(async () => {
      fireEvent.click(resend)
    })
    expect(requestCode).toHaveBeenCalledTimes(2)
    expect(requestCode).toHaveBeenLastCalledWith('ilse@studiowit.be')
  })

  it('stops counting once it reaches zero, rather than going negative', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    renderFlow()
    fireEvent.change(emailField(), { target: { value: 'ilse@studiowit.be' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'ACTION-CONTINUE' }))
    })
    await tick(45)
    expect(screen.getByRole('button', { name: 'ACTION-RESEND' })).toBeEnabled()
    expect(screen.queryByText(/RESEND-IN -/)).not.toBeInTheDocument()
  })
})

describe('rung 2 — arrive', () => {
  it('lands on the arrival rung and announces it', async () => {
    const { user } = renderFlow()
    await reachVerifyRung(user)
    await user.type(codeField(), '194720')
    await user.click(screen.getByRole('button', { name: 'ACTION-SUBMIT' }))

    expect(await screen.findByRole('heading', { name: 'TITLE-ARRIVE' })).toBeInTheDocument()
    expect(screen.getByText('STEP-PRIVATE')).toBeInTheDocument()
    await waitFor(() => expect(liveRegion()).toHaveTextContent('TITLE-ARRIVE'))
  })

  it('does not linger: it navigates once the descent resolves', async () => {
    // Rung 2 is a transition, not a destination. Signing in ends in the dashboard, not on a
    // screen congratulating you for signing in.
    //
    // Real timers: DESCENT_MS is 380ms, which is cheaper to wait out than a fake clock is
    // to install correctly around React's scheduler. The assertion that it has NOT yet
    // navigated at the moment rung 2 paints is what makes this a test of the delay rather
    // than only of the destination.
    const { user } = renderFlow()
    await reachVerifyRung(user)
    await user.type(codeField(), '194720')
    await user.click(screen.getByRole('button', { name: 'ACTION-SUBMIT' }))
    await screen.findByRole('heading', { name: 'TITLE-ARRIVE' })

    expect(assign).not.toHaveBeenCalled()
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/weddings'), {
      timeout: DESCENT_MS * 4,
    })
  })

  it('keeps a button as the fallback, so a blocked navigation is not a dead end', async () => {
    const { user } = renderFlow()
    await reachVerifyRung(user)
    await user.type(codeField(), '194720')
    await user.click(screen.getByRole('button', { name: 'ACTION-SUBMIT' }))
    await screen.findByRole('heading', { name: 'TITLE-ARRIVE' })

    assign.mockClear()
    await user.click(screen.getByRole('button', { name: 'ACTION-ARRIVE-CONTINUE' }))
    expect(assign).toHaveBeenCalledWith('/weddings')
  })

  it('offers passkey enrollment when the deployment and the device can both do it', async () => {
    platformAuthenticatorAvailable.mockResolvedValue(true)
    const { user } = renderFlow({ passkeysEnabled: true })
    await reachVerifyRung(user)
    await user.type(codeField(), '194720')
    await user.click(screen.getByRole('button', { name: 'ACTION-SUBMIT' }))
    await screen.findByRole('heading', { name: 'TITLE-ARRIVE' })
    expect(await screen.findByText('TITLE-ENROLL')).toBeInTheDocument()
  })

  it('offers no enrollment when passkeys are off', async () => {
    const { user } = renderFlow({ passkeysEnabled: false })
    await reachVerifyRung(user)
    await user.type(codeField(), '194720')
    await user.click(screen.getByRole('button', { name: 'ACTION-SUBMIT' }))
    await screen.findByRole('heading', { name: 'TITLE-ARRIVE' })
    expect(screen.queryByText('TITLE-ENROLL')).not.toBeInTheDocument()
  })

  it('offers no enrollment when the device has no authenticator to keep one in', async () => {
    // The bug this pins: the offer used to be gated on `passkeysEnabled` alone, so a desktop
    // with no Touch ID was told it could sign in with a fingerprint. The deployment being
    // able to VERIFY a passkey says nothing about this device being able to MAKE one.
    platformAuthenticatorAvailable.mockResolvedValue(false)
    const { user } = renderFlow({ passkeysEnabled: true })
    await reachVerifyRung(user)
    await user.type(codeField(), '194720')
    await user.click(screen.getByRole('button', { name: 'ACTION-SUBMIT' }))
    await screen.findByRole('heading', { name: 'TITLE-ARRIVE' })
    await waitFor(() => expect(platformAuthenticatorAvailable).toHaveBeenCalled())
    expect(screen.queryByText('TITLE-ENROLL')).not.toBeInTheDocument()
  })
})

describe('passkey enrollment on rung 2', () => {
  /**
   * The bug: rung 2 rendered an enrollment offer and then navigated away 380ms later, so
   * the offer flashed past unreadably and its two buttons had no handlers to reach anyway.
   *
   * Every test here turns the platform authenticator on, because that is now half the gate.
   * `enrollmentOffered()` waits for the capability effect rather than asserting immediately:
   * the answer arrives from a promise, so the card cannot be in the first paint of rung 2.
   */
  beforeEach(() => {
    platformAuthenticatorAvailable.mockResolvedValue(true)
  })

  async function reachOffer(user: ReturnType<typeof userEvent.setup>) {
    await reachVerifyRung(user)
    await user.type(codeField(), '194720')
    await user.click(screen.getByRole('button', { name: 'ACTION-SUBMIT' }))
    await screen.findByRole('heading', { name: 'TITLE-ARRIVE' })
    await screen.findByText('TITLE-ENROLL')
  }

  const enrollButton = () => screen.getByRole('button', { name: 'ACTION-ENROLL-CONFIRM' })
  const dismissButton = () => screen.getByRole('button', { name: 'ACTION-ENROLL-DISMISS' })

  it('holds the redirect open while the offer is standing', async () => {
    // The whole point. DESCENT_MS * 4 is the same budget the auto-redirect test allows
    // itself, so this fails if the timeout is merely slow rather than genuinely withheld.
    const { user } = renderFlow({ passkeysEnabled: true })
    await reachOffer(user)

    await new Promise((resolve) => setTimeout(resolve, DESCENT_MS * 4))
    expect(assign).not.toHaveBeenCalled()
    expect(screen.getByText('TITLE-ENROLL')).toBeInTheDocument()
  })

  it('leaves for the dashboard when the offer is declined', async () => {
    const { user } = renderFlow({ passkeysEnabled: true })
    await reachOffer(user)

    await user.click(dismissButton())
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/weddings'), {
      timeout: DESCENT_MS * 4,
    })
    // And it stops offering, rather than sitting there during the navigation.
    expect(screen.queryByText('TITLE-ENROLL')).not.toBeInTheDocument()
    expect(createPasskey).not.toHaveBeenCalled()
  })

  it('runs all three hops in order and then leaves', async () => {
    const { user } = renderFlow({ passkeysEnabled: true })
    await reachOffer(user)

    await user.click(enrollButton())
    await waitFor(() => expect(finishPasskeyEnrollment).toHaveBeenCalledWith(REGISTRATION))
    // The challenge has to reach the ceremony unchanged: the server bound it to a cookie,
    // so a re-derived or defaulted options object would fail verification.
    expect(createPasskey).toHaveBeenCalledWith(CREATION_OPTIONS)
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/weddings'), {
      timeout: DESCENT_MS * 4,
    })
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
    const { user } = renderFlow({ passkeysEnabled: true })
    await reachOffer(user)

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
    const { user } = renderFlow({ passkeysEnabled: true })
    await reachOffer(user)

    await user.click(enrollButton())
    await waitFor(() => expect(enrollButton()).toBeEnabled())
    expect(screen.getByText('TITLE-ENROLL')).toBeInTheDocument()
    expect(finishPasskeyEnrollment).not.toHaveBeenCalled()
    // Still held: a cancel is not a decision to leave.
    expect(assign).not.toHaveBeenCalled()
  })

  it('leaves anyway when the server cannot issue a challenge, rather than dead-ending', async () => {
    // The other half of the silence rule. There is nothing to retry -- pressing the button
    // again hits the same refusal -- and they are already signed in, so the dashboard is
    // where they belong.
    beginPasskeyEnrollment.mockResolvedValue({ ok: false })
    const { user } = renderFlow({ passkeysEnabled: true })
    await reachOffer(user)

    await user.click(enrollButton())
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/weddings'), {
      timeout: DESCENT_MS * 4,
    })
    expect(createPasskey).not.toHaveBeenCalled()
  })

  it('leaves anyway when verification is refused, and never says why', async () => {
    // A refusal can mean a counter regression, i.e. a possibly cloned authenticator.
    // passkey.ts: saying so on screen "tells the wrong person something useful".
    finishPasskeyEnrollment.mockResolvedValue({ ok: false })
    const { user } = renderFlow({ passkeysEnabled: true })
    await reachOffer(user)

    await user.click(enrollButton())
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/weddings'), {
      timeout: DESCENT_MS * 4,
    })
    expect(screen.queryByText('ERR-PASSKEY-GONE')).not.toBeInTheDocument()
    expect(screen.queryByText('ERR-UNAVAILABLE')).not.toBeInTheDocument()
  })

  it('survives a thrown Server Function -- the venue-wifi case -- without hanging', async () => {
    beginPasskeyEnrollment.mockRejectedValue(new Error('offline'))
    const { user } = renderFlow({ passkeysEnabled: true })
    await reachOffer(user)

    await user.click(enrollButton())
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/weddings'), {
      timeout: DESCENT_MS * 4,
    })
  })
})

describe('the passkey control', () => {
  it('is absent when the browser can offer the credential from the field', async () => {
    // The field with `autocomplete="username webauthn"` IS the affordance. Our UI adds
    // nothing, which is the refusal of the method menu.
    conditionalMediationAvailable.mockResolvedValue(true)
    platformAuthenticatorAvailable.mockResolvedValue(true)
    renderFlow({ passkeysEnabled: true })
    await waitFor(() => expect(conditionalMediationAvailable).toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: 'ACTION-PASSKEY' })).not.toBeInTheDocument()
  })

  it('appears only for a platform authenticator with no conditional mediation', async () => {
    conditionalMediationAvailable.mockResolvedValue(false)
    platformAuthenticatorAvailable.mockResolvedValue(true)
    renderFlow({ passkeysEnabled: true })
    expect(await screen.findByRole('button', { name: 'ACTION-PASSKEY' })).toBeInTheDocument()
  })

  it('is absent when the device has no authenticator at all', async () => {
    conditionalMediationAvailable.mockResolvedValue(false)
    platformAuthenticatorAvailable.mockResolvedValue(false)
    renderFlow({ passkeysEnabled: true })
    await waitFor(() => expect(platformAuthenticatorAvailable).toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: 'ACTION-PASSKEY' })).not.toBeInTheDocument()
  })

  it('never asks the browser when the deployment cannot verify a passkey', async () => {
    // Either reason is enough to fall to the email path, and asking anyway is how you end
    // up offering a credential the server cannot check.
    renderFlow({ passkeysEnabled: false })
    await Promise.resolve()
    expect(conditionalMediationAvailable).not.toHaveBeenCalled()
    expect(platformAuthenticatorAvailable).not.toHaveBeenCalled()
  })

  it('is secondary weight when it does appear, never primary', async () => {
    conditionalMediationAvailable.mockResolvedValue(false)
    platformAuthenticatorAvailable.mockResolvedValue(true)
    renderFlow({ passkeysEnabled: true })
    const passkey = await screen.findByRole('button', { name: 'ACTION-PASSKEY' })
    const primary = screen.getByRole('button', { name: 'ACTION-CONTINUE' })
    expect(passkey.className).toContain('bg-transparent')
    expect(primary.className).not.toContain('bg-transparent')
  })

  it('is absent on an invitation landing, which pins the address', async () => {
    // Same argument that hides Google there: a discoverable credential ignores the pinned
    // address entirely, so the sheet could sign someone in as a different account while the
    // invitation sits unclaimed.
    conditionalMediationAvailable.mockResolvedValue(false)
    platformAuthenticatorAvailable.mockResolvedValue(true)
    renderFlow({ passkeysEnabled: true, boundEmail: 'tom@studiowit.be' })
    await waitFor(() => expect(platformAuthenticatorAvailable).toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: 'ACTION-PASSKEY' })).not.toBeInTheDocument()
  })
})

/**
 * Passkey sign-in -- the ceremony that turns an enrolled credential into a session.
 *
 * Two entry points running one ceremony: conditional mediation, which starts itself on
 * mount and draws nothing, and the explicit control for browsers without it. The
 * assertions below are about which hop ran and what the screen did next; encoding belongs
 * to `passkey.ts` and is tested there.
 */
describe('passkey sign-in', () => {
  describe('through the browser autofill sheet', () => {
    beforeEach(() => {
      conditionalMediationAvailable.mockResolvedValue(true)
      platformAuthenticatorAvailable.mockResolvedValue(true)
    })

    it('starts a conditional request on mount, drawing no control at all', async () => {
      renderFlow({ passkeysEnabled: true })

      await waitFor(() => expect(signInWithPasskey).toHaveBeenCalled())
      expect(signInWithPasskey.mock.calls[0]?.[1]).toMatchObject({ mediation: 'conditional' })
      // The refusal of the method menu: the field is the whole affordance.
      expect(screen.queryByRole('button', { name: 'ACTION-PASSKEY' })).not.toBeInTheDocument()
    })

    it('lands on rung 2 without ever sending an email', async () => {
      renderFlow({ passkeysEnabled: true })

      expect(await screen.findByRole('heading', { name: 'TITLE-ARRIVE' })).toBeInTheDocument()
      expect(requestCode).not.toHaveBeenCalled()
      // Rung 1 is skipped outright, not passed through quickly.
      expect(screen.queryByLabelText('LABEL-CODE')).not.toBeInTheDocument()
      await waitFor(() => expect(liveRegion()).toHaveTextContent('TITLE-ARRIVE'))
    })

    it('never offers to make a passkey to someone who just used one', async () => {
      // Brief state 27. `canEnroll` is device capability and would say yes here; the OS
      // would then answer "you already have one", which reads as us not knowing.
      renderFlow({ passkeysEnabled: true })
      await screen.findByRole('heading', { name: 'TITLE-ARRIVE' })
      expect(screen.queryByText('TITLE-ENROLL')).not.toBeInTheDocument()
    })

    it('leaves for the dashboard rather than waiting on an offer nobody can see', async () => {
      // The suppression above releases the redirect timer too. Gating only the card would
      // hold rung 2 open forever waiting for a button that is not rendered.
      renderFlow({ passkeysEnabled: true })
      await screen.findByRole('heading', { name: 'TITLE-ARRIVE' })
      await waitFor(() => expect(assign).toHaveBeenCalledWith('/weddings'), {
        timeout: DESCENT_MS * 4,
      })
    })

    it('says nothing at all when the ceremony fails silently', async () => {
      signInWithPasskey.mockResolvedValue('cancelled')
      renderFlow({ passkeysEnabled: true })

      await waitFor(() => expect(signInWithPasskey).toHaveBeenCalled())
      expect(screen.getByRole('heading', { name: 'TITLE-SIGNIN' })).toBeInTheDocument()
      expect(screen.queryByText('ERR-PASSKEY-GONE')).not.toBeInTheDocument()
      expect(screen.queryByText('ERR-UNAVAILABLE')).not.toBeInTheDocument()
      expect(liveRegion()).toHaveTextContent('')
    })

    it('says nothing when the server refuses the assertion, and never why', async () => {
      // A counter regression arrives here as `gone: false`, indistinguishable from a bad
      // signature -- deliberately, because naming it tells the wrong person something.
      finishPasskeySignIn.mockResolvedValue({ ok: false, gone: false })
      renderFlow({ passkeysEnabled: true })

      await waitFor(() => expect(finishPasskeySignIn).toHaveBeenCalled())
      expect(screen.queryByText('ERR-PASSKEY-GONE')).not.toBeInTheDocument()
      expect(liveRegion()).toHaveTextContent('')
    })

    it('says the passkey is gone, and only for an unknown credential', async () => {
      // The single exception to the silence: the one failure a visitor can act on.
      finishPasskeySignIn.mockResolvedValue({ ok: false, gone: true })
      renderFlow({ passkeysEnabled: true })

      expect(await screen.findByText('ERR-PASSKEY-GONE')).toBeInTheDocument()
      // And it leaves the code path usable rather than blocking on it.
      expect(emailField()).toBeInTheDocument()
    })

    it('survives a thrown Server Function without hanging or speaking', async () => {
      beginPasskeySignIn.mockRejectedValue(new Error('offline'))
      renderFlow({ passkeysEnabled: true })

      await waitFor(() => expect(beginPasskeySignIn).toHaveBeenCalled())
      expect(signInWithPasskey).not.toHaveBeenCalled()
      expect(screen.getByRole('heading', { name: 'TITLE-SIGNIN' })).toBeInTheDocument()
    })

    it('aborts the open request when the visitor commits to the email path', async () => {
      // The component does not unmount between rungs, so unmount cleanup alone would leave
      // the conditional request live across rung 1 -- where it could resolve a passkey
      // sign-in on top of a code being typed.
      signInWithPasskey.mockReturnValue(new Promise(() => {}))
      const { user } = renderFlow({ passkeysEnabled: true })
      await waitFor(() => expect(signInWithPasskey).toHaveBeenCalled())

      const signal = signInWithPasskey.mock.calls[0]?.[1]?.signal as AbortSignal
      expect(signal.aborted).toBe(false)

      await user.type(emailField(), 'ilse@studiowit.be')
      await user.click(screen.getByRole('button', { name: 'ACTION-CONTINUE' }))

      expect(signal.aborted).toBe(true)
    })

    it('is not started at all on an invitation landing', async () => {
      /**
       * The positive control is inside the test, and it has to be.
       *
       * Waiting only on `conditionalMediationAvailable` proves nothing here: it resolves
       * one microtask before `setConditionalAvailable(true)` lands, so the effect under
       * test has not yet had its chance to run and a bare `not.toHaveBeenCalled()` passes
       * whether the `boundEmail` guard exists or not -- caught by mutation, 2026-08-30,
       * where deleting the guard left this green.
       *
       * So: render once WITHOUT the bound address and wait for the call that proves the
       * conditional effect has fired, then repeat with the address pinned and give it the
       * same settle. The `act` flush is what closes the window the first version left open.
       */
      const first = renderFlow({ passkeysEnabled: true })
      await waitFor(() => expect(beginPasskeySignIn).toHaveBeenCalled())
      first.unmount()
      beginPasskeySignIn.mockClear()
      signInWithPasskey.mockClear()

      renderFlow({ passkeysEnabled: true, boundEmail: 'tom@studiowit.be' })
      await waitFor(() => expect(conditionalMediationAvailable).toHaveBeenCalledTimes(2))
      await act(async () => {})

      expect(beginPasskeySignIn).not.toHaveBeenCalled()
      expect(signInWithPasskey).not.toHaveBeenCalled()
    })

    it('is not started when the deployment cannot verify a passkey', async () => {
      renderFlow({ passkeysEnabled: false })
      await Promise.resolve()
      expect(beginPasskeySignIn).not.toHaveBeenCalled()
    })

    it('is not started on a blocked invitation, which has no field to attach to', async () => {
      /**
       * `blocked` replaces the whole form, the email input included. Without the guard this
       * fires an unauthenticated challenge request and writes a `verifications` row on a
       * dead-end screen, and opens a `get()` the page has no input to hang it on.
       *
       * Positive control **after** the negative one, not before. The `boundEmail` sibling
       * above runs its control first and can afford to, because it clears the mock in
       * between; here that ordering leaked -- the control render fires this effect a second
       * time after the clear, so the count under test was never zero and the test failed for
       * a reason that had nothing to do with `blocked` (measured 2026-08-31). Asserting the
       * absence first means nothing has run yet that could contaminate it, and the control
       * that follows still proves the wait is long enough to have caught a call.
       */
      const blockedRender = renderFlow({
        passkeysEnabled: true,
        blocked: 'ERR-INVITE-EXPIRED',
      })
      await waitFor(() => expect(conditionalMediationAvailable).toHaveBeenCalled())
      await act(async () => {})

      expect(beginPasskeySignIn).not.toHaveBeenCalled()
      expect(signInWithPasskey).not.toHaveBeenCalled()

      // The control: identical conditions, `blocked` lifted, same settle -- and now it fires.
      blockedRender.unmount()
      renderFlow({ passkeysEnabled: true })
      await waitFor(() => expect(beginPasskeySignIn).toHaveBeenCalled())
    })

    it('does not restart the ceremony when copy arrives as a new object', async () => {
      /**
       * The bug this pins is the worst one in the feature, and it was invisible here until
       * this test existed: `copy` was in the effect's dependency array, and it is an object
       * from the RSC payload whose identity changes on every re-render of the route -- which
       * this effect *causes*, because `beginPasskeySignIn` sets the challenge cookie and
       * `nextCookies()` writes it through `cookies().set()`, which Next 16 documents as
       * re-rendering the page. Effect runs, POSTs, gets a new `copy`, cleanup aborts the
       * open `credentials.get()`, effect fires again. Forever, one round trip per lap, with
       * the credential never staying in the autofill sheet long enough to be picked.
       *
       * Every other test in this file passes the module-constant `COPY`, whose identity
       * never changes, so none of them could see it. This one re-renders with a fresh object
       * carrying identical strings -- exactly what the RSC payload does -- and asserts the
       * ceremony was not restarted. The fix is depending on the two strings the body reads,
       * which compare by value.
       *
       * The ceremony is held open deliberately: a resolved one would move the flow to rung 2
       * and unmount the effect, hiding the restart this is looking for.
       */
      signInWithPasskey.mockReturnValue(new Promise(() => {}))
      const props = {
        locale: 'nl' as const,
        locales: ['nl', 'en', 'fr'] as const,
        passkeysEnabled: true,
        googleEnabled: false,
        continueHref: '/weddings',
        stage: STAGE,
      }
      const { rerender } = render(<AuthFlow copy={COPY} {...props} />)
      await waitFor(() => expect(beginPasskeySignIn).toHaveBeenCalledTimes(1))

      rerender(<AuthFlow copy={{ ...COPY }} {...props} />)
      await act(async () => {})

      expect(beginPasskeySignIn).toHaveBeenCalledTimes(1)
    })

    it('never mints a session for a ceremony the flow already abandoned', async () => {
      /**
       * The venue-wifi race. `finishPasskeySignIn` is what creates the session, so an abort
       * has to be seen BEFORE it, not after: otherwise the visitor ends up signed in
       * server-side while the screen asks for an emailed code.
       *
       * Driven by resolving the ceremony only after the abort has happened, which is the
       * exact interleaving -- the assertion is back, the flow has moved on.
       */
      let releaseCeremony!: (value: unknown) => void
      signInWithPasskey.mockReturnValue(
        new Promise((resolve) => {
          releaseCeremony = resolve
        }),
      )
      const { user } = renderFlow({ passkeysEnabled: true })
      await waitFor(() => expect(signInWithPasskey).toHaveBeenCalled())

      await user.type(emailField(), 'ilse@studiowit.be')
      await user.click(screen.getByRole('button', { name: 'ACTION-CONTINUE' }))

      await act(async () => {
        releaseCeremony(ASSERTION)
      })

      expect(finishPasskeySignIn).not.toHaveBeenCalled()
      // And the code path it chose instead is intact.
      expect(requestCode).toHaveBeenCalledWith('ilse@studiowit.be')
    })
  })

  describe('through the explicit control', () => {
    beforeEach(() => {
      conditionalMediationAvailable.mockResolvedValue(false)
      platformAuthenticatorAvailable.mockResolvedValue(true)
    })

    it('does not open a conditional request -- the OS sheet is modal here', async () => {
      renderFlow({ passkeysEnabled: true })
      await screen.findByRole('button', { name: 'ACTION-PASSKEY' })
      expect(signInWithPasskey).not.toHaveBeenCalled()
    })

    it('runs the ceremony on tap and lands on rung 2', async () => {
      const { user } = renderFlow({ passkeysEnabled: true })
      await user.click(await screen.findByRole('button', { name: 'ACTION-PASSKEY' }))

      await waitFor(() => expect(signInWithPasskey).toHaveBeenCalled())
      // No mediation: this browser cannot draw an autofill sheet, so the ceremony must be
      // the modal one.
      expect(signInWithPasskey.mock.calls[0]?.[1]).toBeUndefined()
      expect(await screen.findByRole('heading', { name: 'TITLE-ARRIVE' })).toBeInTheDocument()
      expect(requestCode).not.toHaveBeenCalled()
    })

    it('shows the waiting label while the sheet is open, without collapsing the button', async () => {
      // Also the cross-device state: the platform is drawing a QR and the only honest thing
      // this screen can say is that it has not finished.
      let release!: (value: unknown) => void
      signInWithPasskey.mockReturnValue(
        new Promise((resolve) => {
          release = resolve
        }),
      )
      const { user } = renderFlow({ passkeysEnabled: true })
      await user.click(await screen.findByRole('button', { name: 'ACTION-PASSKEY' }))

      const busy = await screen.findByRole('button', { name: 'BUSY-CHECKING' })
      expect(busy).toBeInTheDocument()

      await act(async () => {
        release(ASSERTION)
      })
    })

    it('returns to the untouched form when the visitor dismisses the sheet', async () => {
      signInWithPasskey.mockResolvedValue('cancelled')
      const { user } = renderFlow({ passkeysEnabled: true })
      await user.click(await screen.findByRole('button', { name: 'ACTION-PASSKEY' }))

      await waitFor(() => expect(signInWithPasskey).toHaveBeenCalled())
      expect(screen.getByRole('heading', { name: 'TITLE-SIGNIN' })).toBeInTheDocument()
      expect(screen.queryByText('ERR-PASSKEY-GONE')).not.toBeInTheDocument()
      // Pressable again: a dismissal is routine, not a dead end.
      expect(await screen.findByRole('button', { name: 'ACTION-PASSKEY' })).toBeEnabled()
    })

    it('says the passkey is gone for an unknown credential', async () => {
      finishPasskeySignIn.mockResolvedValue({ ok: false, gone: true })
      const { user } = renderFlow({ passkeysEnabled: true })
      await user.click(await screen.findByRole('button', { name: 'ACTION-PASSKEY' }))

      expect(await screen.findByText('ERR-PASSKEY-GONE')).toBeInTheDocument()
    })

    it('never offers to make a passkey afterwards either', async () => {
      const { user } = renderFlow({ passkeysEnabled: true })
      await user.click(await screen.findByRole('button', { name: 'ACTION-PASSKEY' }))
      await screen.findByRole('heading', { name: 'TITLE-ARRIVE' })
      expect(screen.queryByText('TITLE-ENROLL')).not.toBeInTheDocument()
    })
  })

  describe('the code path still offers enrollment', () => {
    it('offers it after a code sign-in on a capable device', async () => {
      // The control assertion for the two suppressions above: they must be about HOW the
      // session was obtained, not about passkeys being on. Without this, gating on a
      // constant `false` would pass every test in this describe block.
      conditionalMediationAvailable.mockResolvedValue(false)
      platformAuthenticatorAvailable.mockResolvedValue(true)
      const { user } = renderFlow({ passkeysEnabled: true })
      await reachVerifyRung(user)
      await user.type(codeField(), '194720')
      await user.click(screen.getByRole('button', { name: 'ACTION-SUBMIT' }))
      await screen.findByRole('heading', { name: 'TITLE-ARRIVE' })

      expect(await screen.findByText('TITLE-ENROLL')).toBeInTheDocument()
    })
  })
})

describe('the Google button', () => {
  const googleButton = () => screen.queryByRole('button', { name: 'ACTION-GOOGLE' })

  it('is absent when the deployment has not configured Google', () => {
    // `googleEnabled` is `googleAvailable()` on the seam -- false unless both client env
    // vars are set. A button that 500s on click is worse than no button.
    renderFlow({ googleEnabled: false })
    expect(googleButton()).not.toBeInTheDocument()
  })

  it('appears below the form, under a divider, when Google is configured', () => {
    renderFlow({ googleEnabled: true })
    expect(googleButton()).toBeInTheDocument()
    expect(screen.getByText('DIVIDER-OR-CONTINUE')).toBeInTheDocument()
  })

  it('is secondary weight, never primary', () => {
    renderFlow({ googleEnabled: true })
    expect(googleButton()?.className).toContain('bg-transparent')
    expect(screen.getByRole('button', { name: 'ACTION-CONTINUE' }).className).not.toContain(
      'bg-transparent',
    )
  })

  it('hides the divider from assistive tech but keeps the word in the DOM', () => {
    // `role="separator"` on the label would drop the word from the a11y tree -- browsers
    // force `presentation` onto a separator's descendants. So the whole strip is
    // `aria-hidden` and a screen reader reaches the button directly instead.
    renderFlow({ googleEnabled: true })
    const label = screen.getByText('DIVIDER-OR-CONTINUE')
    expect(label.closest('[aria-hidden="true"]')).not.toBeNull()
  })

  it('navigates to the URL the server minted', async () => {
    const { user } = renderFlow({ googleEnabled: true })
    await user.click(googleButton() as HTMLElement)
    await waitFor(() => expect(startGoogleSignIn).toHaveBeenCalledOnce())
    expect(assign).toHaveBeenCalledWith('https://accounts.google.com/o/oauth2/v2/auth?x=1')
  })

  it('does nothing visible when the server refuses -- no error, no navigation', async () => {
    startGoogleSignIn.mockResolvedValue({ ok: false })
    const { user } = renderFlow({ googleEnabled: true })
    await user.click(googleButton() as HTMLElement)
    await waitFor(() => expect(startGoogleSignIn).toHaveBeenCalledOnce())
    expect(assign).not.toHaveBeenCalled()
    // The button comes back enabled so a second attempt is possible.
    expect(googleButton()).toBeEnabled()
  })

  it('is hidden on an invitation landing, which pins the address', () => {
    renderFlow({ googleEnabled: true, boundEmail: 'tom@studiowit.be' })
    expect(googleButton()).not.toBeInTheDocument()
  })

  it('is gone once past rung 0', async () => {
    const { user } = renderFlow({ googleEnabled: true })
    await reachVerifyRung(user)
    expect(googleButton()).not.toBeInTheDocument()
  })
})

describe('arriving from an invitation', () => {
  const bound = { boundEmail: 'tom@studiowit.be', lead: 'LEAD-INVITE' }

  it('greets an invitation rather than a sign-in', () => {
    renderFlow(bound)
    expect(screen.getByRole('heading', { name: 'TITLE-INVITE' })).toBeInTheDocument()
    expect(screen.getByText('LEAD-INVITE')).toBeInTheDocument()
  })

  it('binds the address: pre-filled and not editable', () => {
    renderFlow(bound)
    expect(emailField()).toHaveValue('tom@studiowit.be')
    expect(emailField()).toHaveAttribute('readonly')
    expect(screen.getByText('NOTE-LOCKED')).toBeInTheDocument()
  })

  it('sends to the bound address even though the field was never typed in', async () => {
    // Note what this does NOT prove. `onIdentify` reads `(boundEmail ?? email)`, but `email`
    // state is already seeded from `boundEmail` at mount and the field is `readOnly`, so no
    // interaction can make the two disagree -- mutation confirms that dropping the
    // `boundEmail ??` half leaves this green. The expression is belt-and-braces against a
    // future edit that makes the field editable, and only a test that could set state
    // directly would isolate it. Pinning the OUTCOME is still worth it: the invitation must
    // send to the invited address and to nothing else.
    const { user } = renderFlow(bound)
    await user.click(screen.getByRole('button', { name: 'ACTION-CONTINUE' }))
    await waitFor(() => expect(requestCode).toHaveBeenCalledWith('tom@studiowit.be'))
  })

  it('shows a blocking message instead of the form when the invitation is unusable', () => {
    renderFlow({ blocked: 'ERR-INVITE-EXPIRED Ilse' })
    expect(screen.getByRole('alert')).toHaveTextContent('ERR-INVITE-EXPIRED Ilse')
    expect(screen.queryByLabelText('LABEL-EMAIL')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'ACTION-CONTINUE' })).not.toBeInTheDocument()
  })

  it('still shows the language switcher on a blocked invitation', () => {
    // The one thing that stays useful when nothing else on the screen is.
    renderFlow({ blocked: 'ERR-INVITE-ACCEPTED' })
    expect(screen.getByRole('navigation', { name: 'Taal' })).toBeInTheDocument()
  })

  it('renders a notice above a usable form, without blocking it', () => {
    // A session that expired mid-work arrives with one.
    renderFlow({ notice: 'ERR-SESSION-EXPIRED' })
    expect(screen.getByText('ERR-SESSION-EXPIRED')).toBeInTheDocument()
    expect(emailField()).toBeInTheDocument()
  })
})

describe('the panel beside the form', () => {
  it('descends with the rung', async () => {
    const { user, container } = renderFlow()
    expect(container.querySelector('aside')).toHaveAttribute('data-rung', '0')
    await reachVerifyRung(user)
    expect(container.querySelector('aside')).toHaveAttribute('data-rung', '1')
  })

  it('stays hidden from assistive technology throughout', async () => {
    const { user, container } = renderFlow()
    await reachVerifyRung(user)
    expect(container.querySelector('aside')).toHaveAttribute('aria-hidden', 'true')
  })
})
