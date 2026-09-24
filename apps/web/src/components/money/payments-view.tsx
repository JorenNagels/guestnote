'use client'

import type { MoneyContext, PaymentLineOption, PaymentRow } from '@guestnote/db'
import { Button } from '@guestnote/ui/button'
import { Card } from '@guestnote/ui/card'
import { InlineError } from '@guestnote/ui/inline-error'
import { Pill } from '@guestnote/ui/pill'
import { Table, TableBody, TableCell, TableHead, TableHeaderCell } from '@guestnote/ui/table'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useState, useTransition } from 'react'
import { markPaymentPaid } from '../../app/pro/(app)/weddings/[id]/payments/actions.ts'
import { formatCivilDate } from '../../lib/civil-date.ts'
import {
  civilDateOf,
  daysBetween,
  formatCents,
  moneyLocale,
  paymentState,
  paymentTotals,
} from '../../lib/money.ts'
import type { MoneyError } from '../../lib/money-types.ts'
import { app } from '../../lib/routes.ts'
import { PaymentSheet } from './payment-sheet.tsx'

type SheetState = { payment: PaymentRow | null } | null

const ROW_BUTTON =
  'border-input hover:border-foreground inline-flex h-8 cursor-pointer items-center rounded-[var(--radius)] border px-2.5 text-xs font-medium disabled:cursor-wait disabled:opacity-55'

/**
 * The payment schedule. `today` is decided by the server from the real clock in the wedding's
 * timezone and handed down, so the overdue styling agrees between the server render and the
 * hydrated one even in the seconds around local midnight.
 */
export function PaymentsView({
  weddingId,
  wedding,
  today,
  payments,
  lines,
}: {
  weddingId: string
  wedding: MoneyContext
  today: string
  payments: PaymentRow[]
  lines: PaymentLineOption[]
}) {
  const t = useTranslations('app.money.payments')
  const ts = useTranslations('app.money.status')
  const tw = useTranslations('app.money.when')
  const te = useTranslations('app.money.errors')
  const [sheet, setSheet] = useState<SheetState>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<MoneyError | null>(null)
  const [, start] = useTransition()

  const locale = wedding.locale
  const eur = (cents: number) => formatCents(cents, locale)
  const totals = paymentTotals(payments, today)

  const toggle = (p: PaymentRow) => {
    setError(null)
    setBusyId(p.id)
    start(async () => {
      const result = await markPaymentPaid(weddingId, p.id, p.paidAt === null)
      if (!result.ok) setError(result.error)
      setBusyId(null)
    })
  }

  const whenLabel = (p: PaymentRow): string => {
    if (p.paidAt) {
      return tw('paidOn', {
        date: formatCivilDate(
          moneyLocale(locale),
          civilDateOf(p.paidAt, wedding.timezone),
          'short',
        ),
      })
    }
    const days = daysBetween(today, p.dueOn)
    if (days === 0) return tw('today')
    if (days > 0) return days === 1 ? tw('inOne', { n: 1 }) : tw('inOther', { n: days })
    return days === -1 ? tw('lateOne', { n: 1 }) : tw('lateOther', { n: -days })
  }

  return (
    <div className="mx-auto max-w-5xl px-6 pt-6 pb-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">{t('title')}</h2>
          <p className="text-muted-foreground mt-1 text-sm">{t('subtitle')}</p>
        </div>
        <div className="flex gap-2">
          <Link
            href={app.weddingBudget(weddingId)}
            className="border-input hover:border-foreground inline-flex h-11 items-center rounded-[var(--radius)] border px-4 text-sm font-medium"
          >
            {t('toBudget')}
          </Link>
          {lines.length > 0 && payments.length > 0 && (
            <div className="w-48">
              <Button onClick={() => setSheet({ payment: null })}>{t('add')}</Button>
            </div>
          )}
        </div>
      </header>

      {lines.length === 0 ? (
        <Card className="mt-7 max-w-xl">
          <h2 className="text-base font-semibold">{t('noLinesTitle')}</h2>
          <p className="text-muted-foreground mt-1.5 text-sm leading-relaxed">{t('noLinesBody')}</p>
          <Link
            href={app.weddingBudget(weddingId)}
            className="bg-primary text-primary-foreground mt-4 inline-flex h-11 items-center rounded-[var(--radius)] px-4 text-sm font-semibold"
          >
            {t('noLinesAction')}
          </Link>
        </Card>
      ) : payments.length === 0 ? (
        <Card className="mt-7 max-w-xl">
          <h2 className="text-base font-semibold">{t('emptyTitle')}</h2>
          <p className="text-muted-foreground mt-1.5 text-sm leading-relaxed">{t('emptyBody')}</p>
          <div className="mt-4 max-w-56">
            <Button onClick={() => setSheet({ payment: null })}>{t('emptyAction')}</Button>
          </div>
        </Card>
      ) : (
        <>
          <dl className="mt-7 grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-2.5">
            <Total label={t('paid')} value={eur(totals.paidCents)} />
            <Total label={t('outstanding')} value={eur(totals.outstandingCents)} />
            <Total
              label={t('overdue')}
              value={eur(totals.overdueCents)}
              danger={totals.overdueCount > 0}
              note={
                totals.overdueCount === 0
                  ? undefined
                  : totals.overdueCount === 1
                    ? t('overdueCountOne', { n: 1 })
                    : t('overdueCountOther', { n: totals.overdueCount })
              }
            />
          </dl>

          <h2 className="mt-6 mb-3 text-[15px] font-semibold tracking-tight">{t('schedule')}</h2>
          {error && <InlineError>{te(error)}</InlineError>}
          <Table caption={t('tableCaption')}>
            <TableHead>
              <tr>
                <TableHeaderCell>{t('payee')}</TableHeaderCell>
                <TableHeaderCell>{t('due')}</TableHeaderCell>
                <TableHeaderCell>{t('status')}</TableHeaderCell>
                <TableHeaderCell numeric>{t('amount')}</TableHeaderCell>
                {/* Not an `sr-only` span: that is absolutely positioned, escapes the table's
                    scroll wrapper, and stretched the whole page sideways at phone width
                    (measured 2026-09-21, 649px document in a 390px viewport). */}
                <TableHeaderCell aria-label={t('actions')} />
              </tr>
            </TableHead>
            <TableBody>
              {payments.map((p) => {
                const state = paymentState(p, today)
                const payee = p.vendorName ?? p.lineLabel
                // A payee often has a deposit and a balance, so the name a screen reader gets
                // carries the due date: two buttons called "Edit payment to X" are not tellable apart.
                const named = `${payee}, ${formatCivilDate(moneyLocale(locale), p.dueOn, 'short')}`
                const late = state === 'overdue'
                return (
                  <tr key={p.id}>
                    <TableCell className="py-2">
                      <span className="block truncate text-[13.5px]">{payee}</span>
                      <span className="text-muted-foreground block truncate text-xs">
                        {p.vendorName ? `${p.lineLabel} · ${p.category}` : p.category}
                      </span>
                    </TableCell>
                    <TableCell className={late ? 'text-st-alert-fg' : undefined}>
                      <time
                        dateTime={p.dueOn}
                        className="block font-mono text-[12.5px] tabular-nums"
                      >
                        {formatCivilDate(moneyLocale(locale), p.dueOn, 'short')}
                      </time>
                      <span
                        className={
                          late
                            ? 'block text-[10.5px] font-semibold'
                            : 'text-muted-foreground block text-[10.5px]'
                        }
                      >
                        {whenLabel(p)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Pill tone={state === 'paid' ? 'success' : late ? 'danger' : 'neutral'}>
                        {ts(state)}
                      </Pill>
                    </TableCell>
                    <TableCell numeric>{eur(p.amountCents)}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <span className="inline-flex gap-1.5">
                        <button
                          type="button"
                          className={ROW_BUTTON}
                          disabled={busyId === p.id}
                          aria-label={
                            p.paidAt
                              ? t('markUnpaidFor', { payee: named })
                              : t('markPaidFor', { payee: named })
                          }
                          onClick={() => toggle(p)}
                        >
                          {p.paidAt ? t('markUnpaid') : t('markPaid')}
                        </button>
                        <button
                          type="button"
                          className={ROW_BUTTON}
                          aria-label={t('editPayment', { payee: named })}
                          onClick={() => setSheet({ payment: p })}
                        >
                          {t('edit')}
                        </button>
                      </span>
                    </TableCell>
                  </tr>
                )
              })}
            </TableBody>
          </Table>
        </>
      )}

      {sheet && (
        <PaymentSheet
          key={sheet.payment?.id ?? 'new'}
          weddingId={weddingId}
          locale={locale}
          timezone={wedding.timezone}
          today={today}
          payment={sheet.payment}
          lines={lines}
          onClose={() => setSheet(null)}
        />
      )}
    </div>
  )
}

function Total({
  label,
  value,
  note,
  danger,
}: {
  label: string
  value: string
  note?: string | undefined
  danger?: boolean
}) {
  return (
    <div className="bg-card rounded-[var(--radius)] border px-[15px] py-[13px]">
      <dt className="text-muted-foreground text-[11px] font-semibold tracking-[0.08em] uppercase">
        {label}
      </dt>
      <dd className="mt-2">
        <span
          className={
            danger
              ? 'text-st-alert-fg font-mono text-[21px] font-semibold tracking-tight tabular-nums'
              : 'font-mono text-[21px] font-semibold tracking-tight tabular-nums'
          }
        >
          {value}
        </span>
        {note && (
          <span className="text-st-alert-fg mt-0.5 block text-[11.5px] font-semibold">{note}</span>
        )}
      </dd>
    </div>
  )
}
