import { type AuthConfig, createBetterAuthProvider } from './better-auth.ts'
import type { Invitation } from './types.ts'

export type { AuthConfig } from './better-auth.ts'
export { AUTH_POLICY } from './policy.ts'
export type {
  AuthFailure,
  AuthResult,
  CodeRequested,
  Invitation,
  PasskeyCreationOptions,
  PasskeyRegistration,
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
  passkeysAvailable: () => boolean
}

export function createAuth(config: AuthConfig): Auth {
  const provider = createBetterAuthProvider(config)

  return {
    ...provider,

    /**
     * **Still fixtures, and deliberately so.**
     *
     * `invitations` is hand-rolled rather than Better Auth's -- research/07 section 4b
     * merges the staff and wedding shapes into one table -- so this is our query to
     * write, not the library's. It needs an organisation to invite into, and there is no
     * seeded org yet, so a real lookup today would only ever return `unknown` and the
     * invitation screens would be untestable.
     *
     * Replaced by a query on `invitations` when M3's org work lands. The five outcomes
     * the interface renders are already correct; only their source is fake.
     */
    async resolveInvitation(token: string): Promise<Invitation> {
      return FIXTURES.get(token) ?? { kind: 'unknown' }
    },

    /**
     * True now that the passkey plugin is configured.
     *
     * The browser still gets the final say: `conditionalMediationAvailable()` and
     * `platformAuthenticatorAvailable()` in the app decide whether a credential can
     * actually be offered, and all three negative outcomes render identically.
     */
    passkeysAvailable(): boolean {
      return true
    },
  }
}

const FIXTURES: ReadonlyMap<string, Invitation> = new Map([
  [
    'staff',
    {
      kind: 'staff',
      email: 'tom@studiowit.be',
      inviter: 'Ilse Verhoeven',
      org: 'Studio Wit',
      role: 'admin',
    },
  ],
  ['wedding', { kind: 'wedding', inviter: 'Ilse Verhoeven', org: 'Studio Wit' }],
  ['expired', { kind: 'expired', inviter: 'Ilse Verhoeven' }],
  ['accepted', { kind: 'accepted' }],
])
