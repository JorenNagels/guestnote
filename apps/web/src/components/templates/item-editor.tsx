'use client'

import type { TemplateItemRow } from '@guestnote/db'
import { Button } from '@guestnote/ui/button'
import { InlineError } from '@guestnote/ui/inline-error'
import { Sheet } from '@guestnote/ui/sheet'
import { useTranslations } from 'next-intl'
import { type FormEvent, useId, useRef, useState, useTransition } from 'react'
import {
  addItemAction,
  deleteItemAction,
  updateItemAction,
} from '../../app/pro/(app)/templates/[templateId]/actions.ts'
import {
  EMPTY_ITEM,
  formFromItem,
  type ItemFormValues,
  type TemplateActionError,
} from '../../lib/template-input.ts'
import { SmallButton } from '../vendors/controls.tsx'
import { ItemFields } from './item-fields.tsx'

type Result = { ok: true } | { ok: false; error: TemplateActionError }

export function AddItemForm({ templateId }: { templateId: string }) {
  const t = useTranslations('app.templates')
  const formId = useId()
  const title = useRef<HTMLInputElement>(null)
  const [values, setValues] = useState<ItemFormValues>(EMPTY_ITEM)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      try {
        const r = await addItemAction(templateId, values)
        if (r.ok) {
          // Keep timing, owner and visibility: a plan is typed in runs of similar rows.
          setValues({ ...values, title: '', offsetDays: '' })
          title.current?.focus()
        } else {
          setError(r.error)
        }
      } catch {
        setError('generic')
      }
    })
  }

  return (
    <form
      onSubmit={submit}
      aria-labelledby={`${formId}-heading`}
      className="border-border rounded-[var(--radius)] border border-dashed p-3"
    >
      {/* `-heading`, not `-title`: `idPrefix={formId}` below also names the title FIELD
          `${formId}-title`, and two elements sharing one id breaks its `label[for]`. */}
      <h2 id={`${formId}-heading`} className="mb-2 text-sm font-semibold">
        {t('item.addTitle')}
      </h2>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1">
          <ItemFields
            values={values}
            onChange={setValues}
            idPrefix={formId}
            layout="row"
            titleRef={title}
          />
        </div>
        <div className="w-full sm:w-32">
          <Button type="submit" busy={pending} busyLabel={t('item.adding')}>
            {t('item.add')}
          </Button>
        </div>
      </div>
      {error && <InlineError>{t(`errors.${error}`)}</InlineError>}
    </form>
  )
}

export function ItemSheet({
  templateId,
  item,
  onClose,
}: {
  templateId: string
  item: TemplateItemRow
  onClose: () => void
}) {
  const t = useTranslations('app.templates')
  const formId = useId()
  const [values, setValues] = useState<ItemFormValues>(() => formFromItem(item))
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  const run = (fn: () => Promise<Result>) => {
    setError(null)
    startTransition(async () => {
      try {
        const r = await fn()
        if (r.ok) onClose()
        else setError(r.error)
      } catch {
        setError('generic')
      }
    })
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={t('item.editTitle')}
      closeLabel={t('form.close')}
      footer={
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="submit"
            form={formId}
            busy={pending}
            busyLabel={t('form.saving')}
            disabled={confirming}
          >
            {t('form.save')}
          </Button>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            {t('form.cancel')}
          </Button>
        </div>
      }
    >
      <form
        id={formId}
        onSubmit={(e) => {
          e.preventDefault()
          run(() => updateItemAction(templateId, item.id, values))
        }}
        className="space-y-4"
      >
        <ItemFields values={values} onChange={setValues} idPrefix={formId} layout="stack" />
        {error && <InlineError>{t(`errors.${error}`)}</InlineError>}
        <div className="border-border border-t pt-4">
          {confirming ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm">{t('item.removeConfirm')}</span>
              <SmallButton
                disabled={pending}
                onClick={() => run(() => deleteItemAction(templateId, item.id))}
              >
                {t('item.removeConfirmYes')}
              </SmallButton>
              <SmallButton disabled={pending} onClick={() => setConfirming(false)}>
                {t('form.cancel')}
              </SmallButton>
            </div>
          ) : (
            <SmallButton disabled={pending} onClick={() => setConfirming(true)}>
              {t('item.remove')}
            </SmallButton>
          )}
        </div>
      </form>
    </Sheet>
  )
}
