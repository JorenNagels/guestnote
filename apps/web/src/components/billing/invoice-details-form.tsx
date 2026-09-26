'use client'

import { Button } from '@guestnote/ui/button'
import { Field } from '@guestnote/ui/field'
import { InlineError } from '@guestnote/ui/inline-error'
import { LiveRegion } from '@guestnote/ui/live-region'
import { type FormEvent, startTransition, useActionState, useState } from 'react'
import type { InvoiceDetailsState, InvoiceDetailsValues } from './types.ts'

export type InvoiceDetailsLabels = Readonly<{
  title: string
  name: string
  email: string
  vat: string
  vatHelp: string
  save: string
  saving: string
  saved: string
  errors: Readonly<{
    tooLong: string
    invalidEmail: string
    invalidVat: string
    failed: string
  }>
}>

/**
 * "Invoice details": billed-to, billing email, VAT number, saved to the org (spec 0005). Posted
 * from `onSubmit` for the reason `RenameForm` gives -- React 19 resets a form after its action,
 * and the fields would snap back to the saved values for the length of the request. The values
 * the server saw come back in the state, so a refused save keeps what was typed.
 */
export function InvoiceDetailsForm({
  initial,
  labels,
  action,
}: {
  initial: InvoiceDetailsValues
  labels: InvoiceDetailsLabels
  action: (prev: InvoiceDetailsState, fd: FormData) => Promise<InvoiceDetailsState>
}) {
  const [state, dispatch, pending] = useActionState(action, {})
  const [values, setValues] = useState(initial)
  const [edited, setEdited] = useState(false)

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (pending) return
    setEdited(false)
    const fd = new FormData(e.currentTarget)
    startTransition(() => dispatch(fd))
  }

  const set = (key: keyof InvoiceDetailsValues) => (e: { currentTarget: { value: string } }) => {
    // Read now, not inside the updater: React runs that later, after the event has let go of
    // `currentTarget` (null by then) -- found in the browser, the first keystroke threw.
    const value = e.currentTarget.value
    setValues((v) => ({ ...v, [key]: value }))
    setEdited(true)
  }
  const errors = edited ? {} : (state.errors ?? {})
  const saved = !edited && state.saved === true

  return (
    <section
      aria-labelledby="details-title"
      className="bg-card border-border rounded-[var(--radius)] border px-[18px] py-4"
    >
      <h2 id="details-title" className="mb-3 text-[14.5px] font-semibold">
        {labels.title}
      </h2>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3">
        <div>
          <Field
            id="billing-name"
            name="billingName"
            label={labels.name}
            autoComplete="organization"
            value={values.billingName}
            onChange={set('billingName')}
            invalid={Boolean(errors.billingName)}
            errorId="billing-name-error"
          />
          {errors.billingName ? (
            <InlineError id="billing-name-error">{labels.errors.tooLong}</InlineError>
          ) : null}
        </div>
        <div>
          <Field
            id="billing-email"
            name="billingEmail"
            type="email"
            label={labels.email}
            autoComplete="email"
            value={values.billingEmail}
            onChange={set('billingEmail')}
            invalid={Boolean(errors.billingEmail)}
            errorId="billing-email-error"
          />
          {errors.billingEmail ? (
            <InlineError id="billing-email-error">{labels.errors.invalidEmail}</InlineError>
          ) : null}
        </div>
        <div>
          <Field
            id="billing-vat"
            name="vatNumber"
            label={labels.vat}
            autoComplete="off"
            spellCheck={false}
            placeholder={labels.vatHelp}
            // Mono, as the design sets it: a VAT number is read digit by digit. `Field` owns its
            // class list, so the family goes in as a style rather than a second variant there.
            style={{ fontFamily: 'var(--font-mono)' }}
            value={values.vatNumber}
            onChange={set('vatNumber')}
            invalid={Boolean(errors.vatNumber)}
            errorId="billing-vat-error"
          />
          {errors.vatNumber ? (
            <InlineError id="billing-vat-error">{labels.errors.invalidVat}</InlineError>
          ) : null}
        </div>
        {!edited && state.form === 'failed' ? (
          <InlineError id="billing-details-error">{labels.errors.failed}</InlineError>
        ) : null}
        <div className="flex items-center gap-3">
          <div>
            <Button type="submit" className="px-5" busy={pending} busyLabel={labels.saving}>
              {labels.save}
            </Button>
          </div>
          {saved ? <span className="text-muted-foreground text-xs">{labels.saved}</span> : null}
        </div>
        <LiveRegion message={saved ? labels.saved : ''} />
      </form>
    </section>
  )
}
