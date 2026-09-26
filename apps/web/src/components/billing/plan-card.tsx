'use client'

import { type BillingCycle, quote } from '@guestnote/billing'
import { Button } from '@guestnote/ui/button'
import { cx } from '@guestnote/ui/cx'
import { InlineError } from '@guestnote/ui/inline-error'
import { Pill, type PillTone } from '@guestnote/ui/pill'
import { useState, useTransition } from 'react'
import type { RedirectOutcome } from './types.ts'

export type PlanCardLabels = Readonly<{
  title: string
  pill: string
  cycleLabel: string
  monthly: string
  yearly: string
  base: string
  /** "Includes you, {owner}", finished on the server. */
  baseDetail: string
  /** "2 more planners", finished; null with no extra planner. */
  extra: string | null
  /** The extra planners' names, joined. */
  extraDetail: string
  /** "1 pending invite starts when accepted.", finished; null with none pending. */
  pending: string | null
  perMonth: string
  perYear: string
  total: string
  /** Raw, with `{amount}` filled here: the VAT depends on the cycle the toggle picks. */
  vat: string
  vatNone: string
  checkout: string
  checkoutBusy: string
  secure: string
  portal: string
  portalBusy: string
  errors: Readonly<Record<'unavailable' | 'failed' | 'forbidden', string>>
}>

/**
 * The Plan card (spec 0005, "Billing"): the status pill, the monthly/yearly toggle, the line
 * items from the live seat count, and the one button -- checkout while trialling, the provider's
 * portal once paid.
 *
 * The line items are `quote()` from `packages/billing`, run here so the toggle answers without a
 * round trip; the server recomputes nothing from what this shows, because checkout sends only
 * the cycle and counts the seats itself.
 *
 * "unavailable" -- the only thing the no-op provider says -- is an inline error, not a pretend
 * success: the screen must not look finished while there is no provider behind it.
 */
export function PlanCard({
  labels,
  tone,
  seats,
  vatNumber,
  paid,
  initialCycle,
  moneyLocale,
  checkout,
  portal,
}: {
  labels: PlanCardLabels
  tone: PillTone
  seats: number
  vatNumber: string | null
  paid: boolean
  initialCycle: BillingCycle
  /** BCP 47, for the amounts. */
  moneyLocale: string
  checkout: (cycle: BillingCycle) => Promise<RedirectOutcome>
  portal: () => Promise<RedirectOutcome>
}) {
  const [cycle, setCycle] = useState<BillingCycle>(initialCycle)
  const [error, setError] = useState<keyof PlanCardLabels['errors'] | null>(null)
  const [pending, startTransition] = useTransition()
  const q = quote(seats, cycle, vatNumber)
  const money = (cents: number) =>
    new Intl.NumberFormat(moneyLocale, { style: 'currency', currency: 'EUR' }).format(cents / 100)
  const per = cycle === 'yearly' ? labels.perYear : labels.perMonth

  function go(run: () => Promise<RedirectOutcome>) {
    setError(null)
    startTransition(async () => {
      const outcome = await run().catch(() => ({ ok: false, reason: 'failed' }) as const)
      if (outcome.ok) window.location.assign(outcome.url)
      else setError(outcome.reason)
    })
  }

  return (
    <section
      aria-labelledby="plan-title"
      className="bg-card border-border rounded-[var(--radius)] border px-[18px] py-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="plan-title" className="text-[14.5px] font-semibold">
          {labels.title}
        </h2>
        <Pill tone={tone}>{labels.pill}</Pill>
      </div>

      {paid ? null : (
        <fieldset className="mt-4">
          <legend className="sr-only">{labels.cycleLabel}</legend>
          <div className="bg-muted inline-flex rounded-[var(--radius)] p-0.5">
            {(['monthly', 'yearly'] as const).map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={cycle === c}
                onClick={() => setCycle(c)}
                className={cx(
                  'focus-visible:outline-ring h-8 cursor-pointer rounded-[calc(var(--radius)-2px)] px-3 text-[0.8125rem] outline-none focus-visible:outline-2',
                  cycle === c
                    ? 'bg-card text-card-foreground font-medium shadow-sm'
                    : 'text-muted-foreground',
                )}
              >
                {c === 'monthly' ? labels.monthly : labels.yearly}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      <dl className="mt-4 text-sm">
        <div className="border-border flex items-start justify-between gap-4 border-b py-2.5">
          <dt>
            <span className="font-medium">{labels.base}</span>
            <span className="text-muted-foreground block text-xs">{labels.baseDetail}</span>
          </dt>
          <dd className="font-mono tabular-nums">
            {money(q.baseCents)} <span className="text-muted-foreground text-xs">{per}</span>
          </dd>
        </div>
        {labels.extra && q.extraSeats > 0 ? (
          <div className="border-border flex items-start justify-between gap-4 border-b py-2.5">
            <dt className="min-w-0">
              <span className="font-medium">{labels.extra}</span>
              <span className="text-muted-foreground block text-xs">{labels.extraDetail}</span>
            </dt>
            <dd className="font-mono tabular-nums">
              {money(q.extraCents)} <span className="text-muted-foreground text-xs">{per}</span>
            </dd>
          </div>
        ) : null}
        <div className="flex items-baseline justify-between gap-4 py-2.5">
          <dt className="font-semibold">{labels.total}</dt>
          <dd className="font-mono font-semibold tabular-nums" data-testid="plan-total">
            {money(q.subtotalCents)} <span className="text-muted-foreground text-xs">{per}</span>
          </dd>
        </div>
      </dl>
      {labels.pending ? <p className="text-muted-foreground text-xs">{labels.pending}</p> : null}
      <p className="text-muted-foreground mt-1 text-xs">
        {q.vatPercent > 0 ? labels.vat.replace('{amount}', money(q.vatCents)) : labels.vatNone}
      </p>

      <div className="mt-4 flex flex-col gap-2">
        {paid ? (
          <div className="self-start">
            <Button
              type="button"
              variant="secondary"
              className="px-4"
              busy={pending}
              busyLabel={labels.portalBusy}
              onClick={() => go(portal)}
            >
              {labels.portal}
            </Button>
          </div>
        ) : (
          <>
            <div className="self-start">
              <Button
                type="button"
                className="px-5"
                busy={pending}
                busyLabel={labels.checkoutBusy}
                onClick={() => go(() => checkout(cycle))}
              >
                {labels.checkout}
              </Button>
            </div>
            <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="size-3.5 shrink-0"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="5" y="11" width="14" height="9" rx="2" />
                <path d="M8 11V8a4 4 0 0 1 8 0v3" />
              </svg>
              {labels.secure}
            </p>
          </>
        )}
        {error ? <InlineError id="plan-error">{labels.errors[error]}</InlineError> : null}
      </div>
    </section>
  )
}
