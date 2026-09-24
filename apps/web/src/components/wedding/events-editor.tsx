'use client'

import type { WeddingEvent } from '@guestnote/db'
import { Button } from '@guestnote/ui/button'
import { Card } from '@guestnote/ui/card'
import { Field } from '@guestnote/ui/field'
import { InlineError } from '@guestnote/ui/inline-error'
import { useActionState, useId } from 'react'
import { EMPTY_FORM_STATE, type FormState } from '../../lib/wedding-form-state.ts'
import type { EventsLabels } from './labels.ts'

/**
 * The "Momenten" block of the settings page: one small form per event, and one blank at the
 * end. Each row is its own `<form>` with its own `useActionState`, so saving one row neither
 * resets nor blocks another, and an error sits under the field of the row it belongs to.
 *
 * The blank row is keyed by how many events there are. A successful add re-renders the page
 * with one more event, the key changes, and the blank row remounts empty -- without it the
 * typed values would still be sitting in the row that has just become a saved event's twin.
 *
 * Rejected: one form with every row and a single Save. A planner fixing one venue should not
 * send twelve rows, and a validation error in a row they did not touch should not stop them.
 */
type Action = (prev: FormState, formData: FormData) => Promise<FormState>

export function EventsEditor({
  action,
  events,
  anchored = {},
  labels,
}: {
  action: Action
  events: readonly WeddingEvent[]
  /** Live tasks counting from each event, by id (spec 0004). */
  anchored?: Readonly<Record<string, number>>
  labels: EventsLabels
}) {
  return (
    <Card as="section" className="px-[18px] py-4">
      <h2 className="text-[14.5px] font-semibold tracking-tight">{labels.title}</h2>
      <p className="text-muted-foreground mt-0.5 mb-3.5 max-w-prose text-xs">{labels.hint}</p>
      <div className="flex flex-col gap-3">
        {events.length === 0 ? (
          <p className="text-muted-foreground text-sm">{labels.empty}</p>
        ) : null}
        {events.map((e) => (
          <EventRow
            key={e.id}
            action={action}
            event={e}
            anchored={anchored[e.id] ?? 0}
            labels={labels}
          />
        ))}
        <EventRow
          key={`new-${events.length}`}
          action={action}
          event={null}
          anchored={0}
          labels={labels}
        />
      </div>
    </Card>
  )
}

function EventRow({
  action,
  event,
  anchored,
  labels,
}: {
  action: Action
  event: WeddingEvent | null
  anchored: number
  labels: EventsLabels
}) {
  const [state, submit, pending] = useActionState(action, EMPTY_FORM_STATE)
  const id = useId()
  const v = (key: 'label' | 'startsOn' | 'startsAt' | 'venue') =>
    state.values?.[key] ?? event?.[key] ?? ''
  const err = (field: string) => {
    const code = state.errors?.[field]
    return code ? labels.errors[code] : undefined
  }
  const props = (field: string) => ({
    id: `${id}-${field}`,
    name: field,
    errorId: `${id}-${field}-err`,
    invalid: err(field) !== undefined,
  })
  const fieldError = (field: string) => {
    const message = err(field)
    return message ? <InlineError id={`${id}-${field}-err`}>{message}</InlineError> : null
  }

  return (
    <form
      action={submit}
      noValidate
      className="border-border grid items-start gap-2.5 border-t pt-3 first:border-t-0 first:pt-0 sm:grid-cols-[minmax(9rem,2fr)_9.5rem_7rem_minmax(9rem,2fr)]"
    >
      <input type="hidden" name="eventId" value={event?.id ?? ''} />
      <div>
        <Field
          {...props('label')}
          label={labels.label}
          placeholder={labels.labelPlaceholder}
          defaultValue={v('label')}
          autoComplete="off"
        />
        {fieldError('label')}
      </div>
      <div>
        <Field
          {...props('startsOn')}
          type="date"
          label={labels.date}
          defaultValue={v('startsOn')}
        />
        {fieldError('startsOn')}
      </div>
      <div>
        <Field
          {...props('startsAt')}
          type="time"
          label={labels.time}
          defaultValue={v('startsAt')}
        />
        {fieldError('startsAt')}
      </div>
      <div>
        <Field
          {...props('venue')}
          label={labels.venue}
          defaultValue={v('venue')}
          autoComplete="off"
        />
        {fieldError('venue')}
      </div>
      <div className="flex flex-wrap items-center gap-2.5 sm:col-span-4">
        <div className="w-36">
          <Button
            type="submit"
            name="intent"
            value="save"
            variant={event ? 'secondary' : 'primary'}
            busy={pending}
            busyLabel={labels.saving}
          >
            {event ? labels.save : labels.add}
          </Button>
        </div>
        {event ? (
          <div className="w-32">
            <Button
              type="submit"
              name="intent"
              value="remove"
              variant="secondary"
              disabled={pending}
            >
              {labels.remove}
            </Button>
          </div>
        ) : null}
        {/* Said before the click, not after: Remove has no confirm step, and what it does to
            these tasks (they fall back to the main day) is not visible from this page. */}
        {event && anchored > 0 ? (
          <p className="text-muted-foreground text-xs">
            {anchored === 1
              ? labels.anchoredOne
              : labels.anchoredOther.replace('{count}', String(anchored))}
          </p>
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
