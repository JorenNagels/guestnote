'use client'

import { Button } from '@guestnote/ui/button'
import { cx } from '@guestnote/ui/cx'
import { Field } from '@guestnote/ui/field'
import { InlineError } from '@guestnote/ui/inline-error'
import { useTranslations } from 'next-intl'
import { useId, useState, useTransition } from 'react'
import { shiftRunSheetFrom } from '../../app/pro/(app)/weddings/[id]/run-sheet/actions.ts'
import {
  parseShiftMinutes,
  type RunSheetError,
  shiftCrossesPrevious,
  shiftPreview,
} from '../../lib/run-sheet.ts'
import { Hint } from '../money/form-bits.tsx'

/** The common slips, in the order a planner reaches for them (spec 0009 B2). */
const CHIPS = [-15, 5, 15, 30] as const

/** `−15` / `+5`: a real minus (U+2212), which `parseShiftMinutes` reads back. */
const signed = (n: number) => (n < 0 ? `−${-n}` : `+${n}`)

/**
 * "Schuif dit en alles erna op" (spec 0009 B2): the ceremony starts twenty minutes late, and the
 * planner moves the rest of the day in one go instead of editing every row after it.
 *
 * It is its own action and not a field of the item form: Save writes this row, a shift writes
 * this row's time and every later row's, and folding the two into one submit would make an
 * ordinary save of a title quietly move the evening. So it posts on its own button, outside the
 * form, and Enter in its field does nothing.
 *
 * The preview is computed from `items`, the event's list in reading order, with the same rule the
 * repo applies, so what is listed is what moves. After a shift the sheet stays open: the item form
 * may hold unsaved edits, and closing it would drop them silently. Rejected: closing the sheet, as
 * delete does -- a delete has nothing left to keep. Instead `onShifted` hands the new start time
 * back, so a Save after the shift does not write the old time over it.
 */
export function ShiftSection({
  weddingId,
  itemId,
  items,
  onShifted,
}: {
  weddingId: string
  itemId: string
  items: readonly { readonly id: string; readonly title: string; readonly startsAt: string }[]
  onShifted: (startsAt: string) => void
}) {
  const t = useTranslations('app.runSheet.shift')
  const te = useTranslations('app.runSheet.errors')
  const headingId = useId()
  const [text, setText] = useState('')
  const [error, setError] = useState<RunSheetError | null>(null)
  const [done, setDone] = useState<number | null>(null)
  const [pending, start] = useTransition()

  const delta = parseShiftMinutes(text)
  // The count is known before a delta is: it is "this and everything after", whatever the step.
  const count = shiftPreview(items, itemId, 0).length
  const preview = delta === null ? [] : shiftPreview(items, itemId, delta)
  // A backward shift past the item above is refused before the press, with the same rule the
  // repo applies; the preview stays on show, so the planner sees which time is the problem.
  const crosses = delta !== null && shiftCrossesPrevious(items, itemId, delta)
  const fieldError: RunSheetError | null =
    (text.trim() !== '' && delta === null) || error === 'shift'
      ? 'shift'
      : crosses || error === 'shiftCrosses'
        ? 'shiftCrosses'
        : null
  const invalid = fieldError !== null
  if (count === 0) return null

  const choose = (value: string) => {
    setText(value)
    setError(null)
    setDone(null)
  }

  const shift = () => {
    if (delta === null) return
    const to = preview[0]?.to
    setError(null)
    start(async () => {
      const result = await shiftRunSheetFrom(weddingId, itemId, delta)
      if (!result.ok) {
        // The draft stays, so a refused shift is retried with one tap and not retyped.
        setError(result.error)
        return
      }
      if (to) onShifted(to)
      setDone(preview.length)
      setText('')
    })
  }

  return (
    <section aria-labelledby={headingId} className="border-border mt-6 border-t pt-5">
      <h3 id={headingId} className="text-sm font-semibold">
        {t('title')}
      </h3>
      <p className="text-muted-foreground mt-1 mb-3 text-sm">{t('body')}</p>
      <div className="mb-3 flex flex-wrap gap-2">
        {CHIPS.map((n) => (
          <button
            key={n}
            type="button"
            aria-pressed={delta === n}
            onClick={() => choose(String(n))}
            className={cx(
              'inline-flex h-11 min-w-16 cursor-pointer items-center justify-center rounded-full border px-3.5 text-sm font-medium tabular-nums',
              'focus-visible:outline-ring outline-none focus-visible:outline-2',
              delta === n
                ? 'border-foreground bg-secondary-container text-on-secondary-container'
                : 'border-input hover:border-foreground',
            )}
          >
            {t('chip', { delta: signed(n) })}
          </button>
        ))}
      </div>
      <Field
        id="item-shift"
        label={t('custom')}
        value={text}
        onChange={(e) => choose(e.target.value)}
        autoComplete="off"
        invalid={invalid}
        errorId="item-shift-error"
      />
      <Hint id="item-shift-hint">{t('customHint')}</Hint>
      {fieldError && <InlineError id="item-shift-error">{te(fieldError)}</InlineError>}

      {preview.length > 0 && (
        <ul aria-label={t('preview')} className="mt-4 space-y-1.5 text-sm">
          {preview.map((row) => (
            <li key={row.id} className="flex items-baseline gap-3">
              <span className="sr-only">{t('row', row)}</span>
              <span aria-hidden="true" className="flex items-baseline gap-2 tabular-nums">
                <s className="text-muted-foreground">{row.from}</s>
                <span className="font-semibold">{row.to}</span>
              </span>
              <span aria-hidden="true" className="min-w-0 truncate">
                {row.title}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4">
        <Button
          variant="secondary"
          onClick={shift}
          disabled={delta === null || crosses}
          busy={pending}
          busyLabel={t('submitting')}
        >
          {t('submit', { count })}
        </Button>
      </div>
      {(error === 'notFound' || error === 'failed') && <InlineError>{te(error)}</InlineError>}
      {/* Always in the tree: a live region that mounts with its text is often not announced. */}
      <p role="status" className="text-muted-foreground mt-2 text-sm empty:hidden">
        {done === null ? null : t('done', { count: done })}
      </p>
    </section>
  )
}
