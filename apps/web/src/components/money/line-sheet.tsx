'use client'

import type { BudgetLine, VendorOption } from '@guestnote/db'
import { Button } from '@guestnote/ui/button'
import { Field } from '@guestnote/ui/field'
import { InlineError } from '@guestnote/ui/inline-error'
import { Sheet } from '@guestnote/ui/sheet'
import { useTranslations } from 'next-intl'
import { type FormEvent, useState, useTransition } from 'react'
import {
  removeBudgetLine,
  restoreLine,
  saveBudgetLine,
} from '../../app/pro/(app)/weddings/[id]/budget/actions.ts'
import { centsToInput } from '../../lib/money.ts'
import type { MoneyError } from '../../lib/money-types.ts'
import { useToast } from '../toast/toast-provider.tsx'
import { Hint, SelectField } from './form-bits.tsx'

/**
 * The side sheet that adds or edits one budget line. Amounts stay text in state and are parsed by
 * the server action, so the server's reading of "1.234,50" is the only one there is.
 *
 * A refused save keeps the draft and names the field. `MoneyError` is a key, and the copy is
 * looked up here in the planner's language.
 */
export function LineSheet({
  weddingId,
  locale,
  line,
  defaultCategory,
  categories,
  vendors,
  onClose,
}: {
  weddingId: string
  locale: string
  /** `null` adds a line. */
  line: BudgetLine | null
  defaultCategory: string
  categories: readonly string[]
  vendors: readonly VendorOption[]
  onClose: () => void
}) {
  const t = useTranslations('app.money.lineForm')
  const te = useTranslations('app.money.errors')
  const [category, setCategory] = useState(line?.category ?? defaultCategory)
  const [label, setLabel] = useState(line?.label ?? '')
  const [estimate, setEstimate] = useState(line ? centsToInput(line.estimateCents, locale) : '')
  const [actual, setActual] = useState(
    line?.actualCents != null ? centsToInput(line.actualCents, locale) : '',
  )
  const [vendorId, setVendorId] = useState(line?.weddingVendorId ?? '')
  const [error, setError] = useState<MoneyError | null>(null)
  const [pending, start] = useTransition()
  // Its own transition, so the Delete button says "Deleting…" and Save does not say "Saving…".
  const [deleting, startDelete] = useTransition()
  const toast = useToast()

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    start(async () => {
      const result = await saveBudgetLine(weddingId, line?.id ?? null, {
        category,
        label,
        estimate,
        actual,
        weddingVendorId: vendorId,
      })
      if (result.ok) onClose()
      else setError(result.error)
    })
  }

  /**
   * Spec 0009 C4: at once, no "are you sure". The line is soft-deleted and its payments are left
   * alone (`deleteBudgetLine`), so nothing is lost that Undo cannot put back -- which is what
   * makes a confirmation step a cost with nothing bought. The sheet closes and the toast, which
   * lives in the layout, outlives it.
   */
  const remove = () => {
    if (!line) return
    setError(null)
    startDelete(async () => {
      const result = await removeBudgetLine(weddingId, line.id)
      if (!result.ok) {
        setError(result.error)
        return
      }
      onClose()
      toast.show({
        message: t('deleted', { label: line.label }),
        undo: async () => {
          const back = await restoreLine(weddingId, line.id)
          if (back.ok) return 'restored'
          return back.error === 'notFound' ? 'gone' : { message: te(back.error) }
        },
      })
    })
  }

  const fieldError = (key: MoneyError) =>
    error === key ? <InlineError id={`line-${key}-error`}>{te(key)}</InlineError> : null

  return (
    <Sheet
      open
      onClose={onClose}
      title={line ? t('titleEdit') : t('titleNew')}
      closeLabel={t('close')}
      footer={
        <div className="flex gap-2">
          {line && (
            <Button
              variant="secondary"
              onClick={remove}
              disabled={pending}
              busy={deleting}
              busyLabel={t('deleting')}
            >
              {t('delete')}
            </Button>
          )}
          <Button
            type="submit"
            form="line-form"
            busy={pending}
            busyLabel={t('saving')}
            disabled={deleting}
          >
            {t('save')}
          </Button>
        </div>
      }
    >
      <form id="line-form" onSubmit={submit} noValidate className="space-y-4">
        <div>
          <Field
            id="line-category"
            label={t('category')}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            list="line-categories"
            maxLength={60}
            autoComplete="off"
            invalid={error === 'category'}
            errorId="line-category-error"
          />
          <datalist id="line-categories">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          {fieldError('category')}
        </div>
        <div>
          <Field
            id="line-label"
            label={t('label')}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            maxLength={120}
            autoComplete="off"
            invalid={error === 'label'}
            errorId="line-label-error"
          />
          {fieldError('label')}
        </div>
        <div>
          <Field
            id="line-estimate"
            label={t('estimate')}
            value={estimate}
            onChange={(e) => setEstimate(e.target.value)}
            inputMode="decimal"
            autoComplete="off"
            invalid={error === 'estimate'}
            errorId="line-estimate-error"
          />
          {fieldError('estimate')}
        </div>
        <div>
          <Field
            id="line-actual"
            label={t('actual')}
            value={actual}
            onChange={(e) => setActual(e.target.value)}
            inputMode="decimal"
            autoComplete="off"
            invalid={error === 'actual'}
            errorId="line-actual-error"
          />
          <Hint id="line-actual-hint">{t('actualHint')}</Hint>
          {fieldError('actual')}
        </div>
        <div>
          <SelectField
            id="line-vendor"
            label={t('vendor')}
            value={vendorId}
            onChange={(e) => setVendorId(e.target.value)}
            invalid={error === 'vendor'}
            errorId="line-vendor-error"
          >
            <option value="">{t('vendorNone')}</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </SelectField>
          {vendors.length === 0 && <Hint id="line-vendor-hint">{t('vendorEmpty')}</Hint>}
          {fieldError('vendor')}
        </div>
        {(error === 'notFound' || error === 'failed') && <InlineError>{te(error)}</InlineError>}
      </form>
    </Sheet>
  )
}
