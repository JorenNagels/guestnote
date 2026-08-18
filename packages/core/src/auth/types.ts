/**
 * The shapes the sign-in surface is allowed to know about.
 *
 * Deliberately narrow. Nothing here mentions a session cookie, a verification row, a
 * WebAuthn challenge or a provider name, because the whole point of the seam
 * (research/07-auth-and-tenancy.md section 1, "The seam stays regardless") is that
 * swapping Better Auth for something else stays a bounded job. If a provider concept
 * leaks into this file, that promise is already broken.
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
