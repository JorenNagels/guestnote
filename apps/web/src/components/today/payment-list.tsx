import type { DuePaymentRow } from '@guestnote/db'
import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'
import { formatCents } from '../../lib/money.ts'
import { app } from '../../lib/routes.ts'
import { daysBetween } from '../tasks/buckets.ts'

/**
 * Today's Betalingen (spec 0009 C2): unpaid payments that are late or due within the week,
 * across every wedding the reader can see. Each row is one link to that wedding's payments,
 * where it is marked paid -- there is no tick box here, because "paid" wants a date and the
 * payment sheet is where that date is asked for.
 *
 * Unlike `TaskList`, an empty list renders NOTHING, heading included. The task lists keep an
 * empty heading because "is anything due today" is what the planner opened the page to ask; a
 * payment falls due a handful of times per wedding, so a money block would say "nothing" on most
 * visits, and that is noise. When nothing at all is due, the page's all-clear sentence says so.
 *
 * Amounts are written in the READER's locale, not each wedding's as the money screens do: this
 * list mixes weddings, and a column that switches between `€ 1.200,00` and `€1,200.00` row by
 * row reads as an error. Lateness is said in words beside the colour, never by colour alone.
 */
export async function PaymentList({
  payments,
  today,
}: {
  payments: readonly DuePaymentRow[]
  today: string
}) {
  if (payments.length === 0) return null
  const [t, locale] = await Promise.all([getTranslations('app.today'), getLocale()])

  return (
    <section aria-labelledby="today-payments" className="mt-7">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h2 id="today-payments" className="text-[0.95rem] font-semibold tracking-tight">
          {t('sections.payments')}
        </h2>
        <span className="text-muted-foreground font-mono text-[0.72rem] tabular-nums">
          {t('paymentCount', { count: payments.length })}
        </span>
      </div>
      <ul className="border-border bg-card overflow-hidden rounded-[var(--radius-container)] border">
        {payments.map((p) => {
          const days = daysBetween(today, p.dueOn)
          const late = days < 0
          const when =
            days === 0
              ? t('paymentWhen.today')
              : late
                ? t('paymentWhen.late', { count: -days })
                : t('paymentWhen.in', { count: days })
          return (
            <li key={p.id} className="border-border border-t first:border-t-0">
              <Link
                href={app.weddingPayments(p.weddingId)}
                className="hover:bg-muted/50 focus-visible:outline-ring flex min-h-[var(--row-h)] items-center gap-3 px-3.5 py-1.5 focus-visible:outline-2 focus-visible:-outline-offset-2"
              >
                <span
                  aria-hidden="true"
                  data-testid="wedding-dot"
                  style={p.weddingColor ? { backgroundColor: p.weddingColor } : undefined}
                  className={`size-2.5 shrink-0 rounded-full ${p.weddingColor ? '' : 'bg-muted-foreground/40'}`}
                />
                <span className="min-w-0 flex-1 py-0.5">
                  {/* The payee as the payments screen names it: the vendor, else the line. */}
                  <span className="block truncate text-[0.84rem]">
                    {p.vendorName ?? p.lineLabel}
                  </span>
                  <span className="text-muted-foreground mt-0.5 block truncate text-[0.72rem]">
                    {p.weddingName}
                  </span>
                </span>
                <span className="flex-none text-right">
                  <span className="block font-mono text-[0.84rem] tabular-nums">
                    {formatCents(p.amountCents, locale)}
                  </span>
                  <time
                    dateTime={p.dueOn}
                    className={`mt-0.5 block text-[0.72rem] ${late ? 'text-destructive font-medium' : 'text-muted-foreground'}`}
                  >
                    {when}
                  </time>
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
