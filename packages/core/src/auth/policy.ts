/**
 * The numbers the sign-in flow runs on.
 *
 * Every value here is **open** in the surface brief
 * (`.impeccable/surfaces/src-app-pro-public-login.md`, section 7) and none of them has
 * been ratified. They live in one exported object rather than scattered through the
 * implementation for exactly that reason: ratifying them must be a one-file diff with a
 * reviewer looking at all of them together, not a hunt through call sites.
 *
 * Where a value matches a Better Auth default it says so, because "we accepted the
 * library default" and "we chose this number" are different decisions and only one of
 * them survives a security review unexamined.
 */
export const AUTH_POLICY = {
  /**
   * How long a six-digit code stays valid.
   *
   * 300s is Better Auth's `emailOTP` default. The brief argues it is short for the
   * scene this product is designed against -- a planner on venue wifi where mail is
   * slow -- and proposes 600s. NOT RATIFIED: shipping the library default is the
   * conservative reading until someone decides.
   */
  codeTtlSeconds: 300,

  /** Six digits, always. The one number in this file nobody has questioned. */
  codeLength: 6,

  /**
   * Wrong attempts before the code is destroyed.
   *
   * 3 is Better Auth's `emailOTP` default. Note the interaction with `codeTtlSeconds`:
   * at 3 attempts and 300s, a planner who fat-fingers twice on a phone has one try left
   * and under five minutes to use it. That pairing is the argument for raising one or
   * both, and it is the concrete case a reviewer should hold in mind.
   */
  maxCodeAttempts: 3,

  /**
   * Seconds before "send a new code" becomes pressable again.
   *
   * UI-level and not a security control -- it exists so a tap that is already in flight
   * cannot be double-fired, and so the button never lies about what it will do. Not in
   * the brief's open list because nothing depends on the exact value.
   */
  resendCooldownSeconds: 30,

  /**
   * Requests per email and per IP, per hour.
   *
   * Placeholders. The brief lists thresholds AND whether the two counters share a store
   * as open. The dev provider enforces the per-email number only, which is enough to
   * exercise the rate-limited state in the UI and is explicitly not a production
   * control.
   */
  maxRequestsPerEmailPerHour: 5,
  maxRequestsPerIpPerHour: 20,
} as const

/**
 * The remaining lifetime of a code, in whole seconds, floored at zero.
 *
 * Takes `now` rather than reading the clock so the tests are not time-dependent.
 */
export function secondsRemaining(issuedAt: number, now: number): number {
  const elapsed = Math.floor((now - issuedAt) / 1000)
  return Math.max(0, AUTH_POLICY.codeTtlSeconds - elapsed)
}
