'use client'

import { Button } from '@guestnote/ui/button'
import { Field } from '@guestnote/ui/field'
import { InlineError } from '@guestnote/ui/inline-error'
import { Sheet } from '@guestnote/ui/sheet'
import { useTranslations } from 'next-intl'
import { type FormEvent, useId, useState, useTransition } from 'react'
import { TEMPLATE_LIMITS, type TemplateActionError } from '../../lib/template-input.ts'
import { SmallButton } from '../vendors/controls.tsx'

type Result = { ok: true } | { ok: false; error: TemplateActionError }

type Props = {
  /** Present when editing. Absent for a new template. */
  template?: { name: string; description: string | null }
  onSubmit: (input: { name: string; description: string }) => Promise<Result>
  /** Editing only, and only offered where the caller may delete. */
  onDelete?: () => Promise<Result>
  onClose: () => void
}

/**
 * One form for a template's name and description, in a `Sheet`, so a half-typed draft never
 * survives a close. Nothing here decides what is valid: the strings go to the server as typed and
 * `parseTemplateInput` answers, so the two cannot disagree.
 *
 * On success the sheet closes; the list underneath refreshes because the action revalidates the
 * route, not because this component pushes a row in.
 */
export function TemplateSheet({ template, onSubmit, onDelete, onClose }: Props) {
  const t = useTranslations('app.s7')
  const formId = useId()
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

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const data = new FormData(e.currentTarget)
    run(() =>
      onSubmit({
        name: String(data.get('name') ?? ''),
        description: String(data.get('description') ?? ''),
      }),
    )
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={template ? t('form.titleEdit') : t('form.titleNew')}
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
      <form id={formId} onSubmit={submit} className="space-y-4">
        <Field
          id={`${formId}-name`}
          name="name"
          label={t('form.name')}
          defaultValue={template?.name ?? ''}
          required
          maxLength={TEMPLATE_LIMITS.name}
          autoComplete="off"
        />
        <div>
          <label htmlFor={`${formId}-description`} className="mb-1.5 block text-sm font-medium">
            {t('form.description')}
          </label>
          <textarea
            id={`${formId}-description`}
            name="description"
            defaultValue={template?.description ?? ''}
            maxLength={TEMPLATE_LIMITS.description}
            rows={4}
            className="bg-transparent block w-full rounded-[var(--radius)] border border-[var(--input)] px-3 py-2 text-sm"
          />
          <p className="text-muted-foreground mt-1.5 text-xs">{t('form.descriptionHint')}</p>
        </div>

        {error && <InlineError>{t(`errors.${error}`)}</InlineError>}

        {template && onDelete && (
          <div className="border-border border-t pt-4">
            {confirming ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm">{t('form.deleteConfirm')}</span>
                <SmallButton disabled={pending} onClick={() => run(onDelete)}>
                  {t('form.deleteConfirmYes')}
                </SmallButton>
                <SmallButton disabled={pending} onClick={() => setConfirming(false)}>
                  {t('form.cancel')}
                </SmallButton>
              </div>
            ) : (
              <SmallButton disabled={pending} onClick={() => setConfirming(true)}>
                {t('form.delete')}
              </SmallButton>
            )}
            <p className="text-muted-foreground mt-2 text-xs">{t('form.deleteNote')}</p>
          </div>
        )}
      </form>
    </Sheet>
  )
}
