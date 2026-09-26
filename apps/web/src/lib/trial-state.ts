/**
 * The trial clock (spec 0005, "Trial"), as pure functions: no env, no database, no `server-only`,
 * so the banner, the Billing page and their tests share one reading of it. `lib/trial.ts` joins
 * it to the request.
 *
 * ## The one calendar month
 *
 * The trial's LAST DAY is a Europe/Brussels civil date, and the trial runs to the end of it:
 *
 *   trial_ends_at set    -> its Brussels date (the by-hand override)
 *   otherwise            -> max(created_at's Brussels date, GUESTNOTE_BILLING_FROM) + 1 month
 *
 * "+ 1 month" is Postgres's: the same day next month, clamped to that month's last day, so
 * 31 January ends on 28 or 29 February. Migration 0010's `orgs_with_trial_ending` computes the
 * same thing for the reminder cron, and the two must agree -- otherwise a studio is reminded of
 * a day its banner does not show. `trial-state.test.ts` pins the month edges to that.
 *
 * "Ended" is computed here on every read and never stored (spec 0005, Data), so it cannot go
 * stale when the override or the billing start moves.
 */

export type TrialFactsInput = {
  /** Only a `planner` org has a trial; any other is `off`, as `orgs_with_trial_ending` agrees. */
  readonly type: string
  readonly createdAt: Date
  readonly trialEndsAt: Date | null
  readonly billingStatus: 'trialing' | 'active' | 'past_due' | 'canceled' | null
}

export type TrialState =
  /** Billing is off: the demo. No banner of this kind, nothing locked. */
  | { readonly kind: 'off' }
  /** The studio pays. No banner, nothing locked. */
  | { readonly kind: 'paid' }
  /** Neutral banner. `daysLeft` counts whole days after today up to the last day. */
  | { readonly kind: 'running'; readonly endsOn: string; readonly daysLeft: number }
  /** Amber banner: the last three days, `daysLeft` 2, 1 or 0 (0 is the last day itself). */
  | { readonly kind: 'lastDays'; readonly endsOn: string; readonly daysLeft: number }
  /** Red banner, and every staff write refused. */
  | { readonly kind: 'ended'; readonly endsOn: string }

export const TRIAL_ZONE = 'Europe/Brussels'

/**
 * The amber window: the last day and the two before it -- three calendar days, the design's
 * "last 3 days". The reminder mail goes out the day before this starts (last day minus three),
 * on a neutral day, so the planner has three full days of amber after reading it.
 */
export const LAST_DAYS = 3

/** The civil date of `now` in Brussels, `YYYY-MM-DD`. `en-CA` formats as ISO. */
export function brusselsToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TRIAL_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

/** `iso` + 1 month, clamped to the last day of that month, as Postgres's `date + interval`. */
export function addOneMonth(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number]
  const year = m === 12 ? y + 1 : y
  const month = m === 12 ? 1 : m + 1
  // Day 0 of the month after `month` is the last day of `month`.
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return `${year}-${String(month).padStart(2, '0')}-${String(Math.min(d, lastDay)).padStart(2, '0')}`
}

/** `iso` + `days`, as a civil date. */
export function addDays(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)
}

function daysFromTo(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)
}

/** The trial's last day for a studio created on `createdOn`, with billing on from `billingFrom`. */
export function trialLastDay(createdOn: string, billingFrom: string): string {
  // ISO dates compare correctly as strings.
  return addOneMonth(createdOn > billingFrom ? createdOn : billingFrom)
}

/** The trial's last day. `billingFrom` is `GUESTNOTE_BILLING_FROM`, `YYYY-MM-DD`. */
export function trialEndsOn(facts: TrialFactsInput, billingFrom: string): string {
  if (facts.trialEndsAt) return brusselsToday(facts.trialEndsAt)
  return trialLastDay(brusselsToday(facts.createdAt), billingFrom)
}

/**
 * Where a studio stands. `active` and `past_due` count as paid -- chasing a failed card is the
 * provider's dunning, not a lock this app invents before a provider exists. `canceled` is
 * treated as an ended trial: the studio stopped paying, so it reads and does not write, the
 * same promise the red banner makes.
 */
export function trialState(
  facts: TrialFactsInput,
  mode: { readonly on: false } | { readonly on: true; readonly from: string },
  now: Date,
): TrialState {
  // A seeded venue or couple_direct org is never on the clock: the reminder function only finds
  // planners, and a lock nobody was warned about would be the worse half of that disagreement.
  if (!mode.on || facts.type !== 'planner') return { kind: 'off' }
  if (facts.billingStatus === 'active' || facts.billingStatus === 'past_due') {
    return { kind: 'paid' }
  }
  const endsOn = trialEndsOn(facts, mode.from)
  if (facts.billingStatus === 'canceled') return { kind: 'ended', endsOn }
  const daysLeft = daysFromTo(brusselsToday(now), endsOn)
  if (daysLeft < 0) return { kind: 'ended', endsOn }
  if (daysLeft < LAST_DAYS) return { kind: 'lastDays', endsOn, daysLeft }
  return { kind: 'running', endsOn, daysLeft }
}
