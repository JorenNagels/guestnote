'use client'

import type { PaymentLineOption, PaymentRow } from '@guestnote/db'
import { Button } from '@guestnote/ui/button'
import { Field } from '@guestnote/ui/field'
import { InlineError } from '@guestnote/ui/inline-error'
import { Sheet } from '@guestnote/ui/sheet'
import { useTranslations } from 'next-intl'
import { type FormEvent, useState, useTransition } from 'react'
import { removePayment, savePayment } from '../../app/pro/(app)/weddings/[id]/payments/actions.ts'
import { centsToInput, civilDateOf } from '../../lib/money.ts'
import { Hint, SelectField } from './form-bits.tsx'
import type { MoneyError } from './types.ts'

/** The side sheet that adds or edits one payment. Same shape as `LineSheet`; see there. */
export function PaymentSheet({
  weddingId,
  locale,
  timezone,
  today,
  payment,
  lines,
  onClose,
}: {
  weddingId: string
  locale: string
  timezone: string
  /** The wedding's civil date, decided on the server, so the default due date agrees with "overdue". */
  today: string
  /** `null` adds a payment. */
  payment: PaymentRow | null
  lines: readonly PaymentLineOption[]
  onClose: () => void
}) {
  const t = useTranslations('app.money.paymentForm')
  const te = useTranslations('app.money.errors')
  const [lineId, setLineId] = useState(payment?.budgetLineId ?? '')
  const [dueOn, setDueOn] = useState(payment?.dueOn ?? today)
  const [amount, setAmount] = useState(payment ? centsToInput(payment.amountCents, locale) : '')
  const [paidOn, setPaidOn] = useState(payment?.paidAt ? civilDateOf(payment.paidAt, timezone) : '')
  const [error, setError] = useState<MoneyError | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [pending, start] = useTransition()

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    start(async () => {
      const result = await savePayment(weddingId, payment?.id ?? null, {
        budgetLineId: lineId,
        dueOn,
        amount,
        paidOn,
      })
      if (result.ok) onClose()
      else setError(result.error)
    })
  }

  const remove = () => {
    if (!payment) return
    setError(null)
    start(async () => {
      const result = await removePayment(weddingId, payment.id)
      if (result.ok) onClose()
      else setError(result.error)
    })
  }

  const fieldError = (key: MoneyError) =>
    error === key ? <InlineError id={`pay-${key}-error`}>{te(key)}</InlineError> : null

  return (
    <Sheet
      open
      onClose={onClose}
      title={payment ? t('titleEdit') : t('titleNew')}
      closeLabel={t('close')}
      footer={
        confirming ? (
          <div className="space-y-3">
            <p className="text-sm">{t('deleteAsk')}</p>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setConfirming(false)} disabled={pending}>
                {t('cancel')}
              </Button>
              <Button onClick={remove} busy={pending} busyLabel={t('deleting')}>
                {t('deleteConfirm')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            {payment && (
              <Button variant="secondary" onClick={() => setConfirming(true)} disabled={pending}>
                {t('delete')}
              </Button>
            )}
            <Button type="submit" form="payment-form" busy={pending} busyLabel={t('saving')}>
              {t('save')}
            </Button>
          </div>
        )
      }
    >
      <form id="payment-form" onSubmit={submit} noValidate className="space-y-4">
        <div>
          <SelectField
            id="pay-line"
            label={t('line')}
            value={lineId}
            onChange={(e) => setLineId(e.target.value)}
            invalid={error === 'line'}
            errorId="pay-line-error"
          >
            <option value="">{t('linePick')}</option>
            {lines.map((l) => (
              <option key={l.id} value={l.id}>
                {l.category} · {l.label}
              </option>
            ))}
          </SelectField>
          {fieldError('line')}
        </div>
        <div>
          <Field
            id="pay-due"
            type="date"
            label={t('due')}
            value={dueOn}
            onChange={(e) => setDueOn(e.target.value)}
            invalid={error === 'due'}
            errorId="pay-due-error"
          />
          {fieldError('due')}
        </div>
        <div>
          <Field
            id="pay-amount"
            label={t('amount')}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            autoComplete="off"
            invalid={error === 'amount'}
            errorId="pay-amount-error"
          />
          {fieldError('amount')}
        </div>
        <div>
          <Field
            id="pay-paid"
            type="date"
            label={t('paidOn')}
            value={paidOn}
            onChange={(e) => setPaidOn(e.target.value)}
            invalid={error === 'paidOn'}
            errorId="pay-paid-error"
          />
          <Hint id="pay-paid-hint">{t('paidOnHint')}</Hint>
          {fieldError('paidOn')}
        </div>
        {(error === 'notFound' || error === 'failed') && <InlineError>{te(error)}</InlineError>}
      </form>
    </Sheet>
  )
}
