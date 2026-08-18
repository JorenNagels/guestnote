/**
 * The browser half of the passkey ladder.
 *
 * Nothing here talks to a server. It answers one question -- can this browser offer a
 * passkey from the email field itself -- and the answer decides whether the interface
 * shows an explicit control or nothing at all.
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
