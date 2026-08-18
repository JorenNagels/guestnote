import { AUTH_POLICY, secondsRemaining } from './policy.ts'
import type { AuthResult, CodeRequested, Invitation, Session, Verified } from './types.ts'

/**
 * An in-memory stand-in for the auth provider, so the sign-in surface runs end to end
 * before Better Auth lands.
 *
 * ## Why this exists rather than the real thing
 *
 * `packages/db/src/schema/auth.ts` is explicit that `sessions`, `accounts` and
 * `verifications` are deliberately NOT declared yet, and that they arrive in W3 "read
 * off the output of Better Auth's own schema generator rather than guessed". Building
 * the real provider now would mean hand-writing those table shapes from memory, which
 * is the exact failure that file was written to prevent.
 *
 * So the surface gets built against the seam, and W3 swaps the implementation. Every
 * state the interface has to render is reachable here, which is what makes that
 * swap a provider change rather than a redesign.
 *
 * ## What this is NOT
 *
 * Not a security control, not persistent, not multi-instance, and not shipped: the
 * factory throws outside development. Codes are printed to the server console because
 * there is no mail pipeline yet.
 */

type Pending = {
  code: string
  issuedAt: number
  attemptsLeft: number
  requestsThisHour: number
  windowStartedAt: number
}

const pending = new Map<string, Pending>()

/** Fixtures, so the invitation states in the brief are all reachable by URL. */
const INVITATIONS: ReadonlyMap<string, Invitation> = new Map([
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

export function createDevProvider(now: () => number = Date.now) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'packages/core/auth: the dev provider was reached in production. W3 replaces it ' +
        'with better-auth.ts; until then this surface has no real authentication.',
    )
  }

  return {
    async requestEmailCode({ email }: { email: string }): Promise<AuthResult<CodeRequested>> {
      const key = email.trim().toLowerCase()
      const t = now()
      const prior = pending.get(key)

      // A crude per-address window. Enough to make the rate-limited state reachable in
      // the interface; explicitly not the production control, which needs a shared
      // store and an IP counter beside it (AUTH_POLICY, both marked open).
      const windowStartedAt =
        prior && t - prior.windowStartedAt < 3_600_000 ? prior.windowStartedAt : t
      const requestsThisHour =
        (windowStartedAt === prior?.windowStartedAt ? prior.requestsThisHour : 0) + 1

      if (requestsThisHour > AUTH_POLICY.maxRequestsPerEmailPerHour) {
        return { ok: false, failure: 'rate_limited' }
      }

      // One reserved address, so the hard-bounce state is reachable without a mail
      // pipeline. `email_log` owns this signal for real.
      if (key === 'bounce@studiowit.be') return { ok: false, failure: 'delivery_failed' }

      const code = String(Math.floor(Math.random() * 10 ** AUTH_POLICY.codeLength)).padStart(
        AUTH_POLICY.codeLength,
        '0',
      )
      pending.set(key, {
        code,
        issuedAt: t,
        attemptsLeft: AUTH_POLICY.maxCodeAttempts,
        requestsThisHour,
        windowStartedAt,
      })

      // The stand-in for SES. Deliberately loud: a code you cannot find is a dead end,
      // and this is the only channel that exists today.
      console.info(`\n  [guestnote dev] sign-in code for ${key}: ${code}\n`)

      return {
        ok: true,
        value: {
          resendAfterSeconds: AUTH_POLICY.resendCooldownSeconds,
          expiresInSeconds: AUTH_POLICY.codeTtlSeconds,
        },
      }
    },

    async verifyEmailCode({
      email,
      code,
    }: {
      email: string
      code: string
    }): Promise<AuthResult<Verified>> {
      const key = email.trim().toLowerCase()
      const entry = pending.get(key)
      // No entry is indistinguishable from an aged-out one on purpose: both mean "ask
      // for a new code", and separating them would confirm whether a request was made.
      if (!entry) return { ok: false, failure: 'code_expired' }

      if (secondsRemaining(entry.issuedAt, now()) === 0) {
        pending.delete(key)
        return { ok: false, failure: 'code_expired' }
      }

      if (code.replace(/\D/g, '') !== entry.code) {
        entry.attemptsLeft -= 1
        if (entry.attemptsLeft <= 0) {
          pending.delete(key)
          return { ok: false, failure: 'code_spent' }
        }
        return { ok: false, failure: 'code_wrong', attemptsLeft: entry.attemptsLeft }
      }

      pending.delete(key)
      return { ok: true, value: { userId: `dev-${key}`, needsName: false } }
    },

    async resolveInvitation(token: string): Promise<Invitation> {
      return INVITATIONS.get(token) ?? { kind: 'unknown' }
    },

    async getSession(): Promise<Session | null> {
      // There is no session store here, and pretending otherwise would let the shell be
      // built against a fiction. W3 makes this real.
      return null
    },
  }
}

/** Test seam: the module-level map would otherwise leak between cases. */
export function __resetDevProvider(): void {
  pending.clear()
}
