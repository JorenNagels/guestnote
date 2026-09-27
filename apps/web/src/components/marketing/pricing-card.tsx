'use client'

import { type BillingCycle, quote } from '@guestnote/billing'
import { useState } from 'react'

export type PricingCardLabels = Readonly<{
  name: string
  cycle: string
  monthly: string
  yearly: string
  yearlyNote: string
  perMonth: string
  perYear: string
  seats: string
  seatsHelp: string
  fewer: string
  more: string
  base: string
  total: string
  exclVat: string
}>

type Props = {
  readonly locale: string
  readonly labels: PricingCardLabels
  /** `pricing.card.extra` with its plural, resolved on the server for each count we can show. */
  readonly extraLabels: Readonly<Record<number, string>>
  readonly maxSeats: number
}

/**
 * The public price, computed by the same `quote()` the Billing screen uses (spec 0006, "Pricing is
 * public"), so the two can never disagree and no price is ever typed into copy.
 *
 * A client island for the seat stepper and the cycle toggle only. The server renders its first
 * state (one planner, monthly), which is the price shown without JavaScript and to crawlers.
 *
 * Shown excl. VAT and without the VAT line `quote()` computes: the operator's VAT position is
 * undecided (spec 0006, "Operator"), and `pricing.ts`'s rule for a VAT number is wrong for a
 * Belgian one, so a VAT figure here would be a claim nobody has checked.
 */
export function PricingCard({ locale, labels, extraLabels, maxSeats }: Props) {
  const [seats, setSeats] = useState(1)
  const [cycle, setCycle] = useState<BillingCycle>('monthly')
  const q = quote(seats, cycle)
  const eur = (cents: number) =>
    new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
    }).format(cents / 100)
  const per = cycle === 'monthly' ? labels.perMonth : labels.perYear

  return (
    <div className="bg-card border-border rounded-[calc(var(--radius)+6px)] border p-6 shadow-sm sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="mk-display mk-h3">{labels.name}</h2>
        <fieldset className="bg-muted flex rounded-full p-1 text-sm">
          <legend className="sr-only">{labels.cycle}</legend>
          {(['monthly', 'yearly'] as const).map((c) => (
            <label
              key={c}
              className="has-[:checked]:bg-card has-[:focus-visible]:outline-ring cursor-pointer rounded-full px-3 py-1.5 has-[:checked]:font-semibold has-[:checked]:shadow-sm has-[:focus-visible]:outline-2"
            >
              <input
                type="radio"
                name="cycle"
                value={c}
                checked={cycle === c}
                onChange={() => setCycle(c)}
                className="sr-only"
              />
              {labels[c]}
              {c === 'yearly' ? (
                <span className="text-accent-foreground bg-accent ml-2 rounded-full px-1.5 py-0.5 text-[11px]">
                  {labels.yearlyNote}
                </span>
              ) : null}
            </label>
          ))}
        </fieldset>
      </div>

      <p className="mt-6 flex items-baseline gap-2">
        <span className="mk-display text-5xl" data-testid="price-total">
          {eur(q.subtotalCents)}
        </span>
        <span className="text-muted-foreground text-sm">
          {per} · {labels.exclVat}
        </span>
      </p>

      <fieldset className="border-border mt-6 flex items-center justify-between gap-4 border-t pt-6">
        {/* A legend must be the fieldset's first child, which the two-column layout cannot
            have; so the legend names the group for assistive tech, and the visible title is a
            duplicate hidden from it. */}
        <legend className="sr-only">{labels.seats}</legend>
        <div>
          <p className="font-medium" aria-hidden="true">
            {labels.seats}
          </p>
          <p className="text-muted-foreground text-xs">{labels.seatsHelp}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSeats((s) => Math.max(1, s - 1))}
            disabled={seats <= 1}
            aria-label={labels.fewer}
            className="border-border enabled:hover:bg-muted size-9 rounded-full border text-lg enabled:cursor-pointer disabled:opacity-40"
          >
            −
          </button>
          <output aria-live="polite" className="w-8 text-center font-mono text-lg tabular-nums">
            {seats}
          </output>
          <button
            type="button"
            onClick={() => setSeats((s) => Math.min(maxSeats, s + 1))}
            disabled={seats >= maxSeats}
            aria-label={labels.more}
            className="border-border enabled:hover:bg-muted size-9 rounded-full border text-lg enabled:cursor-pointer disabled:opacity-40"
          >
            +
          </button>
        </div>
      </fieldset>

      <dl className="mt-6 flex flex-col gap-2 text-sm">
        <div className="flex justify-between">
          <dt>{labels.base}</dt>
          <dd className="font-mono tabular-nums">{eur(q.baseCents)}</dd>
        </div>
        {q.extraSeats > 0 ? (
          <div className="flex justify-between">
            <dt>{extraLabels[q.extraSeats]}</dt>
            <dd className="font-mono tabular-nums">{eur(q.extraCents)}</dd>
          </div>
        ) : null}
        <div className="border-border flex justify-between border-t pt-2 font-semibold">
          <dt>{labels.total}</dt>
          <dd className="font-mono tabular-nums">
            {eur(q.subtotalCents)}{' '}
            <span className="text-muted-foreground font-normal">{labels.exclVat}</span>
          </dd>
        </div>
      </dl>
    </div>
  )
}
