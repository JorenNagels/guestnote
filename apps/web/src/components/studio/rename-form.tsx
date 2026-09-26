'use client'

import { Button } from '@guestnote/ui/button'
import { Field } from '@guestnote/ui/field'
import { InlineError } from '@guestnote/ui/inline-error'
import { LiveRegion } from '@guestnote/ui/live-region'
import { type FormEvent, startTransition, useActionState, useState } from 'react'
import { STUDIO_NAME_MAX } from '../signup/state.ts'

/** What `renameStudioAction` hands back: a code, never a sentence, and the value it saw. */
export type RenameState = {
  readonly error?: 'required' | 'tooLong' | 'failed'
  readonly saved?: boolean
  readonly value?: string
}

export type RenameLabels = Readonly<{
  label: string
  save: string
  saving: string
  saved: string
  errors: Readonly<Record<NonNullable<RenameState['error']>, string>>
}>

/**
 * The Studio page's rename. Controlled and posted from `onSubmit`, like sign-up's Studio step,
 * because React 19 resets a form after its action runs and the field would snap back to the
 * old name for the length of the request. "Saved" is announced and shown until the next edit.
 */
export function RenameForm({
  initialName,
  labels,
  action,
}: {
  initialName: string
  labels: RenameLabels
  action: (prev: RenameState, fd: FormData) => Promise<RenameState>
}) {
  const [state, dispatch, pending] = useActionState(action, {})
  const [name, setName] = useState(initialName)
  const [edited, setEdited] = useState(false)
  const unchanged = name.trim() === initialName.trim()

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (pending) return
    setEdited(false)
    const fd = new FormData(e.currentTarget)
    startTransition(() => dispatch(fd))
  }

  const error = edited ? undefined : state.error
  const saved = !edited && state.saved === true

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3">
      <div>
        <Field
          id="studio-name"
          name="name"
          label={labels.label}
          autoComplete="organization"
          maxLength={STUDIO_NAME_MAX}
          value={name}
          onChange={(e) => {
            setName(e.currentTarget.value)
            setEdited(true)
          }}
          invalid={Boolean(error)}
          errorId="studio-name-error"
        />
        {error && <InlineError id="studio-name-error">{labels.errors[error]}</InlineError>}
      </div>
      <div className="flex items-center gap-3">
        {/* Wrapped so it sizes to its label: `Button` is `w-full` and `cx` does not merge. */}
        <div>
          <Button
            type="submit"
            className="px-5"
            disabled={unchanged && !error}
            busy={pending}
            busyLabel={labels.saving}
          >
            {labels.save}
          </Button>
        </div>
        {saved && <span className="text-muted-foreground text-xs">{labels.saved}</span>}
      </div>
      <LiveRegion message={saved ? labels.saved : ''} />
    </form>
  )
}
