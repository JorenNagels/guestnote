'use client'

import { Button } from '@guestnote/ui/button'
import { Field } from '@guestnote/ui/field'
import { InlineError } from '@guestnote/ui/inline-error'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useActionState, useEffect, useId, useRef, useState, useTransition } from 'react'
import { saveEventAction } from '../../app/pro/(app)/weddings/[id]/settings/actions.ts'
import { formatCivilDay } from '../../lib/civil-date.ts'
import { app } from '../../lib/routes.ts'
import { EMPTY_FORM_STATE, echoValues, type FormState } from '../../lib/wedding-form-state.ts'

/**
 * Spec 0009 A2: the run sheet makes its own days, through the same Server Function the settings
 * page's events editor posts to (`saveEventAction`), so the membership check, the trial lock, the
 * parsing and the parent read are the ones settings already has. Rejected: a run-sheet-only
 * action around `createWeddingEvent`, which would be a second copy of those checks to keep true.
 *
 * Both land on the day they made, by its id in the URL. `revalidatePath` in the action re-renders
 * the page either way, but on a wedding with days already the page would re-render on the day it
 * was showing, and "I added Sunday and I am still looking at Saturday" reads as "it did not work".
 */

/** The post the events editor's blank row makes, built here for a form the planner never sees. */
function eventForm(values: { label: string; startsOn: string }): FormData {
  const fd = new FormData()
  fd.set('eventId', '')
  fd.set('intent', 'save')
  fd.set('label', values.label)
  fd.set('startsOn', values.startsOn)
  fd.set('startsAt', '')
  fd.set('venue', '')
  return fd
}

/**
 * The one-click start: a day named after the main day, on `weddings.wedding_date`. The label is
 * the page's, already in the wedding's language; this component only formats the date for the
 * planner reading the button.
 */
export function StartRunSheet({
  weddingId,
  locale,
  label,
  date,
}: {
  weddingId: string
  locale: string
  label: string
  /** `YYYY-MM-DD`, the wedding's main day. */
  date: string
}) {
  const ev = useTranslations('app.runSheet.event.noEvents')
  const router = useRouter()
  const [failed, setFailed] = useState(false)
  const [pending, start] = useTransition()

  const onStart = () => {
    setFailed(false)
    start(async () => {
      try {
        const result = await saveEventAction(
          weddingId,
          EMPTY_FORM_STATE,
          eventForm({ label, startsOn: date }),
        )
        if (result.eventId) router.push(`${app.weddingRunSheet(weddingId)}?event=${result.eventId}`)
        else setFailed(true)
      } catch {
        // The trial lock throws (`lib/trial.ts`); the banner says why, this says nothing changed.
        setFailed(true)
      }
    })
  }

  return (
    <>
      <div className="mt-4 w-fit min-w-56">
        <Button onClick={onStart} busy={pending} busyLabel={ev('starting')}>
          {ev('start', { day: formatCivilDay(locale, date) })}
        </Button>
      </div>
      {failed ? <InlineError>{ev('failed')}</InlineError> : null}
    </>
  )
}

type Code = 'required' | 'tooLong' | 'invalidDate' | 'invalidTime'
const CODES: readonly string[] = ['required', 'tooLong', 'invalidDate', 'invalidTime']

/**
 * Name, date and an optional time -- the three things a day needs before it can hold a run sheet.
 * The venue stays in settings: a day without one is still a day, and a fourth field is a fourth
 * Tab for a form that should be faster than a spreadsheet row.
 */
export function AddDayForm({
  id: formId,
  weddingId,
  onClose,
  focusOnOpen = false,
}: {
  /** The toggle's `aria-controls` target. */
  id?: string
  weddingId: string
  /**
   * Closes the form, on Cancel or once the day is saved. Absent when the form IS the empty state:
   * there is nothing to go back to, and the saved day replaces the whole card anyway.
   */
  onClose?: () => void
  /** True when a click opened it: the planner asked for a form, so the cursor goes there. */
  focusOnOpen?: boolean
}) {
  const t = useTranslations('app.runSheet.addDay')
  const router = useRouter()
  const id = useId()
  const nameRef = useRef<HTMLInputElement>(null)

  const [state, submit, pending] = useActionState(
    async (prev: FormState, fd: FormData): Promise<FormState> => {
      try {
        const next = await saveEventAction(weddingId, prev, fd)
        if (next.eventId) {
          router.push(`${app.weddingRunSheet(weddingId)}?event=${next.eventId}`)
          onClose?.()
        }
        return next
      } catch {
        return { form: 'failed', values: echoValues(fd, ['label', 'startsOn', 'startsAt']) }
      }
    },
    EMPTY_FORM_STATE,
  )

  useEffect(() => {
    if (focusOnOpen) nameRef.current?.focus()
  }, [focusOnOpen])

  const v = (key: 'label' | 'startsOn' | 'startsAt') => state.values?.[key] ?? ''
  const message = (field: string) => {
    const code = state.errors?.[field]
    if (!code) return undefined
    return CODES.includes(code) ? t(`errors.${code as Code}`) : t('errors.failed')
  }
  const props = (field: string) => ({
    id: `${id}-${field}`,
    name: field,
    errorId: `${id}-${field}-err`,
    invalid: message(field) !== undefined,
  })
  const fieldError = (field: string) => {
    const m = message(field)
    return m ? <InlineError id={`${id}-${field}-err`}>{m}</InlineError> : null
  }

  return (
    <form
      action={submit}
      noValidate
      aria-label={t('title')}
      id={formId}
      className="mt-4 grid max-w-xl items-start gap-2.5 sm:grid-cols-[minmax(9rem,2fr)_9.5rem_7rem]"
    >
      <input type="hidden" name="eventId" value="" />
      <input type="hidden" name="intent" value="save" />
      <div>
        <Field
          {...props('label')}
          ref={nameRef}
          label={t('label')}
          placeholder={t('labelPlaceholder')}
          defaultValue={v('label')}
          autoComplete="off"
        />
        {fieldError('label')}
      </div>
      <div>
        <Field {...props('startsOn')} type="date" label={t('date')} defaultValue={v('startsOn')} />
        {fieldError('startsOn')}
      </div>
      <div>
        <Field {...props('startsAt')} type="time" label={t('time')} defaultValue={v('startsAt')} />
        {fieldError('startsAt')}
      </div>
      <div className="flex flex-wrap items-center gap-2.5 sm:col-span-3">
        <div className="w-fit min-w-36">
          <Button type="submit" busy={pending} busyLabel={t('saving')}>
            {t('save')}
          </Button>
        </div>
        {onClose ? (
          <div className="w-fit min-w-28">
            <Button variant="secondary" onClick={onClose} disabled={pending}>
              {t('cancel')}
            </Button>
          </div>
        ) : null}
      </div>
      {state.form ? <InlineError>{t(`errors.${state.form}`)}</InlineError> : null}
    </form>
  )
}
