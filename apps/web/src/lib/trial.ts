/**
 * The trial's dates (spec 0005, Trial). Only the piece sign-up needs so far: the last day of the
 * trial a studio created today would get. Slice 5 adds the rest -- the state, the lock -- here.
 *
 * The rule, which migration 0010's `orgs_with_trial_ending` computes too and this must match:
 * `max(created_on, billing_from) + 1 month`, in Europe/Brussels, with Postgres's month
 * arithmetic -- 31 January + 1 month is the last day of February, not 3 March.
 */

/** Today's date in Europe/Brussels, `YYYY-MM-DD`. `en-CA` formats as ISO. */
export function brusselsToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Brussels',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

/** One calendar month on, clamped to the end of a shorter month, as `date + interval '1 month'`. */
export function addOneMonth(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number]
  const lastOfNext = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
  return new Date(Date.UTC(y, m, Math.min(d, lastOfNext))).toISOString().slice(0, 10)
}

/** The trial's last day for a studio created on `createdOn`, with billing on from `billingFrom`. */
export function trialLastDay(createdOn: string, billingFrom: string): string {
  // ISO dates compare correctly as strings.
  return addOneMonth(createdOn > billingFrom ? createdOn : billingFrom)
}
