'use client'

import { InlineError } from '@guestnote/ui/inline-error'
import { useTranslations } from 'next-intl'
import { type ReactNode, useEffect, useId, useRef, useState, useTransition } from 'react'
import type { MoneyError } from '../../lib/money-types.ts'

/**
 * One amount on a budget line, edited where it stands (spec 0009 B3): a button showing the
 * amount, which becomes an input. Enter or leaving the field saves, Escape puts the button back
 * without saving. The planner's competitor is a spreadsheet, where a cell is typed into, not
 * opened in a side sheet -- the sheet still edits everything else on the line.
 *
 * The draft is text, like the sheet's, and `save` hands it to the server untouched, so the
 * server's `parseCents` stays the only reading of "1.234,50". A refused value keeps the input,
 * the draft and the error under it; only a success or Escape closes it.
 *
 * Rejected: a `contentEditable` cell. It has no `value`, no `inputMode="decimal"` for a phone's
 * keypad, and a screen reader does not announce it as a field.
 */
export function InlineAmount({
  buttonLabel,
  inputLabel,
  initial,
  save,
  children,
}: {
  /** The button's accessible name, e.g. "Change the allocated amount of Castle". */
  buttonLabel: string
  /** The input's accessible name, e.g. "Allocated amount of Castle". */
  inputLabel: string
  /** The saved value, formatted for typing (`centsToInput`), or empty. */
  initial: string
  /** Resolves to `null` on success, or the key of the error to show. */
  save: (draft: string) => Promise<MoneyError | null>
  /** What the button shows: the formatted amount, or the "not yet" mark. */
  children: ReactNode
}) {
  const t = useTranslations('app.money.budget')
  const te = useTranslations('app.money.errors')
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(initial)
  const [error, setError] = useState<MoneyError | null>(null)
  const [pending, start] = useTransition()
  const errorId = useId()
  const valueId = useId()
  const buttonRef = useRef<HTMLButtonElement>(null)
  // Refs, not state, because both are read inside the same event that sets them. `settled`
  // stops the blur that follows Enter or Escape (or the input unmounting) from saving a second
  // time, or saving what Escape just threw away; `refocus` puts the keyboard back on the button
  // only when the keyboard ended the edit -- a blur means the planner already went elsewhere.
  const settled = useRef(false)
  const refocus = useRef(false)

  useEffect(() => {
    if (!editing && refocus.current) {
      refocus.current = false
      buttonRef.current?.focus()
    }
  }, [editing])

  const open = () => {
    settled.current = false
    setDraft(initial)
    setError(null)
    setEditing(true)
  }

  const cancel = () => {
    settled.current = true
    refocus.current = true
    setError(null)
    setEditing(false)
  }

  const commit = (fromKeyboard: boolean) => {
    if (settled.current) return
    // Unchanged is not a write: tabbing through a row of amounts should not save each one.
    // Trimmed, because the server trims too, and " 12,50" is not a different amount.
    if (draft.trim() === initial.trim()) {
      cancel()
      refocus.current = fromKeyboard
      return
    }
    settled.current = true
    setError(null)
    start(async () => {
      const refused = await save(draft)
      if (refused === null) {
        refocus.current = fromKeyboard
        setEditing(false)
      } else {
        // Open again for the next Enter or blur: the draft is still the planner's to fix.
        settled.current = false
        setError(refused)
      }
    })
  }

  if (!editing) {
    return (
      <button
        ref={buttonRef}
        type="button"
        aria-label={buttonLabel}
        // The name says what the button does; the description carries the amount it shows, which
        // the label would otherwise hide from a screen reader. Rejected: the amount inside the name,
        // which makes every button in a column a different, long string to find by voice.
        aria-describedby={valueId}
        onClick={open}
        className="cursor-pointer rounded-[var(--radius)] px-1 underline-offset-2 hover:underline"
      >
        <span id={valueId}>{children}</span>
      </button>
    )
  }

  return (
    <div className="flex flex-col items-end">
      <input
        aria-label={inputLabel}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            commit(true)
          } else if (e.key === 'Escape') {
            e.preventDefault()
            cancel()
          }
        }}
        onBlur={() => commit(false)}
        // `readOnly` while saving, not `disabled`: disabling the focused input blurs it, and the
        // blur would be a second save of the same draft.
        readOnly={pending}
        aria-busy={pending || undefined}
        aria-invalid={error !== null || undefined}
        aria-describedby={error !== null ? errorId : undefined}
        inputMode="decimal"
        autoComplete="off"
        // biome-ignore lint/a11y/noAutofocus: the planner just clicked the amount to type it
        autoFocus
        onFocus={(e) => e.target.select()}
        className={[
          'h-8 w-28 rounded-[var(--radius)] border bg-transparent px-2 text-right font-mono text-[12.5px] tabular-nums',
          error !== null ? 'border-destructive' : 'border-input',
          pending ? 'opacity-70' : '',
        ].join(' ')}
      />
      {pending && (
        <span role="status" className="text-muted-foreground mt-1 text-[11px]">
          {t('savingAmount')}
        </span>
      )}
      {error !== null && (
        <div className="max-w-60 text-left">
          <InlineError id={errorId}>{te(error)}</InlineError>
        </div>
      )}
    </div>
  )
}
