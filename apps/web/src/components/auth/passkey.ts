import type { PasskeyCreationOptions, PasskeyRegistration } from '@guestnote/core/auth'

/**
 * The browser half of the passkey ladder.
 *
 * Two jobs, and neither of them is a network call. The capability checks answer whether
 * this browser can offer a passkey from the email field itself, which decides whether the
 * interface draws an explicit control or nothing at all. `createPasskey()` then runs the
 * WebAuthn ceremony itself -- the one part of enrollment that *cannot* happen on the
 * server, since only the browser can reach the authenticator. The challenge it consumes and
 * the attestation it produces both travel through Server Functions in `actions.ts`; this
 * file opens no connection of its own.
 *
 * ## Why the capability check is split in two
 *
 * The surface has two independent reasons to hide the passkey control: the browser cannot
 * do it, or the deployment cannot verify it (`passkeysAvailable()` on the seam, false
 * until W3). Conflating them is how you end up offering a credential the server cannot
 * check. Both are needed, and either one is enough to fall to the email path.
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
 * The three passkey outcomes the interface renders **identically**: nothing.
 *
 * States 2, 3 and 6 in the surface brief -- the visitor dismissed the OS sheet, the
 * browser cannot do it, or the server refused an assertion whose signature counter went
 * backwards. No red, no message, no explanation.
 *
 * A dismissed sheet is a routine and deliberate act and must never be dressed as an
 * error. A counter regression means a possible cloned authenticator, and saying so on
 * screen tells the wrong person something useful. Silence is the correct rendering for
 * all three, so they share one name.
 */
export type SilentPasskeyOutcome = 'cancelled' | 'unsupported' | 'refused'

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
): Promise<PasskeyRegistration | SilentPasskeyOutcome> {
  if (typeof navigator === 'undefined' || typeof navigator.credentials?.create !== 'function') {
    return 'unsupported'
  }

  let credential: Credential | null
  try {
    credential = await navigator.credentials.create({
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
    })
  } catch {
    return 'cancelled'
  }

  // Null is documented as possible and means the browser declined without throwing.
  if (!credential) return 'cancelled'

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
