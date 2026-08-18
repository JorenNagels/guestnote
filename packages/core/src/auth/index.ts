import { createDevProvider } from './dev-provider.ts'
import type { AuthResult, CodeRequested, Invitation, Session, Verified } from './types.ts'

export { AUTH_POLICY } from './policy.ts'
export type {
  AuthFailure,
  AuthResult,
  CodeRequested,
  Invitation,
  Principal,
  Session,
  Verified,
} from './types.ts'

/**
 * The auth seam. **The only auth surface the rest of the codebase may import.**
 *
 * `biome.json` enforces the other half of that sentence: `better-auth` is a restricted
 * import everywhere except `packages/core/src/auth/better-auth.ts`, which does not exist
 * yet. That file is W3's landing spot, and when it arrives the only change here is which
 * factory `provider()` calls.
 *
 * research/07-auth-and-tenancy.md section 1 states the payoff plainly: with the seam in
 * place, moving off Better Auth "is then a one-weekend reversal in either direction".
 * That only stays true while this file is the whole interface.
 *
 * ## Server only
 *
 * Nothing here is safe in a browser bundle. It is not marked `server-only` because
 * `packages/core` deliberately has no dependencies -- `proxy.ts` imports
 * `@guestnote/core/hosts` and must stay free of anything that drags a runtime in. The
 * boundary is instead the app's Server Actions: no Client Component imports this, and
 * `process.env` access here would break loudly if one did.
 */

type Provider = ReturnType<typeof createDevProvider>

let cached: Provider | undefined

function provider(): Provider {
  // W3: `return cached ??= createBetterAuthProvider()`, and this comment goes with it.
  cached ??= createDevProvider()
  return cached
}

/**
 * Send a six-digit sign-in code.
 *
 * Returns the same shape whether or not the address belongs to an account. That is not
 * an oversight to be corrected later -- it is the enumeration-resistance rule, and it is
 * the same posture as research/07 section 3's "neither -> 404 (not 403 -- don't confirm
 * the wedding exists)".
 */
export function requestEmailCode(input: { email: string }): Promise<AuthResult<CodeRequested>> {
  return provider().requestEmailCode(input)
}

/** Exchange a code for a verified user. */
export function verifyEmailCode(input: {
  email: string
  code: string
}): Promise<AuthResult<Verified>> {
  return provider().verifyEmailCode(input)
}

/** Resolve an invitation token for its landing screen. Never throws on a bad token. */
export function resolveInvitation(token: string): Promise<Invitation> {
  return provider().resolveInvitation(token)
}

/** The current session, or null. */
export function getSession(): Promise<Session | null> {
  return provider().getSession()
}

/**
 * Whether a passkey can be created or used at all on this deployment.
 *
 * Separate from the browser-side capability check on purpose: the interface has two
 * independent reasons to hide the passkey control, and conflating them produced the bug
 * the brief warns about -- offering a credential the server cannot verify.
 *
 * False until W3. The surface treats that exactly as it treats a browser with no
 * platform authenticator: it falls to the email path and says nothing, because the
 * brief's states 2, 3 and 6 all render identically.
 */
export function passkeysAvailable(): boolean {
  return false
}
