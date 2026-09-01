/**
 * The shapes the sign-in surface is allowed to know about.
 *
 * Deliberately narrow. Nothing here mentions a session cookie, a verification row or a
 * provider name, because the whole point of the seam
 * (research/07-auth-and-tenancy.md section 1, "The seam stays regardless") is that
 * swapping Better Auth for something else stays a bounded job. If a provider concept
 * leaks into this file, that promise is already broken.
 *
 * ## The WebAuthn exception, 2026-08-19
 *
 * This file used to promise it named no "WebAuthn challenge" either, and
 * `PasskeyCreationOptions` below breaks the letter of that while keeping the point. A
 * challenge is not a provider concept: the shape is the W3C
 * `PublicKeyCredentialCreationOptionsJSON`, defined by the browser, and any replacement
 * for Better Auth would have to produce the same bytes under the same field names.
 *
 * The alternative was keeping it out of here by having the app POST `/passkey/*` itself.
 * That is the worse leak of the two: a Better Auth *route path* in app code is the thing
 * a provider swap would actually have to hunt down, and it would also put an unverified
 * attestation on a path the seam never sees.
 */

/** Why a step failed, in terms the interface can actually render. */
export type AuthFailure =
  /** The address is syntactically fine but we will not send anything right now. */
  | 'rate_limited'
  /** The code was correct once and is not any more. */
  | 'code_spent'
  /** The code has aged out. Distinct from `code_wrong` on purpose: the brief's
   *  state 13 says "expired", never "invalid", and the two need different copy. */
  | 'code_expired'
  /** Wrong digits. Carries `attemptsLeft`. */
  | 'code_wrong'
  /** The address hard-bounced. `email_log`'s job to know; ours to say. */
  | 'delivery_failed'
  /**
   * The assertion was for a credential this deployment has never heard of -- deleted
   * server-side, or minted against a different `rpID` (a staging passkey on production).
   *
   * **The only passkey failure the interface is allowed to name.** Every other one renders
   * as nothing: the browser-side ones (a dismissed sheet, an absent authenticator) via
   * `SilentPasskeyOutcome` in `apps/web/src/components/auth/passkey.ts`, and the server-side
   * ones (a signature that did not verify, a counter that went backwards) via
   * `runPasskeySignIn`'s `'silent'` in `auth-flow.tsx`. Both files argue why silence is the
   * correct rendering and not a shrug. This one is different because it is the only failure
   * the visitor can act on: their passkey is gone, and the code path still works.
   *
   * docs/specs/0002-signing-in-with-a-passkey.md argues the split, and
   * `finishPasskeySignIn` in `actions.ts` is where it narrows to a single boolean so the
   * dangerous distinctions cannot reach a client at all.
   */
  | 'passkey_unknown'
  /** The provider is not reachable, or not built yet. */
  | 'unavailable'

export type AuthResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly failure: AuthFailure; readonly attemptsLeft?: number }

/**
 * What a successful code request tells the interface.
 *
 * It deliberately does NOT say whether the address belongs to an account. The brief's
 * enumeration-resistance rule is that an unknown email produces the identical rung-1
 * screen as a known one, and the cheapest way to keep that true forever is to make the
 * distinction unrepresentable here rather than to remember not to render it.
 */
export type CodeRequested = {
  readonly resendAfterSeconds: number
  readonly expiresInSeconds: number
}

export type Verified = {
  readonly userId: string
  /** `users.name` is nullable, so a first-run account has to be asked once. */
  readonly needsName: boolean
}

/**
 * A staff invitation, resolved from its token, as the landing screen needs it.
 *
 * `wedding` is present when `invitations.wedding_id` is set -- the couple/editor shape.
 * The planner surface cannot serve that yet, and the brief is explicit that it must say
 * so honestly rather than 404, because a 404 reads as a bug to the planner who sent it.
 */
export type Invitation =
  | {
      readonly kind: 'staff'
      readonly email: string
      readonly inviter: string
      readonly org: string
      readonly role: 'admin' | 'member'
    }
  | { readonly kind: 'wedding'; readonly inviter: string; readonly org: string }
  | { readonly kind: 'expired'; readonly inviter: string }
  | { readonly kind: 'accepted' }
  /** Guessed, truncated, or purged. One outcome for all three, on purpose: telling
   *  them apart tells an attacker which tokens once existed. */
  | { readonly kind: 'unknown' }

/**
 * The authenticated principal, as research/07-auth-and-tenancy.md section 3 defines it.
 *
 * A discriminated union rather than a `{ orgId?, weddingId? }` bag, so that "an org
 * member without a wedding id" is unrepresentable rather than merely checked. That is
 * the highest-risk path in the tenancy model and the type is the braces.
 */
export type Principal =
  | {
      readonly kind: 'orgStaff'
      readonly userId: string
      readonly orgId: string
      readonly role: 'owner' | 'admin'
    }
  | {
      readonly kind: 'assignedStaff'
      readonly userId: string
      readonly orgId: string
      readonly weddingId: string
      readonly role: 'member'
    }
  | {
      readonly kind: 'weddingMember'
      readonly userId: string
      readonly orgId: string
      readonly weddingId: string
      readonly role: 'couple' | 'editor'
    }

export type Session = {
  readonly userId: string
  readonly email: string
  readonly name: string | null
  /** Where rung 2 lands them. Decided 2026-08-18: the last-used org, with the shell's
   *  switcher owning everything after that. */
  readonly lastOrgId: string | null
}

/**
 * WebAuthn credential-creation options, as `navigator.credentials.create()` wants them
 * once the base64url fields are decoded back into buffers.
 *
 * The W3C JSON form: JSON has no ArrayBuffer, so `challenge`, `user.id` and each
 * `excludeCredentials[].id` arrive as base64url strings. Decoding them is the browser
 * half's job -- `apps/web/src/components/auth/passkey.ts`.
 *
 * Written out structurally rather than re-exported from `@simplewebauthn/types`, because a
 * re-export is exactly the provider type this seam exists to stop. The cost is real and
 * worth naming: a field the spec adds later is absent from this type until someone adds
 * it. That is why the browser half spreads the whole object through and only *replaces*
 * the three fields named here -- an unmodelled string field still reaches the browser.
 */
export type PasskeyCreationOptions = {
  readonly challenge: string
  readonly rp: { readonly id?: string; readonly name: string }
  readonly user: { readonly id: string; readonly name: string; readonly displayName: string }
  readonly pubKeyCredParams: readonly { readonly type: 'public-key'; readonly alg: number }[]
  readonly timeout?: number
  readonly excludeCredentials?: readonly {
    readonly id: string
    readonly type?: 'public-key'
    readonly transports?: readonly string[]
  }[]
  readonly authenticatorSelection?: {
    readonly authenticatorAttachment?: 'platform' | 'cross-platform'
    readonly residentKey?: 'discouraged' | 'preferred' | 'required'
    readonly requireResidentKey?: boolean
    readonly userVerification?: 'discouraged' | 'preferred' | 'required'
  }
  readonly attestation?: 'none' | 'indirect' | 'direct' | 'enterprise'
}

/**
 * What the authenticator handed back, base64url again, on its way to be verified.
 *
 * Attacker-controlled in full. It is safe to accept only because nothing here is trusted:
 * the attestation is checked against a challenge the server put in a signed cookie, and
 * the credential is bound to the session's own user id. `verifyPasskeyRegistration` on the
 * seam is where both of those happen, which is why this type carries no user id of its own
 * -- there is no field here for a caller to get wrong.
 */
export type PasskeyRegistration = {
  readonly id: string
  readonly rawId: string
  readonly type: 'public-key'
  readonly authenticatorAttachment?: string
  readonly clientExtensionResults: Record<string, unknown>
  readonly response: {
    readonly clientDataJSON: string
    readonly attestationObject: string
    /** `usb`, `internal`, `hybrid`. Stored so a later assertion can hint the right sheet. */
    readonly transports?: readonly string[]
  }
}

/**
 * WebAuthn credential-*request* options, for `navigator.credentials.get()`.
 *
 * The sign-in twin of `PasskeyCreationOptions`, and everything that type's comment says
 * about the W3C JSON form and the cost of writing it out structurally applies here too --
 * including the reason the browser half spreads the object through and replaces only the
 * encoded fields.
 *
 * ## What is missing from this type, on purpose
 *
 * There is no user id and no email, and `allowCredentials` is **absent for the
 * unauthenticated visitor**, which is every sign-in this product performs. Better Auth
 * populates it only when a session already exists (read off the installed
 * @better-auth/passkey 1.7.1: it looks the user's passkeys up from
 * `getSessionFromCtx(ctx)`), so an unauthenticated assertion is always against a
 * *discoverable* credential -- the authenticator itself decides which account it is
 * offering, and the address typed into the field is never sent anywhere.
 *
 * **That premise depends on a redirect two packages away, and it stopped holding for one
 * day.** `beginPasskeySignIn` runs on mount of the login page, so "no session exists" is
 * true only because `login/page.tsx` sends a signed-in visitor to the dashboard. That guard
 * was removed on 2026-08-31 to unblock enrollment and restored on 2026-09-01, and in between
 * a signed-in visitor at `/login` got a populated `allowCredentials` -- on a shared laptop,
 * the autofill sheet quietly narrowed to whoever was signed in last, and anyone else fell
 * back to an email code with nothing on screen saying why. Nothing leaked: the ids returned
 * are the session owner's own, and `verifyPasskeyAssertion` mints the session from the
 * *stored* credential's `userId` and never reads anything the caller sent.
 *
 * Found by `tenancy-auditor` 2026-09-01. Recorded rather than fixed in the browser half,
 * because the fix is the redirect being back -- suppressing the symptom here would mean
 * reading the session on the login page again, which is the read that page just removed.
 *
 * That is what forces `residentKey: 'required'` on enrollment over in `better-auth.ts`: a
 * non-discoverable credential would enrol perfectly and then be unofferable here, with
 * nothing on either side able to notice.
 */
export type PasskeyRequestOptions = {
  readonly challenge: string
  readonly rpId?: string
  readonly timeout?: number
  readonly userVerification?: 'discouraged' | 'preferred' | 'required'
  readonly allowCredentials?: readonly {
    readonly id: string
    readonly type?: 'public-key'
    readonly transports?: readonly string[]
  }[]
  // No `extensions`, deliberately -- `PasskeyCreationOptions` omits it too. The W3C type
  // for it is a closed interface with no index signature, so modelling it here would mean
  // either importing the provider's type across the seam or widening it to something that
  // does not typecheck against the source. It still reaches the browser: the ceremony
  // spreads the whole options object and replaces only the encoded fields, which is the
  // paid-down cost `PasskeyCreationOptions`' comment describes.
}

/**
 * What the authenticator signed, base64url, on its way to be verified.
 *
 * Attacker-controlled in full, and safe for the same reason `PasskeyRegistration` is: the
 * signature is checked against a challenge the server itself put in a signed cookie, and
 * the account is read off the *stored* credential rather than off anything in here. There
 * is no field on this type through which a caller could name whose session to mint --
 * which is why `verifyPasskeyAssertion` takes no user id.
 *
 * `userHandle` is the one field a caller might be tempted to trust. Do not: Better Auth
 * looks the credential up by `id` and ignores it.
 */
export type PasskeyAssertion = {
  readonly id: string
  readonly rawId: string
  readonly type: 'public-key'
  // No `authenticatorAttachment`. `PasskeyRegistration` carries one because enrollment
  // records how the credential was made; a sign-in has no use for it, we never send it,
  // and modelling it as a plain `string` fails against the provider's narrow union at the
  // one place it would be handed over. A field nobody reads is not worth a cast.
  readonly clientExtensionResults: Record<string, unknown>
  readonly response: {
    readonly clientDataJSON: string
    readonly authenticatorData: string
    readonly signature: string
    readonly userHandle?: string
  }
}
