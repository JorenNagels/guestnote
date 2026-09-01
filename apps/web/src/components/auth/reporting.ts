import { reportCeremonyFailure } from './actions.ts'

/**
 * A `.catch` that reports before it swallows.
 *
 * **Every unreported `.catch` on this surface has cost a day of debugging**, and this is the
 * fourth one found: `verifyPasskeyRegistration` was blind, then `finishPasskeyEnrollment`'s
 * transport was blind, then `beginPasskeyEnrollment`'s was. Each time the fix was correct and
 * each time the next one along was still silent, because the pattern was written out by hand
 * at every call site and one of them always got missed.
 *
 * So the pattern is a function now. A Server Function that rejects means the POST never
 * reached the server or never came back -- the seam is never entered, so the seam's own
 * report cannot fire, and the browser ceremony never runs so its reporter cannot either. That
 * combination is exactly what leaves a `verifications` row with no passkey row and no log
 * line, which is the shape staging produced on 2026-08-19, 08-30, 08-31 twice, and again
 * after each partial fix.
 *
 * The report is fire-and-forget and its own failure is swallowed: it travels over the same
 * transport that just failed, so it may well not arrive either. CloudWatch gets the line
 * whenever the POST does land, which is what makes an intermittent transport fault visible.
 *
 * ## Why it is its own module now
 *
 * It lived in `auth-flow.tsx` until 2026-09-01, when enrollment moved to
 * `enrollment-prompt.tsx` on the shell and took two of the four call sites with it. A helper
 * whose entire reason for existing is "the pattern got missed at a call site" must not be
 * reachable from only one of the two files that have call sites -- the second file would
 * have grown its own copy, which is precisely the failure this replaced.
 */
export function reportingCatch<T>(stage: 'enroll' | 'signin', step: string, fallback: T) {
  return (error: unknown): T => {
    void reportCeremonyFailure(
      stage,
      'ActionTransport',
      `${step}: ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`,
    ).catch(() => {})
    return fallback
  }
}
