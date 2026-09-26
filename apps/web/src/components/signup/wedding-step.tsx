'use client'

import { Button } from '@guestnote/ui/button'
import { Field } from '@guestnote/ui/field'
import { InlineError } from '@guestnote/ui/inline-error'
import { type FormEvent, startTransition, useActionState, useState } from 'react'
import type { FormState } from '../../lib/wedding-form-state.ts'
import { MAX_COUPLE } from '../../lib/wedding-parse.ts'
import { fill } from '../auth/copy.ts'
import { StepLink } from './signup-frame.tsx'

export type WeddingLabels = Readonly<{
  title: string
  intro: string
  coupleLabel: string
  couplePlaceholder: string
  dateLabel: string
  planLabel: string
  /** template, `{count}` */
  tasks: string
  empty: string
  emptyHint: string
  create: string
  creating: string
  skip: string
  errors: Readonly<Record<'required' | 'tooLong' | 'invalidDate' | 'failed' | 'forbidden', string>>
}>

export type PlanOption = Readonly<{ id: string; name: string; itemCount: number }>

type Props = {
  readonly labels: WeddingLabels
  /** The studio's templates, starters first; the first is the default. */
  readonly plans: readonly PlanOption[]
  readonly skipHref: string
  readonly action: (prev: FormState, fd: FormData) => Promise<FormState>
}

const EMPTY = ''

/**
 * Sign-up step "First wedding" (spec 0005, step 5): the couple, the day if they know it, and
 * which plan to start the checklist from -- the studio's templates, which right after sign-up
 * are the three starters, plus "Start empty".
 *
 * Posted from `onSubmit` for the reason `studio-step.tsx` gives; the chosen plan and the typed
 * values survive a refused post because they live in state, not in the form.
 */
export function WeddingStep({ labels, plans, skipHref, action }: Props) {
  const [state, dispatch, pending] = useActionState(action, {})
  const [couple, setCouple] = useState('')
  const [date, setDate] = useState('')
  const [plan, setPlan] = useState(plans[0]?.id ?? EMPTY)

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (pending) return
    const fd = new FormData(e.currentTarget)
    startTransition(() => dispatch(fd))
  }

  const coupleError = state.errors?.coupleDisplayName
  const dateError = state.errors?.weddingDate
  const options: PlanOption[] = [...plans, { id: EMPTY, name: labels.empty, itemCount: 0 }]

  return (
    <>
      <h1 className="mb-1.5 text-2xl leading-tight font-semibold tracking-tight">{labels.title}</h1>
      <p className="mb-6 text-sm leading-relaxed text-muted-foreground">{labels.intro}</p>

      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <div>
          <Field
            id="signup-couple"
            name="coupleDisplayName"
            label={labels.coupleLabel}
            placeholder={labels.couplePlaceholder}
            maxLength={MAX_COUPLE}
            value={couple}
            onChange={(e) => setCouple(e.currentTarget.value)}
            invalid={Boolean(coupleError)}
            errorId="signup-couple-error"
          />
          {coupleError && (
            <InlineError id="signup-couple-error">
              {coupleError === 'tooLong' ? labels.errors.tooLong : labels.errors.required}
            </InlineError>
          )}
        </div>

        <div>
          <Field
            id="signup-date"
            name="weddingDate"
            type="date"
            label={labels.dateLabel}
            value={date}
            onChange={(e) => setDate(e.currentTarget.value)}
            invalid={Boolean(dateError)}
            errorId="signup-date-error"
          />
          {dateError && (
            <InlineError id="signup-date-error">{labels.errors.invalidDate}</InlineError>
          )}
        </div>

        <fieldset>
          <legend className="mb-1.5 text-sm font-medium">{labels.planLabel}</legend>
          <div className="flex flex-col gap-2">
            {options.map((o) => (
              // The report dialog's radio pattern: a real radio group, the dot visually hidden,
              // the whole row the target. Arrow keys still move between them.
              <label
                key={o.id || 'empty'}
                className="has-[:checked]:border-foreground has-[:checked]:bg-muted has-[:focus-visible]:outline-ring flex cursor-pointer items-baseline justify-between gap-3 rounded-[var(--radius)] border border-input px-3 py-2.5 text-sm outline-offset-2 has-[:focus-visible]:outline-2"
              >
                <input
                  className="sr-only"
                  type="radio"
                  name="template"
                  value={o.id}
                  checked={plan === o.id}
                  onChange={() => setPlan(o.id)}
                />
                <span className="min-w-0 font-medium">{o.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  {o.id === EMPTY ? labels.emptyHint : fill(labels.tasks, { count: o.itemCount })}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {state.form && <InlineError>{labels.errors[state.form]}</InlineError>}

        <Button
          type="submit"
          disabled={couple.trim() === ''}
          busy={pending}
          busyLabel={labels.creating}
        >
          {labels.create}
        </Button>
        <div className="text-center">
          <StepLink href={skipHref}>{labels.skip}</StepLink>
        </div>
      </form>
    </>
  )
}
