import type {
  PasskeyAssertion,
  PasskeyCreationOptions,
  PasskeyRegistration,
  PasskeyRequestOptions,
} from '@guestnote/core/auth'

/**
 * The browser half of the passkey ladder.
 *
 * Three jobs, and none of them is a network call. The capability checks answer whether
 * this browser can offer a passkey from the email field itself, which decides whether the
 * interface draws an explicit control or nothing at all. `createPasskey()` and
 * `signInWithPasskey()` then run the two WebAuthn ceremonies -- the parts that *cannot*
 * happen on the server, since only the browser can reach the authenticator. Every
 * challenge they consume and every credential they produce travels through Server
 * Functions in `actions.ts`; this file opens no connection of its own.
 *
 * ## Why the capability check is split in two
 *
 * The surface has two independent reasons to hide the passkey control: the browser cannot
 * do it, or the deployment cannot verify it (`passkeysAvailable()` on the seam).
 * Conflating them is how you end up offering a credential the server cannot check. Both
 * are needed, and either one is enough to fall to the email path.
 *
 * ## Why the interface draws nothing when it works
 *
 * Conditional mediation means the browser offers the credential inside its own autofill
 * sheet, attached to the email input. Our UI contributes no button, no prompt and no
 * copy -- the field with `autocomplete="username webauthn"` is the entire affordance. A
 * primary-weight "sign in with a passkey" button beside it is the method menu the surface
 * brief refuses, and the conversion research behind that refusal is in the brief's
 * Appendix A.
 */

/** Whether this browser can offer a passkey from inside an autofill sheet. */
export async function conditionalMediationAvailable(): Promise<boolean> {
  if (typeof window === 'undefined') return false
  const api = window.PublicKeyCredential
  // Optional-chained because the method postdates the interface: a browser can have
  // WebAuthn and not have conditional UI, which is precisely the case that needs the
  // explicit control rather than nothing.
  if (typeof api?.isConditionalMediationAvailable !== 'function') return false
  try {
    return await api.isConditionalMediationAvailable()
  } catch {
    return false
  }
}

/** Whether this device has a built-in authenticator at all -- Face ID, Touch ID, Hello. */
export async function platformAuthenticatorAvailable(): Promise<boolean> {
  if (typeof window === 'undefined') return false
  const api = window.PublicKeyCredential
  if (typeof api?.isUserVerifyingPlatformAuthenticatorAvailable !== 'function') return false
  try {
    return await api.isUserVerifyingPlatformAuthenticatorAvailable()
  } catch {
    return false
  }
}

/**
 * The **browser-side** passkey outcomes the interface renders identically: nothing.
 *
 * States 2 and 3 in the surface brief -- the visitor dismissed the OS sheet, or the browser
 * cannot do it at all. No red, no message, no live-region announcement. A dismissed sheet is
 * a routine and deliberate act and must never be dressed as an error.
 *
 * ## `'refused'` was here and is gone, 2026-08-31
 *
 * It stood for brief state 6: the server refusing an assertion whose signature counter went
 * backwards. That state is real and still renders as silence -- but the refusal happens on
 * the far side of a Server Function, so nothing in this file can ever produce it, and the
 * variant sat unconstructible for as long as it existed. It now travels as `'silent'` from
 * `runPasskeySignIn` in `auth-flow.tsx`, which is the only place that can see a server
 * answer, and which folds a counter regression in with a bad signature and an unreachable
 * server deliberately -- see `finishPasskeySignIn` in actions.ts for why only "your passkey
 * is gone" is allowed out.
 *
 * Rejected: keeping the variant and having `runPasskeySignIn` return it. That would have put
 * a browser-outcome type on a value the browser never produces, to save one word.
 */
export type SilentPasskeyOutcome = 'cancelled' | 'unsupported'

/**
 * base64url -> bytes, and back.
 *
 * Hand-rolled rather than `PublicKeyCredential.parseCreationOptionsFromJSON()` and
 * `credential.toJSON()`, which exist for exactly this and would delete both functions and
 * most of `createPasskey()` below. They were rejected on reach: `toJSON()` landed in Safari
 * 17.4 and Firefox 135, so an iPad two OS versions behind -- which is most iPads a planner
 * hands a client -- would get a sign-in screen where enrollment throws rather than one
 * where it is simply not offered. These work in every browser that has WebAuthn at all.
 *
 * The consolation prize is that they are pure, so `passkey.test.ts` tests them with no DOM.
 */
export function fromBase64Url(value: string): Uint8Array {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
  // Padded explicitly rather than relying on `atob`: engines differ on whether they
  // tolerate a missing `=`, and the base64url the spec sends never has one.
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export function toBase64Url(buffer: ArrayBuffer): string {
  let binary = ''
  for (const byte of new Uint8Array(buffer)) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * Told what went wrong, so somebody can fix it -- **never so the screen can say it.**
 *
 * `SilentPasskeyOutcome` deliberately renders four different WebAuthn failures identically,
 * and that stays true. But collapsing them before anyone has *seen* them is how enrollment
 * failed on staging from 2026-08-19 to 2026-08-31 with nobody able to say why: the ceremony
 * never returned an attestation, the interface correctly said nothing, and the reason died
 * in a `catch` block (measured 2026-08-31 -- three verification rows written, zero passkey
 * rows, zero log lines).
 *
 * The `DOMException` name is the whole diagnosis and the spec is careful about which ones it
 * hands out:
 *
 *   - `NotAllowedError` -- dismissed, or timed out. The spec deliberately merges "the
 *     visitor said no" with "the authenticator failed", so this one stays ambiguous by
 *     design and that is fine: it is the benign case.
 *   - `NotSupportedError` -- no algorithm or option the authenticator accepts. What
 *     `residentKey: 'required'` looks like on hardware that cannot store one.
 *   - `SecurityError` -- the `rpID` is not a registrable suffix of the origin, or the origin
 *     is not secure.
 *   - `InvalidStateError` -- a credential for this account already exists on this device.
 *
 * A **callback rather than a return value**, so the outcome type keeps its narrowing
 * (`typeof result === 'string'`) and no caller can accidentally render this. Nothing here is
 * user data: a class name and the browser's own message, both attacker-influenced, which is
 * why the Server Function that receives it clamps what it accepts.
 */
export type CeremonyFailure = { readonly name: string; readonly message: string }

/** Names the failure without trusting it to be an `Error` -- a browser may throw anything. */
function describe(error: unknown): CeremonyFailure {
  if (error instanceof Error) return { name: error.name, message: error.message }
  return { name: 'NonError', message: String(error) }
}

/**
 * How long to wait for a WebAuthn ceremony before giving up on it ourselves.
 *
 * **The browser's own `timeout` is not a backstop.** WebAuthn's `timeout` is enforced by the
 * *user agent*, and a browser extension that intercepts `navigator.credentials.create()`
 * replaces the user agent's implementation entirely -- so if it never settles the promise,
 * nothing settles it. Measured on staging 2026-08-31: a password-manager extension whose
 * desktop connection was broken swallowed every enrollment ceremony for **eleven days**. No
 * throw, no rejection, no report; the challenge row was written and then silence, on every
 * environment, from the day the feature shipped.
 *
 * A ceremony that has not answered by now is not a slow authenticator, it is a lost one.
 * Fifteen seconds past the server's own deadline, so this only ever fires *after* a
 * well-behaved browser would already have rejected -- meaning a `CeremonyTimeout` report
 * always means something replaced the browser, never that a person was slow.
 */
const CEREMONY_GRACE_MS = 15_000
const DEFAULT_CEREMONY_TIMEOUT_MS = 60_000

/**
 * Race a ceremony against the clock, and **abort it** rather than merely stop waiting.
 *
 * The abort matters as much as the timer: `AbortSignal` is the one lever the spec gives a
 * page over an in-flight ceremony, so aborting closes the OS sheet and unsticks the
 * interface instead of leaving a modal nobody can dismiss over a screen that will not move.
 * A well-behaved interceptor honours it; one that does not at least leaves us a log line.
 */
async function withCeremonyTimeout<T>(
  run: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  onTimeout: () => void,
): Promise<T | 'timeout'> {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined

  const expiry = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => {
      onTimeout()
      controller.abort()
      resolve('timeout')
    }, timeoutMs)
  })

  try {
    return await Promise.race([run(controller.signal), expiry])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

/**
 * Run the enrollment ceremony: challenge in, attestation out.
 *
 * Returns a `SilentPasskeyOutcome` rather than throwing, because every way this can fail is
 * one the surface renders identically -- as nothing. See that type: a dismissed OS sheet
 * and a genuine device failure arrive as the same `NotAllowedError`, and the spec is
 * deliberate about not letting a site tell them apart. Trying to would be both impossible
 * and, if it worked, a way to probe which authenticators a visitor has.
 *
 * Note what is spread and what is replaced. `options` goes through whole and only the three
 * base64url fields are swapped for buffers, so a field the spec adds later still reaches
 * the browser even though `PasskeyCreationOptions` does not model it yet -- the cost that
 * type's comment names, paid down here rather than left to bite.
 */
export async function createPasskey(
  options: PasskeyCreationOptions,
  onFailure?: (failure: CeremonyFailure) => void,
): Promise<PasskeyRegistration | SilentPasskeyOutcome> {
  if (typeof navigator === 'undefined' || typeof navigator.credentials?.create !== 'function') {
    onFailure?.({ name: 'NoCredentialsApi', message: 'navigator.credentials.create missing' })
    return 'unsupported'
  }

  let credential: Credential | null | 'timeout'
  try {
    credential = await withCeremonyTimeout(
      (signal) =>
        navigator.credentials.create({
          // Cast because the DOM types want `BufferSource` and `AuthenticatorTransport[]`
          // where the JSON form has strings, and the spread carries fields TypeScript cannot
          // see. Every field the cast covers is written two lines above it.
          publicKey: {
            ...options,
            challenge: fromBase64Url(options.challenge),
            user: { ...options.user, id: fromBase64Url(options.user.id) },
            excludeCredentials: (options.excludeCredentials ?? []).map((c) => ({
              ...c,
              type: 'public-key',
              id: fromBase64Url(c.id),
            })),
          } as unknown as PublicKeyCredentialCreationOptions,
          signal,
        }),
      (options.timeout ?? DEFAULT_CEREMONY_TIMEOUT_MS) + CEREMONY_GRACE_MS,
      () =>
        onFailure?.({
          name: 'CeremonyTimeout',
          message:
            'navigator.credentials.create never settled -- an extension may have intercepted it',
        }),
    )
  } catch (error) {
    onFailure?.(describe(error))
    return 'cancelled'
  }

  // The timeout already reported; rendered as `cancelled` like every other silent outcome.
  if (credential === 'timeout') return 'cancelled'

  // Null is documented as possible and means the browser declined without throwing.
  if (!credential) {
    onFailure?.({ name: 'NullCredential', message: 'create() resolved null' })
    return 'cancelled'
  }

  const created = credential as PublicKeyCredential
  const attestation = created.response as AuthenticatorAttestationResponse

  return {
    id: created.id,
    rawId: toBase64Url(created.rawId),
    type: 'public-key',
    clientExtensionResults: created.getClientExtensionResults() as Record<string, unknown>,
    response: {
      clientDataJSON: toBase64Url(attestation.clientDataJSON),
      attestationObject: toBase64Url(attestation.attestationObject),
      // Optional-chained for the same reason the capability checks are: the method
      // postdates the interface, and a browser without it still registers fine. An empty
      // list only costs a slightly less specific OS sheet on the next sign-in.
      transports: attestation.getTransports?.() ?? [],
    },
  }
}

/**
 * Run the sign-in ceremony: challenge in, signed assertion out.
 *
 * The mirror of `createPasskey()` above, and it follows the same three rules for the same
 * reasons: hand-rolled base64url rather than `parseRequestOptionsFromJSON()` (rejected on
 * reach -- see `fromBase64Url`), the whole options object spread through with only the
 * encoded fields replaced, and every failure returned as a `SilentPasskeyOutcome` rather
 * than thrown.
 *
 * ## `mediation: 'conditional'` is the whole feature
 *
 * With it, the browser attaches the credential to its own autofill sheet on the field
 * carrying `autocomplete="username webauthn"` and this call sits open until the visitor
 * picks it -- which is why it needs a signal, below. Without it the call is modal: the OS
 * sheet appears immediately, which is what the explicit control wants and what the
 * conditional path must never do.
 *
 * ## What is deliberately NOT passed
 *
 * No `authenticatorAttachment`, and no transport filtering. Enrollment pins `platform` on
 * purpose -- its copy promises a face or a fingerprint on *this* device -- and it would be
 * easy to mirror that here for symmetry. It would also suppress the cross-device flow: a
 * planner at a laptop whose passkey lives on their phone needs the platform free to draw
 * its own QR. The surface brief's words are "we must simply not suppress it". Sign-in makes
 * no single-device promise, so it imposes no single-device filter.
 *
 * ## The signal
 *
 * A conditional request has no natural end. It stays open until the visitor uses it, the
 * page goes away, or somebody aborts it -- and a request left running while the flow has
 * moved on to the code screen can resolve onto a rung that no longer exists. `AuthFlow`
 * owns the controller and aborts on unmount and on email submit. An abort arrives here as
 * an `AbortError` and is reported as `cancelled`, which is correct twice over: it *is* a
 * cancellation, and the three silent outcomes are one outcome by design.
 */
export async function signInWithPasskey(
  options: PasskeyRequestOptions,
  init?: {
    mediation?: 'conditional'
    signal?: AbortSignal
    onFailure?: (failure: CeremonyFailure) => void
  },
): Promise<PasskeyAssertion | SilentPasskeyOutcome> {
  if (typeof navigator === 'undefined' || typeof navigator.credentials?.get !== 'function') {
    init?.onFailure?.({ name: 'NoCredentialsApi', message: 'navigator.credentials.get missing' })
    return 'unsupported'
  }

  /**
   * `allowCredentials` is pulled OUT of the spread, not overridden inside it.
   *
   * An empty array is not the same request as no array: it is the value that says "these
   * specific credentials and no others", so it would refuse every discoverable credential --
   * which on this path is all of them. A conditional spread cannot express that, because
   * `...options` has already carried the empty array in by the time the condition is
   * evaluated, and skipping the override leaves it there. Destructuring is what actually
   * removes the key. (Measured 2026-08-31: the conditional-spread version shipped the empty
   * array while a comment three lines up claimed it did not.)
   *
   * `rest` still spreads whole, so a field this seam type does not model reaches the browser
   * -- the cost `PasskeyRequestOptions`' comment names, paid down the same way `createPasskey`
   * pays it.
   */
  const { allowCredentials, ...rest } = options

  let credential: Credential | null | 'timeout'
  try {
    /**
     * **Only the modal path gets a timeout.** A conditional request is *supposed* to sit
     * open indefinitely -- it is attached to the autofill sheet and resolves whenever the
     * visitor picks their passkey, which may be a minute after the page loaded or never.
     * Timing it out would kill the feature on exactly the browsers it is built for.
     *
     * The explicit control is the opposite: an OS sheet is on screen and someone is looking
     * at it, so a ceremony that never answers is the swallowed-by-an-extension case that
     * `CEREMONY_GRACE_MS` documents.
     */
    const run = (signal?: AbortSignal) =>
      navigator.credentials.get({
        // Cast for the same reason `createPasskey` casts: the DOM types want `BufferSource`
        // where the JSON form has base64url strings, and the spread carries fields
        // TypeScript cannot see. Every field the cast covers is written just below it.
        publicKey: {
          ...rest,
          challenge: fromBase64Url(options.challenge),
          ...(allowCredentials?.length
            ? {
                allowCredentials: allowCredentials.map((c) => ({
                  ...c,
                  type: 'public-key',
                  id: fromBase64Url(c.id),
                })),
              }
            : {}),
        } as unknown as PublicKeyCredentialRequestOptions,
        ...(init?.mediation ? { mediation: init.mediation } : {}),
        // The caller's signal wins when it has one -- AuthFlow owns the conditional
        // request's lifetime and aborts it when the visitor types their email instead.
        ...(init?.signal ? { signal: init.signal } : signal ? { signal } : {}),
      })

    credential = init?.mediation
      ? await run(init.signal)
      : await withCeremonyTimeout(
          run,
          (options.timeout ?? DEFAULT_CEREMONY_TIMEOUT_MS) + CEREMONY_GRACE_MS,
          () =>
            init?.onFailure?.({
              name: 'CeremonyTimeout',
              message:
                'navigator.credentials.get never settled -- an extension may have intercepted it',
            }),
        )
  } catch (error) {
    // An abort is the conditional path's ordinary ending, not a failure worth a log line --
    // AuthFlow cancels this every time somebody types their email instead.
    if (!init?.signal?.aborted) init?.onFailure?.(describe(error))
    return 'cancelled'
  }

  // The timeout already reported; rendered as `cancelled` like every other silent outcome.
  if (credential === 'timeout') return 'cancelled'

  if (!credential) {
    init?.onFailure?.({ name: 'NullCredential', message: 'get() resolved null' })
    return 'cancelled'
  }

  const got = credential as PublicKeyCredential
  const assertion = got.response as AuthenticatorAssertionResponse

  return {
    id: got.id,
    rawId: toBase64Url(got.rawId),
    type: 'public-key',
    clientExtensionResults: got.getClientExtensionResults() as Record<string, unknown>,
    response: {
      clientDataJSON: toBase64Url(assertion.clientDataJSON),
      authenticatorData: toBase64Url(assertion.authenticatorData),
      signature: toBase64Url(assertion.signature),
      // Present for a discoverable credential, absent otherwise. Encoded and forwarded
      // because the payload shape expects it -- but see `PasskeyAssertion`: the server
      // looks the credential up by `id` and ignores this.
      ...(assertion.userHandle ? { userHandle: toBase64Url(assertion.userHandle) } : {}),
    },
  }
}
