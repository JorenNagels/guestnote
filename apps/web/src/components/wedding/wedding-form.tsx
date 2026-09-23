'use client'

import { Button } from '@guestnote/ui/button'
import { Card } from '@guestnote/ui/card'
import { ColorPicker } from '@guestnote/ui/color-picker'
import { cx } from '@guestnote/ui/cx'
import { Field } from '@guestnote/ui/field'
import { InlineError } from '@guestnote/ui/inline-error'
import Link from 'next/link'
import { useActionState, useId, useState } from 'react'
import { EMPTY_FORM_STATE, type FormState } from './form-state.ts'
import type { WeddingFormLabels } from './labels.ts'

/**
 * The wedding form, for creating and for editing: the same fields, so one component. `mode`
 * decides two things only -- notes appear when editing (the new-wedding brief is "four things
 * now"), and where Cancel goes.
 *
 * ## The colour
 *
 * `ColorPicker` reports through `onChange`, which fires continuously while a person drags in
 * the native picker, so the colour lives in state and travels in a hidden input named `color`.
 * The action receives a plain `#RRGGBB` string and re-validates it: this component is a
 * convenience, not the check. "No colour" is the empty string, which the action reads as null.
 *
 * ## The echo
 *
 * The inputs are uncontrolled and React 19 resets them when the action finishes. On a failed
 * validation `state.values` holds what was posted, and it becomes the `defaultValue` the reset
 * lands on, so a typo does not cost the planner the rest of the form.
 */
export type WeddingFormValues = {
  readonly coupleDisplayName: string
  readonly weddingDate: string
  readonly venue: string
  readonly headcount: string
  readonly notes: string
  readonly color: string | null
  readonly status: 'draft' | 'live' | 'archived'
}

export const BLANK_WEDDING: WeddingFormValues = {
  coupleDisplayName: '',
  weddingDate: '',
  venue: '',
  headcount: '',
  notes: '',
  color: null,
  status: 'draft',
}

const STATUSES = ['draft', 'live', 'archived'] as const

const TEXTAREA =
  'w-full rounded-[var(--radius)] border border-[var(--gn-input,var(--input))] bg-transparent px-3 py-2 text-base placeholder:opacity-70 hover:border-foreground'

export function WeddingForm({
  mode,
  action,
  initial,
  labels,
  cancelHref,
}: {
  mode: 'create' | 'edit'
  action: (prev: FormState, formData: FormData) => Promise<FormState>
  initial: WeddingFormValues
  labels: WeddingFormLabels
  cancelHref?: string
}) {
  const [state, submit, pending] = useActionState(action, EMPTY_FORM_STATE)
  const [color, setColor] = useState<string | null>(initial.color)
  const id = useId()
  const v = (key: keyof WeddingFormValues) => {
    const posted = state.values?.[key]
    return posted ?? String(initial[key] ?? '')
  }
  const err = (field: string) => {
    const code = state.errors?.[field]
    return code ? labels.errors[code] : undefined
  }
  const fieldProps = (field: string) => ({
    id: `${id}-${field}`,
    name: field,
    errorId: `${id}-${field}-err`,
    invalid: err(field) !== undefined,
  })
  const fieldError = (field: string) => {
    const message = err(field)
    return message ? <InlineError id={`${id}-${field}-err`}>{message}</InlineError> : null
  }
  const status = (state.values?.status ?? initial.status) as WeddingFormValues['status']

  return (
    <form action={submit} noValidate className="flex max-w-3xl flex-col gap-4">
      <Card as="section" className="px-[18px] py-4">
        <h2 className="mb-3.5 text-[14.5px] font-semibold tracking-tight">
          {labels.sectionWedding}
        </h2>
        <div className="grid gap-3.5 sm:grid-cols-[1fr_11rem]">
          <div>
            <Field
              {...fieldProps('coupleDisplayName')}
              label={labels.couple}
              placeholder={labels.couplePlaceholder}
              defaultValue={v('coupleDisplayName')}
              maxLength={200}
              autoComplete="off"
            />
            {fieldError('coupleDisplayName')}
          </div>
          <div>
            <Field
              {...fieldProps('weddingDate')}
              type="date"
              label={labels.date}
              defaultValue={v('weddingDate')}
            />
            {fieldError('weddingDate')}
          </div>
          <div>
            <Field
              {...fieldProps('venue')}
              label={labels.venue}
              placeholder={labels.venuePlaceholder}
              defaultValue={v('venue')}
              autoComplete="off"
            />
            {fieldError('venue')}
          </div>
          <div>
            <Field
              {...fieldProps('headcount')}
              type="number"
              inputMode="numeric"
              min={0}
              max={100000}
              step={1}
              label={labels.guests}
              defaultValue={v('headcount')}
            />
            {fieldError('headcount')}
          </div>
        </div>
        <p className="text-muted-foreground mt-3 text-xs">{labels.dateHint}</p>

        <fieldset className="m-0 mt-4 min-w-0 border-0 p-0">
          <legend className="mb-1.5 p-0 text-sm font-medium">{labels.stage}</legend>
          <div className="flex flex-wrap gap-2">
            {STATUSES.map((s) => (
              <label key={s} className="relative inline-flex cursor-pointer">
                <input
                  type="radio"
                  name="status"
                  value={s}
                  defaultChecked={status === s}
                  className="peer sr-only"
                />
                <span
                  className={cx(
                    'border-input inline-flex h-9 items-center rounded-full border px-3.5 text-sm',
                    'peer-checked:border-foreground peer-checked:bg-muted peer-checked:font-medium',
                    'peer-focus-visible:outline-ring peer-focus-visible:outline-2',
                  )}
                >
                  {labels.statuses[s]}
                </span>
              </label>
            ))}
          </div>
          {fieldError('status')}
        </fieldset>

        {mode === 'edit' ? (
          <div className="mt-4">
            <label htmlFor={`${id}-notes`} className="mb-1.5 block text-sm font-medium">
              {labels.notes}
            </label>
            <textarea
              id={`${id}-notes`}
              name="notes"
              rows={4}
              defaultValue={v('notes')}
              placeholder={labels.notesPlaceholder}
              aria-describedby={`${id}-notes-hint`}
              className={TEXTAREA}
            />
            <p id={`${id}-notes-hint`} className="text-muted-foreground mt-1.5 text-xs">
              {labels.notesHint}
            </p>
            {fieldError('notes')}
          </div>
        ) : null}
      </Card>

      <Card as="section" className="px-[18px] py-4">
        <h2 className="text-[14.5px] font-semibold tracking-tight">{labels.sectionColour}</h2>
        <p className="text-muted-foreground mt-0.5 mb-3 text-xs">{labels.colourHint}</p>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
          <ColorPicker
            label={labels.colourGroup}
            customLabel={labels.colourCustom}
            value={color}
            onChange={setColor}
            swatchLabel={(hex) => labels.colours[hex] ?? hex}
          />
          {color === null ? null : (
            <button
              type="button"
              onClick={() => setColor(null)}
              className="text-muted-foreground hover:text-foreground cursor-pointer text-xs underline underline-offset-[3px]"
            >
              {labels.colourNone}
            </button>
          )}
        </div>
        <input type="hidden" name="color" value={color ?? ''} />
        {fieldError('color')}
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <div className="w-48">
          <Button type="submit" busy={pending} busyLabel={labels.saving}>
            {labels.submit}
          </Button>
        </div>
        {cancelHref ? (
          <Link
            href={cancelHref}
            className="text-muted-foreground hover:text-foreground text-sm underline underline-offset-[3px]"
          >
            {labels.cancel}
          </Link>
        ) : null}
        {state.notice === 'saved' ? (
          <p role="status" className="text-muted-foreground text-sm">
            {labels.saved}
          </p>
        ) : null}
      </div>
      {state.form ? <InlineError>{labels.errors[state.form]}</InlineError> : null}
    </form>
  )
}
