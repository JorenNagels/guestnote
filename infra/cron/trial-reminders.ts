/**
 * The `TrialReminders` cron's job (`sst.config.ts`): one authenticated POST to the app's
 * `/api/cron/trial-reminders`, once a day. All the logic -- billing on or off, who is three
 * days from the end, whether they were already reminded -- lives in that route, where the
 * database, the mailer and the tests are. This Lambda only knocks.
 *
 * Its two values arrive as Lambda environment variables from `sst.config.ts`; it is not app
 * code, so `apps/web/src/env.ts`'s one-reader rule (CLAUDE.md invariant 6) is not about it.
 * Throws on anything but a 2xx, so a failure is a Lambda error in CloudWatch metrics rather
 * than a quiet 401 nobody reads.
 */
export async function handler(): Promise<{ status: number; body: string }> {
  const url = process.env.TRIAL_REMINDERS_URL
  const secret = process.env.CRON_SECRET
  if (!url || !secret) {
    throw new Error('TRIAL_REMINDERS_URL and CRON_SECRET must both be set (sst.config.ts).')
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: { authorization: `Bearer ${secret}` },
    signal: AbortSignal.timeout(50_000),
  })
  const body = await res.text()
  if (!res.ok) throw new Error(`trial-reminders answered ${res.status}: ${body.slice(0, 200)}`)
  // Counts only (the route never returns names or addresses), so it is safe in a log line.
  console.log(`trial-reminders ${res.status} ${body}`)
  return { status: res.status, body }
}
