import { describe, expect, it } from 'vitest'
import { AUTH_POLICY, secondsRemaining } from './policy.ts'

/**
 * `policy.ts` is explicit that none of its numbers is ratified and that changing them
 * "must be a one-file diff with a reviewer looking at all of them together". So this file
 * deliberately does NOT assert the literals -- that would make every ratification a
 * two-file diff and turn a reviewer's decision into a test failure to be silenced.
 *
 * What it asserts instead are the RELATIONSHIPS that must hold whatever the numbers become.
 * Each one below is a value that makes the flow incoherent rather than merely differently
 * tuned, which is the line worth defending automatically.
 */
describe('AUTH_POLICY invariants', () => {
  it('lets a code be resent before it expires', () => {
    // At cooldown >= TTL the resend button unlocks only after the code it would replace is
    // already dead, so the "send a new code" path can never be used while the screen still
    // makes sense.
    expect(AUTH_POLICY.resendCooldownSeconds).toBeLessThan(AUTH_POLICY.codeTtlSeconds)
  })

  it('refreshes a session strictly more often than it expires one', () => {
    // At refresh >= TTL the rolling window never rolls: every session dies at its original
    // expiry and the "planner in a venue car park is never asked again" property is gone.
    expect(AUTH_POLICY.sessionRefreshSeconds).toBeLessThan(AUTH_POLICY.sessionTtlSeconds)
  })

  it('allows at least one attempt at a code', () => {
    expect(AUTH_POLICY.maxCodeAttempts).toBeGreaterThanOrEqual(1)
  })

  it('keeps the code long enough to be worth guessing at', () => {
    // Six digits at 3 attempts is 3-in-a-million. Any shorter and the attempt limit, not
    // the code, becomes the only thing standing there.
    expect(AUTH_POLICY.codeLength).toBeGreaterThanOrEqual(6)
  })

  it('gives a rate limit that permits at least one send', () => {
    expect(AUTH_POLICY.maxRequestsPerEmailPerHour).toBeGreaterThanOrEqual(1)
    expect(AUTH_POLICY.maxRequestsPerIpPerHour).toBeGreaterThanOrEqual(
      AUTH_POLICY.maxRequestsPerEmailPerHour,
    )
  })
})

describe('secondsRemaining', () => {
  const ISSUED = 1_760_000_000_000

  it('is the full TTL at the moment of issue', () => {
    expect(secondsRemaining(ISSUED, ISSUED)).toBe(AUTH_POLICY.codeTtlSeconds)
  })

  it('counts down in whole seconds', () => {
    expect(secondsRemaining(ISSUED, ISSUED + 1_000)).toBe(AUTH_POLICY.codeTtlSeconds - 1)
    expect(secondsRemaining(ISSUED, ISSUED + 60_000)).toBe(AUTH_POLICY.codeTtlSeconds - 60)
  })

  it('floors a partial second rather than rounding it up', () => {
    // 1.9s elapsed is 1 second gone, not 2. Rounding up would let the UI show a value the
    // server has not reached yet, and a code that reads as expired one tick early.
    expect(secondsRemaining(ISSUED, ISSUED + 1_900)).toBe(AUTH_POLICY.codeTtlSeconds - 1)
  })

  it('reaches exactly zero at the TTL boundary', () => {
    const atExpiry = ISSUED + AUTH_POLICY.codeTtlSeconds * 1000
    expect(secondsRemaining(ISSUED, atExpiry)).toBe(0)
  })

  it('never goes negative, however long ago the code was issued', () => {
    // The countdown is rendered. A negative here is a login screen saying "-40 seconds",
    // which is the exact failure stage-content.ts calls out for the wedding date.
    expect(secondsRemaining(ISSUED, ISSUED + 10_000_000)).toBe(0)
    expect(secondsRemaining(ISSUED, Number.MAX_SAFE_INTEGER)).toBe(0)
  })

  it('does not read the clock itself', () => {
    // The signature takes `now` on purpose. Two calls with the same arguments must agree
    // forever, which is what makes every assertion above stable rather than flaky at 00:00.
    expect(secondsRemaining(ISSUED, ISSUED + 5_000)).toBe(secondsRemaining(ISSUED, ISSUED + 5_000))
  })

  it('is NOT clamped at the top end when the clock runs backwards', () => {
    // Documenting real behaviour rather than wishing for better. `Math.max(0, ...)` guards
    // the floor only, so a `now` behind `issuedAt` -- an NTP correction, or a Lambda whose
    // wall clock jumps -- makes `elapsed` negative and returns MORE than the TTL.
    //
    // Harmless where it is used today: the value drives a countdown that is re-derived on
    // the next tick, so a too-large number is a cosmetic overshoot and never grants extra
    // validity, which is the server's decision and not this function's. Worth pinning so
    // that if it ever feeds an authorization check, this test is already here to fail.
    expect(secondsRemaining(ISSUED, ISSUED - 60_000)).toBe(AUTH_POLICY.codeTtlSeconds + 60)
  })
})
