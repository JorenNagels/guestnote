import { type AuthConfig, createBetterAuthProvider } from './better-auth.ts'
import { acceptInvitationWith, type InvitationStore, resolveInvitationWith } from './invitations.ts'
import type { AcceptResult, Invitation } from './types.ts'

export type { AuthConfig } from './better-auth.ts'
export type { AcceptRecord, InvitationRecord, InvitationStore } from './invitations.ts'
export { hashInviteToken } from './invitations.ts'
export { AUTH_POLICY } from './policy.ts'
export type {
  AcceptResult,
  AuthFailure,
  AuthResult,
  CodeRequested,
  Invitation,
  PasskeyAssertion,
  PasskeyCreationOptions,
  PasskeyRegistration,
  PasskeyRequestOptions,
  Principal,
  Session,
  Verified,
} from './types.ts'

/**
 * The auth seam. **The only auth surface the rest of the codebase may import.**
 *
 * Everything below returns plain data. No Better Auth type crosses this boundary, which
 * is what makes research/07-auth-and-tenancy.md section 1's promise -- that moving off
 * the library is "a one-weekend reversal in either direction" -- something more than an
 * intention. `biome.json` and `packages/db/src/no-unsafe-imports.test.ts` both hold the
 * other half of it by restricting the import to `./better-auth.ts`.
 *
 * ## Configuration is passed in
 *
 * `hosts.ts` states the rule for this package: config is arguments, never module-level
 * `process.env`. `apps/web/src/lib/auth.ts` composes this once and memoises it.
 */

export type Auth = ReturnType<typeof createBetterAuthProvider> & {
  resolveInvitation: (token: string) => Promise<Invitation>
  acceptInvitation: (token: string, userId: string) => Promise<AcceptResult>
  passkeysAvailable: () => boolean
  googleAvailable: () => boolean
}

/**
 * `AuthConfig` plus the invitation store. Kept out of `AuthConfig` itself because that type
 * lives in `better-auth.ts`, the one file that may know the provider, and the store is not a
 * provider concern. **Required, not optional**: an optional store would make "forgot to pass
 * it" resolve every link to `unknown`, which reads as a broken invitation rather than a
 * missing argument.
 */
export type SeamConfig = AuthConfig & { invitations: InvitationStore }

export function createAuth(config: SeamConfig): Auth {
  const { invitations, ...providerConfig } = config
  const provider = createBetterAuthProvider(providerConfig)

  return {
    ...provider,

    /**
     * A real lookup since migration 0007, by `resolve_invitation` through the store.
     * Until then this was a fixture map (`staff`, `wedding`, `expired`, `accepted`), which
     * is gone: a token like `staff` now resolves to `unknown` like any other guess.
     *
     * `invitations` is hand-rolled rather than Better Auth's -- research/07 section 4b
     * merges the staff and wedding shapes into one table -- so this is our query to write,
     * not the library's, and nothing provider-shaped is involved.
     */
    async resolveInvitation(token: string): Promise<Invitation> {
      return resolveInvitationWith(invitations, token)
    },

    /**
     * Spends the invitation for the SIGNED-IN user. `userId` must come from the session and
     * never from the request: the database checks the invitation's email against that
     * user's and refuses a mismatch, and checks the id against the transaction's own
     * `app.user_id`, but neither helps if the caller was handed somebody else's id.
     */
    async acceptInvitation(token: string, userId: string): Promise<AcceptResult> {
      return acceptInvitationWith(invitations, token, userId)
    },

    /**
     * True: the plugin is configured and **both** halves of the ceremony are wired --
     * enrollment since 2026-08-19, sign-in since docs/specs/0002.
     *
     * This used to say "true now that the passkey plugin is configured", which was
     * accurate and misleading in the same breath: for eleven days it meant a passkey could
     * be created and never used, because nothing called
     * `navigator.credentials.get()`. Callers reading this as "passkeys work" were wrong
     * through no fault of their own.
     *
     * The browser still gets the final say: `conditionalMediationAvailable()` and
     * `platformAuthenticatorAvailable()` in the app decide whether a credential can
     * actually be offered, and all three negative outcomes render identically.
     */
    passkeysAvailable(): boolean {
      return true
    },

    /**
     * Whether to draw the "Continue with Google" button.
     *
     * True only when the Google OAuth client was supplied -- `apps/web/src/lib/auth.ts`
     * passes `config.google` only when both env vars are set. So a deployment that has not
     * configured Google gets a login form with no Google button, never a button whose click
     * 500s. The login page threads this through as `googleEnabled`.
     */
    googleAvailable(): boolean {
      return config.google !== undefined
    },
  }
}
