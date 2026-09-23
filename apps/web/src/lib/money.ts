/**
 * The maths of the budget and payment screens, kept apart from React so it is testable and so
 * the same functions run on the server (parsing a form) and in the browser (rendering).
 *
 * Money is integer cents, EUR only (spec 0003). Nothing here stores a total: every sum is
 * computed from the rows on each render, which spec 0003 "Still open" allows until it is
 * measured slow. A wedding has tens of lines, so it will not be.
 */

/** `integer` in Postgres. A larger value is a write error, so it is refused before that. */
export const MAX_CENTS = 2_147_483_647

const THOUSANDS = /^\d{1,3}([.,]\d{3})+$/
const PLAIN = /^\d+$/
const DECIMAL_TAIL = /^(.*?)[.,](\d{1,2})$/

/**
 * `1234,50`, `1.234,50`, `1,234.50` and `1234.50` all read as 1 234,50 euro. A separator with
 * one or two digits after it, at the very end, is the decimal mark; every other separator must
 * be a proper thousands mark or the input is refused.
 *
 * The rule is by shape and not by locale on purpose: a planner in an English UI typing a Belgian
 * price, or the reverse, would otherwise get a silently wrong amount. The one genuine ambiguity
 * is `1.234`, which is read as 1 234 euro (a thousands mark) and never as 1,234 euro -- a
 * three-digit tail is not a cents value. Rejected: a locale-driven parser, whose failure is a
 * price a thousand times off with nothing on screen to say so.
 *
 * Returns `null` for anything else, including negative numbers and more than `MAX_CENTS`.
 * Never goes through a float: the digits are split as text.
 */
export function parseCents(input: string): number | null {
  const s = input.replace(/[€\s]/g, '')
  if (!/^\d[\d.,]*$/.test(s)) return null

  const tail = DECIMAL_TAIL.exec(s)
  const whole = tail ? (tail[1] ?? '') : s
  const fraction = tail ? (tail[2] ?? '') : ''
  if (!PLAIN.test(whole) && !THOUSANDS.test(whole)) return null

  const digits = whole.replace(/[.,]/g, '')
  if (digits.length > 10) return null
  const cents = Number(digits) * 100 + Number(fraction.padEnd(2, '0'))
  return cents <= MAX_CENTS ? cents : null
}

/** The BCP 47 tag for a wedding's `locale_default`. Belgian where Belgium has one. */
export function moneyLocale(weddingLocale: string): string {
  if (weddingLocale === 'fr') return 'fr-BE'
  if (weddingLocale === 'en') return 'en-GB'
  return 'nl-BE'
}

/** Two fraction digits always, so a column of amounts lines up and 12,50 is never 12,5. */
export function formatCents(cents: number, weddingLocale: string): string {
  return new Intl.NumberFormat(moneyLocale(weddingLocale), {
    style: 'currency',
    currency: 'EUR',
  }).format(cents / 100)
}

const FALLBACK_ZONE = 'Europe/Brussels'

/**
 * Today's civil date in `timezone`, as `YYYY-MM-DD`.
 *
 * The wedding's own zone and not the runtime's: a Lambda runs in UTC and a laptop does not, so
 * "overdue" would otherwise disagree with itself between staging and a dev machine for the hour
 * or two after local midnight. An unknown zone name falls back to Brussels rather than throw --
 * `weddings.timezone` is free text and a page that 500s over it hides the whole budget.
 */
export function civilToday(timezone: string, now: Date = new Date()): string {
  const format = (zone: string) =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now)
  try {
    return format(timezone)
  } catch {
    return format(FALLBACK_ZONE)
  }
}

/** The civil date of an instant, in `timezone`. Same fallback as `civilToday`. */
export function civilDateOf(instant: Date, timezone: string): string {
  return civilToday(timezone, instant)
}

/** Whole days from `from` to `to`, both `YYYY-MM-DD`. Positive when `to` is later. */
export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`)
  const b = Date.parse(`${to}T00:00:00Z`)
  return Math.round((b - a) / 86_400_000)
}

export type PaymentState = 'paid' | 'overdue' | 'due'

/**
 * Paid beats everything. Otherwise overdue is strictly before today: a payment due today is
 * due, not late, and turns overdue at the next local midnight.
 */
export function paymentState(
  payment: { dueOn: string; paidAt: Date | null },
  today: string,
): PaymentState {
  if (payment.paidAt) return 'paid'
  return payment.dueOn < today ? 'overdue' : 'due'
}

export type LineForTotals = {
  category: string
  estimateCents: number
  actualCents: number | null
}

export type BudgetTotals = {
  allocatedCents: number
  spentCents: number
  remainingCents: number
}

/** A line with no actual yet has spent nothing: the actual is what was really committed. */
export function budgetTotals(lines: readonly LineForTotals[]): BudgetTotals {
  let allocatedCents = 0
  let spentCents = 0
  for (const l of lines) {
    allocatedCents += l.estimateCents
    spentCents += l.actualCents ?? 0
  }
  return { allocatedCents, spentCents, remainingCents: allocatedCents - spentCents }
}

export type CategoryGroup<L extends LineForTotals & { id: string }> = {
  category: string
  lines: L[]
  totals: BudgetTotals
  /** Paid so far against this category's lines. */
  paidCents: number
}

/** Categories in the order their first line was entered: the planner's order, not the alphabet's. */
export function groupByCategory<L extends LineForTotals & { id: string }>(
  lines: readonly L[],
  payments: readonly { budgetLineId: string; amountCents: number; paidAt: Date | null }[],
): CategoryGroup<L>[] {
  const paidByLine = new Map<string, number>()
  for (const p of payments) {
    if (p.paidAt)
      paidByLine.set(p.budgetLineId, (paidByLine.get(p.budgetLineId) ?? 0) + p.amountCents)
  }
  const groups = new Map<string, CategoryGroup<L>>()
  for (const l of lines) {
    let g = groups.get(l.category)
    if (!g) {
      g = {
        category: l.category,
        lines: [],
        totals: { allocatedCents: 0, spentCents: 0, remainingCents: 0 },
        paidCents: 0,
      }
      groups.set(l.category, g)
    }
    g.lines.push(l)
    g.paidCents += paidByLine.get(l.id) ?? 0
  }
  for (const g of groups.values()) g.totals = budgetTotals(g.lines)
  return [...groups.values()]
}

export type PaymentTotals = {
  paidCents: number
  outstandingCents: number
  overdueCents: number
  overdueCount: number
}

/** Outstanding includes the overdue: it is everything unpaid, and overdue is the late part of it. */
export function paymentTotals(
  payments: readonly { dueOn: string; amountCents: number; paidAt: Date | null }[],
  today: string,
): PaymentTotals {
  const t: PaymentTotals = { paidCents: 0, outstandingCents: 0, overdueCents: 0, overdueCount: 0 }
  for (const p of payments) {
    const state = paymentState(p, today)
    if (state === 'paid') t.paidCents += p.amountCents
    else t.outstandingCents += p.amountCents
    if (state === 'overdue') {
      t.overdueCents += p.amountCents
      t.overdueCount += 1
    }
  }
  return t
}

/**
 * `YYYY-MM-DD` that is a real calendar day, or `null`. The round trip is what rejects 2027-02-30:
 * `Date` would roll it to March and a regex alone would accept it.
 */
export function parseCivilDate(input: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) return null
  const ms = Date.parse(`${input}T00:00:00Z`)
  if (Number.isNaN(ms)) return null
  return new Date(ms).toISOString().slice(0, 10) === input ? input : null
}

/**
 * The instant stored for a "paid on" date the planner typed. Noon UTC, so the civil date reads the
 * same in every zone from UTC-11 to UTC+11 -- a Belgian wedding, and the seed data (09:00 UTC),
 * both sit well inside it. Rejected: midnight in the wedding's zone, which needs a zone-aware
 * constructor `Intl` does not offer, for a date the planner only ever reads back as a day.
 */
export function paidInstant(civil: string): Date {
  return new Date(`${civil}T12:00:00Z`)
}

/** Trimmed, and `null` when empty or longer than `max`. A label is never silently cut short. */
export function cleanText(input: string, max: number): string | null {
  const s = input.trim()
  return s.length > 0 && s.length <= max ? s : null
}

/**
 * The text a form field starts with when it edits an existing amount: `1234,50` in nl and fr,
 * `1234.50` in en, no thousands mark. `parseCents` reads it back to the same cents, which is the
 * property the test holds; a thousands mark would survive that too but is one more thing to retype.
 */
export function centsToInput(cents: number, weddingLocale: string): string {
  const whole = Math.floor(cents / 100)
  const fraction = String(cents % 100).padStart(2, '0')
  return `${whole}${weddingLocale === 'en' ? '.' : ','}${fraction}`
}
