'use client'

import { Button } from '@guestnote/ui/button'
import { Field } from '@guestnote/ui/field'
import { InlineError } from '@guestnote/ui/inline-error'
import { useFormatter, useTranslations } from 'next-intl'
import { useId, useState, useTransition } from 'react'
import {
  createTaskAction,
  updateTaskAction,
} from '../../app/pro/(app)/weddings/[id]/tasks/actions.ts'
import { addDays } from './buckets.ts'
import { NOTES_MAX, OFFSET_MAX, offsetFromForm, type TaskFormValues, TITLE_MAX } from './form.ts'
import { formatDate } from './format.ts'

/**
 * The one form for creating and editing. It is inline, above the list or in place of the detail
 * card, and never a page or a modal: adding a task should cost what adding a row to a
 * spreadsheet costs.
 *
 * Nothing is cleared on an error. The action returns a key, the form shows it under the fields,
 * and the planner's typing stays where it was.
 */
export function TaskForm({
  weddingId,
  taskId,
  weddingDate,
  initial,
  onDone,
  onCancel,
}: {
  weddingId: string
  /** Present when editing. */
  taskId?: string | undefined
  weddingDate: string | null
  initial: TaskFormValues
  onDone: () => void
  onCancel: () => void
}) {
  const t = useTranslations('app.s2')
  const format = useFormatter()
  const uid = useId()
  const [values, setValues] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const set = <K extends keyof TaskFormValues>(key: K, value: TaskFormValues[K]) =>
    setValues((v) => ({ ...v, [key]: value }))

  const errorId = `${uid}-error`
  const editing = taskId !== undefined

  // The resolved date is shown while typing: an offset alone ("-42") tells a planner nothing
  // until it is a date on a calendar.
  const days = offsetFromForm(values.offsetDays, values.offsetDirection)
  const preview =
    values.dueKind === 'offset' && days !== null
      ? weddingDate === null
        ? t('form.previewNoWeddingDate')
        : t('form.previewDate', { date: formatDate(format, addDays(weddingDate, days)) })
      : null

  function submit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    startTransition(async () => {
      const result = editing
        ? await updateTaskAction(weddingId, taskId, values)
        : await createTaskAction(weddingId, values)
      if (result.ok) onDone()
      else setError(result.error)
    })
  }

  return (
    <form
      onSubmit={submit}
      aria-label={t(editing ? 'form.editHeading' : 'form.newHeading')}
      className="border-border bg-card mb-5 rounded-[var(--radius)] border p-4"
    >
      <p className="mb-3 text-sm font-semibold">
        {t(editing ? 'form.editHeading' : 'form.newHeading')}
      </p>

      <Field
        id={`${uid}-title`}
        label={t('form.title')}
        placeholder={t('form.titlePlaceholder')}
        value={values.title}
        maxLength={TITLE_MAX}
        autoFocus
        onChange={(e) => set('title', e.target.value)}
        invalid={error === 'title'}
        errorId={errorId}
      />

      <div className="mt-3">
        <label htmlFor={`${uid}-notes`} className="mb-1.5 block text-sm font-medium">
          {t('form.notes')}
        </label>
        <textarea
          id={`${uid}-notes`}
          value={values.notes}
          maxLength={NOTES_MAX}
          rows={2}
          onChange={(e) => set('notes', e.target.value)}
          className="border-input w-full rounded-[var(--radius)] border bg-transparent px-3 py-2 text-base"
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-x-8 gap-y-3">
        <Choice
          legend={t('form.owner')}
          name={`${uid}-owner`}
          value={values.assigneeRole}
          onChange={(v) => set('assigneeRole', v)}
          options={[
            ['planner', t('row.planner')],
            ['couple', t('row.couple')],
          ]}
        />
        <Choice
          legend={t('form.visibility')}
          name={`${uid}-visibility`}
          value={values.visibility}
          onChange={(v) => set('visibility', v)}
          options={[
            ['shared', t('visibility.shared')],
            ['internal', t('visibility.internal')],
          ]}
        />
      </div>

      <div className="mt-3">
        <Choice
          legend={t('form.dueHeading')}
          name={`${uid}-due`}
          value={values.dueKind}
          onChange={(v) => set('dueKind', v)}
          options={[
            ['none', t('form.dueNone')],
            ['offset', t('form.dueOffset')],
            ['date', t('form.dueDate')],
          ]}
        />

        {values.dueKind === 'offset' && (
          <div className="mt-3 flex flex-wrap items-end gap-x-6 gap-y-3">
            <div className="w-32">
              <Field
                id={`${uid}-days`}
                label={t('form.offsetDays')}
                type="number"
                inputMode="numeric"
                min={0}
                max={OFFSET_MAX}
                value={values.offsetDays}
                onChange={(e) => set('offsetDays', e.target.value)}
                invalid={error === 'offset'}
                errorId={errorId}
              />
            </div>
            <Choice
              legend={t('form.dueOffset')}
              legendHidden
              name={`${uid}-direction`}
              value={values.offsetDirection}
              onChange={(v) => set('offsetDirection', v)}
              options={[
                ['before', t('form.before')],
                ['after', t('form.after')],
              ]}
            />
          </div>
        )}

        {values.dueKind === 'date' && (
          <div className="mt-3 w-48">
            <Field
              id={`${uid}-date`}
              label={t('form.date')}
              type="date"
              value={values.date}
              onChange={(e) => set('date', e.target.value)}
              invalid={error === 'date'}
              errorId={errorId}
            />
          </div>
        )}

        {values.dueKind !== 'none' && (
          <p className="text-muted-foreground mt-2 text-xs" aria-live="polite">
            {values.dueKind === 'offset' ? t('form.offsetHint') : t('form.fixedHint')}
            {preview && <span className="text-foreground ml-1.5 font-medium">{preview}</span>}
          </p>
        )}
      </div>

      {error && <InlineError id={errorId}>{t(`errors.${error}`)}</InlineError>}

      <div className="mt-4 flex gap-2">
        <Button type="submit" busy={pending} busyLabel={t('form.saving')} className="w-auto! px-4">
          {t('form.save')}
        </Button>
        <Button variant="secondary" onClick={onCancel} disabled={pending} className="w-auto! px-4">
          {t('form.cancel')}
        </Button>
      </div>
    </form>
  )
}

/**
 * A radio group drawn as a row of pills. Native radios, visually hidden, so the arrow keys, the
 * group name and the `checked` state all come from the browser rather than from ARIA written by
 * hand here.
 */
function Choice<V extends string>({
  legend,
  legendHidden = false,
  name,
  value,
  onChange,
  options,
}: {
  legend: string
  legendHidden?: boolean
  name: string
  value: V
  onChange: (value: V) => void
  options: ReadonlyArray<readonly [V, string]>
}) {
  return (
    <fieldset>
      <legend className={legendHidden ? 'sr-only' : 'mb-1.5 text-sm font-medium'}>{legend}</legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map(([optionValue, text]) => (
          <label
            key={optionValue}
            className="border-input has-[:checked]:border-primary has-[:checked]:bg-primary has-[:checked]:text-primary-foreground has-[:focus-visible]:ring-ring inline-flex h-9 cursor-pointer items-center rounded-full border px-3 text-sm has-[:focus-visible]:ring-2"
          >
            <input
              type="radio"
              name={name}
              value={optionValue}
              checked={value === optionValue}
              onChange={() => onChange(optionValue)}
              className="sr-only"
            />
            {text}
          </label>
        ))}
      </div>
    </fieldset>
  )
}
