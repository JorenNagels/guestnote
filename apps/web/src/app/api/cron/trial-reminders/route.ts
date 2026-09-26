import { createHash, timingSafeEqual } from 'node:crypto'
import { orgsWithTrialEnding } from '@guestnote/db/cron'
import { TEMPLATE_TRIAL_REMINDER } from '@guestnote/email'
import { env } from '../../../../env.ts'
import { billingMode } from '../../../../lib/billing-mode.ts'
import { getDb } from '../../../../lib/db.ts'
import { sentSince } from '../../../../lib/mailer.ts'
import { reportSilentFailure } from '../../../../lib/observability.ts'
import { sendTrialReminderMail } from '../../../../lib/trial-reminder-mail.ts'
import { addDays, brusselsToday } from '../../../../lib/trial-state.ts'

/**
 * The daily trial reminder (spec 0005, "Trial"): three days before a studio's trial ends, one
 * mail to its owner. Called once a day by `sst.config.ts`'s `TrialReminders` cron (07:00 UTC),
 * with `Authorization: Bearer <CRON_SECRET>`.
 *
 * ## Who may call it
 *
 * Only a caller holding `CRON_SECRET`. **Unset, the route refuses everything** -- the safe value
 * by omission (invariant 6), and the state of every stage until the SSM parameter exists. Compared
 * as SHA-256 digests with `timingSafeEqual`, so neither the length nor a prefix of the secret
 * leaks through timing. On the app host `proxy.ts` rewrites nothing under `/api` and marks it
 * `no-store`; the apex 404s it.
 *
 * ## What it does
 *
 * Nothing at all while billing is off -- answered before any query, so a demo stage never reads
 * `orgs_with_trial_ending` (which itself returns nothing without a billing date). With billing
 * on: every planner org whose trial's last day is three days from today in Brussels, through
 * `@guestnote/db/cron`, the one cross-tenant read in the schema (this is the only file allowed
 * to import it -- `biome.json` and `no-unsafe-imports.test.ts`).
 *
 * ## Once per trial
 *
 * Deduplicated on `mail_deliveries`: an owner already sent this template in the last
 * `DEDUPE_DAYS` is skipped. A retried or doubled invocation on the same day therefore sends
 * nothing twice; a failed send is not a `sent` row and is tried again tomorrow -- when the
 * org is no longer three days out, so a failure costs that owner the reminder. Accepted: the
 * banner turns amber the next day regardless, and a retry loop inside a cron is more machinery
 * than a courtesy mail is worth. Two invocations running at once (EventBridge delivers at least
 * once) can both pass the check and both send, and a `trial_ends_at` moved by hand within the
 * window gets no second reminder; both accepted for the same reason.
 *
 * The answer carries counts, never names or addresses: it lands in a Lambda log.
 */

const DAYS_BEFORE = 3
const DEDUPE_DAYS = 7

function authorised(header: string | null): boolean {
  const secret = env.cronSecret
  if (!secret || !header?.startsWith('Bearer ')) return false
  const digest = (v: string) => createHash('sha256').update(v).digest()
  return timingSafeEqual(digest(header.slice('Bearer '.length)), digest(secret))
}

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

export async function POST(request: Request): Promise<Response> {
  if (!authorised(request.headers.get('authorization'))) {
    return json({ ok: false }, 401)
  }
  const mode = billingMode()
  if (!mode.on) return json({ ok: true, billing: 'off', due: 0, sent: 0 })

  const on = addDays(brusselsToday(), DAYS_BEFORE)
  const due = await orgsWithTrialEnding(getDb(), on, mode.from)
  const since = new Date(Date.now() - DEDUPE_DAYS * 86_400_000)

  let sent = 0
  let skipped = 0
  let failed = 0
  // Sequential: SES in sandbox accepts one message a second, and a day's worth of trials ending
  // is a handful, not a batch.
  for (const org of due) {
    try {
      if (await sentSince(org.ownerEmail, TEMPLATE_TRIAL_REMINDER, since)) {
        skipped++
        continue
      }
      const result = await sendTrialReminderMail({
        to: org.ownerEmail,
        studio: org.orgName,
        endsOn: org.trialEndsOn,
      })
      if (result.ok) sent++
      else failed++
    } catch (error) {
      failed++
      reportSilentFailure('trial reminder not sent', { orgId: org.orgId, error: String(error) })
    }
  }
  return json({ ok: true, billing: 'on', on, due: due.length, sent, skipped, failed })
}
