'use client'

import { Button } from '@guestnote/ui/button'
import { InlineError } from '@guestnote/ui/inline-error'
import { useTranslations } from 'next-intl'
import { useId, useRef, useState, useTransition } from 'react'
import { createTaskAction } from '../../app/pro/(app)/weddings/[id]/tasks/actions.ts'
import { EMPTY_FORM, type TaskFormValues, TITLE_MAX } from '../../lib/task-form.ts'

/**
 * The date chips under the line: no date, or so many days before the main day (spec 0009 B1).
 * Strings because they go straight into `offsetDays`, which holds what a planner would have typed.
 * 90, 30 and 7 are the report's three: the stretches a wedding checklist is planned in.
 */
export const QUICK_CHIPS = ['none', '90', '30', '7'] as const
export type QuickChip = (typeof QUICK_CHIPS)[number]

/**
 * The full form's values for a quick add: `EMPTY_FORM` plus the title and the chip, so a quick
 * task is exactly what the full form would have saved with nothing else touched -- and "Meer
 * opties…" can hand the same values to the full form to carry on from.
 */
export function quickAddValues(title: string, chip: QuickChip): TaskFormValues {
  return chip === 'none'
    ? { ...EMPTY_FORM, title }
    : { ...EMPTY_FORM, title, dueKind: 'offset', offsetDays: chip, offsetDirection: 'before' }
}

type Failure = { error: string; title: string; restored: boolean }

/**
 * One line at the top of the checklist: type, Enter, next (spec 0009 B1). The competitor is a
 * spreadsheet row, so adding a task costs one line of typing and no form.
 *
 * ## The line clears before the server answers
 *
 * A planner dumping a list types the next title while the first is still saving. So the input is
 * never disabled and is emptied at once, and each Enter is its own call; React keeps the
 * transition pending until the last one lands. Rejected: clearing on success, which leaves the
 * first title in the box under the second one's first keystrokes.
 *
 * The cost is the error path. A refused title is put back only when the line is still empty, so
 * nothing the planner has typed since is overwritten; otherwise the error names the title that
 * did not go in, and they can type it again. The chip is sticky: ten tasks at -30 d is one click.
 *
 * The new task appears through the action's own `revalidatePath`, like the full form's: the
 * Server Function's response carries the refreshed page, so a `router.refresh()` here would be a
 * second request for the same payload.
 */
export function QuickAdd({
  weddingId,
  initialTitle = '',
  onMore,
}: {
  weddingId: string
  /** What the line held when "Meer opties…" was cancelled, so the typing is not lost. */
  initialTitle?: string
  /** Opens the full form with what is on the line. */
  onMore: (initial: TaskFormValues) => void
}) {
  const t = useTranslations('app.tasks')
  const uid = useId()
  const input = useRef<HTMLInputElement>(null)
  const [draft, setDraftState] = useState(initialTitle)
  // The async error path reads the line as it is THEN, not as it was when that Enter was pressed.
  const draftNow = useRef(initialTitle)
  const setDraft = (value: string) => {
    draftNow.current = value
    setDraftState(value)
  }
  const [chip, setChip] = useState<QuickChip>('none')
  const [failure, setFailure] = useState<Failure | null>(null)
  const [pending, startTransition] = useTransition()
  const errorId = `${uid}-error`

  function submit(event: React.FormEvent) {
    event.preventDefault()
    const typed = draft
    const title = typed.trim()
    // Enter on an empty line is a no-op, not a "give it a title" error: it is what a planner does
    // when they are finished, and a refusal there would be noise.
    if (title.length === 0) return
    const values = quickAddValues(title, chip)
    setDraft('')
    setFailure(null)
    input.current?.focus()
    startTransition(async () => {
      const result = await createTaskAction(weddingId, values)
      if (result.ok) return
      const restored = draftNow.current === ''
      if (restored) setDraft(typed)
      setFailure({ error: result.error, title, restored })
    })
  }

  return (
    <form
      onSubmit={submit}
      aria-label={t('quickAdd.label')}
      className="border-border bg-card mb-4 rounded-[var(--radius-container)] border px-3 py-2.5"
    >
      <div className="flex items-center gap-2">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          aria-hidden="true"
          className="text-muted-foreground size-4 flex-none"
        >
          <path d="M12 5v14M5 12h14" />
        </svg>
        <label htmlFor={`${uid}-title`} className="sr-only">
          {t('quickAdd.label')}
        </label>
        <input
          ref={input}
          id={`${uid}-title`}
          value={draft}
          maxLength={TITLE_MAX}
          placeholder={t('quickAdd.placeholder')}
          autoComplete="off"
          enterKeyHint="enter"
          onChange={(e) => setDraft(e.target.value)}
          aria-invalid={failure ? true : undefined}
          aria-describedby={failure ? errorId : undefined}
          className="placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent py-1 text-base outline-none"
        />
        <span aria-live="polite" className="text-muted-foreground flex-none text-xs">
          {pending ? t('quickAdd.adding') : ''}
        </span>
        <Button
          type="submit"
          variant="secondary"
          disabled={draft.trim().length === 0}
          className="h-8! w-auto! rounded-full px-3.5! text-[0.78rem]"
        >
          {t('quickAdd.add')}
        </Button>
      </div>

      {failure && (
        <InlineError id={errorId}>
          {failure.restored
            ? t(`errors.${failure.error}`)
            : `${t('quickAdd.notAdded', { title: failure.title })} ${t(`errors.${failure.error}`)}`}
        </InlineError>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-6">
        <fieldset className="contents">
          <legend className="sr-only">{t('quickAdd.dueLegend')}</legend>
          {QUICK_CHIPS.map((c) => (
            <label
              key={c}
              className="border-input has-[:checked]:border-primary has-[:checked]:bg-primary has-[:checked]:text-primary-foreground has-[:focus-visible]:ring-ring inline-flex h-7 cursor-pointer items-center rounded-full border px-2.5 font-mono text-[0.72rem] tabular-nums has-[:focus-visible]:ring-2"
            >
              {/* Native radios, as the full form's pills: arrow keys and the checked state come
                  from the browser. */}
              <input
                type="radio"
                name={`${uid}-due`}
                value={c}
                checked={chip === c}
                onChange={() => setChip(c)}
                className="sr-only"
              />
              {c === 'none' ? (
                <span className="font-sans">{t('quickAdd.none')}</span>
              ) : (
                <>
                  {/* "−30 d" is how a planner writes it; a screen reader gets the words. */}
                  <span aria-hidden="true">{t('quickAdd.chip', { days: c })}</span>
                  <span className="sr-only">{t('quickAdd.chipLabel', { days: c })}</span>
                </>
              )}
            </label>
          ))}
        </fieldset>
        <button
          type="button"
          onClick={() => onMore(quickAddValues(draft.trim(), chip))}
          className="text-muted-foreground hover:text-foreground ml-1 cursor-pointer text-[0.78rem] underline underline-offset-[3px]"
        >
          {t('quickAdd.more')}
        </button>
      </div>
    </form>
  )
}
