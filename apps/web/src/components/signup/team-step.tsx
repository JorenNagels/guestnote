'use client'

import { Button } from '@guestnote/ui/button'
import { Field } from '@guestnote/ui/field'
import { InlineError } from '@guestnote/ui/inline-error'
import { type FormEvent, startTransition, useActionState, useState } from 'react'
import type { InviteFailure } from '../../lib/staff-invite.ts'
import { fill } from '../auth/copy.ts'
import { StepLink } from './signup-frame.tsx'
import { TEAM_ROWS, type TeamFormState } from './state.ts'

export type TeamLabels = Readonly<{
  title: string
  intro: string
  /** One per row, the design's: "Planner's email", "Another planner", "And another". */
  emailLabels: readonly [string, string, string]
  emailPlaceholder: string
  note: string
  sendNone: string
  sendOne: string
  /** template, `{count}` */
  sendMany: string
  sending: string
  sent: string
  skip: string
  errors: Readonly<Record<InviteFailure | 'forbidden', string>>
}>

type Props = {
  readonly labels: TeamLabels
  readonly skipHref: string
  readonly action: (prev: TeamFormState, fd: FormData) => Promise<TeamFormState>
}

const LOOKS_LIKE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Sign-up step "Team" (spec 0005, step 6): three address rows, the button counting the ones
 * filled in. Blank rows are ignored; an address that is not one blocks the send with an error
 * on its own row, here first and on the server again.
 *
 * A row the server already invited is locked (`disabled`, so the browser does not post it
 * again) and says so, which keeps a retry after one failed mail from inviting the others twice.
 */
export function TeamStep({ labels, skipHref, action }: Props) {
  const [state, dispatch, pending] = useActionState(action, {})
  const [rows, setRows] = useState<string[]>(() => Array.from({ length: TEAM_ROWS }, () => ''))
  const [localErrors, setLocalErrors] = useState<Readonly<Record<number, InviteFailure>>>({})
  const sent = new Set(state.sent ?? [])
  const filled = rows.filter((r, i) => r.trim() !== '' && !sent.has(i)).length

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (pending || filled === 0) return
    const errors: Record<number, InviteFailure> = {}
    rows.forEach((r, i) => {
      if (!sent.has(i) && r.trim() !== '' && !LOOKS_LIKE_EMAIL.test(r.trim())) {
        errors[i] = 'invalidEmail'
      }
    })
    setLocalErrors(errors)
    if (Object.keys(errors).length > 0) return
    const fd = new FormData(e.currentTarget)
    startTransition(() => dispatch(fd))
  }

  const errorFor = (i: number): InviteFailure | undefined => localErrors[i] ?? state.errors?.[i]

  return (
    <>
      <h1 className="mb-1.5 text-2xl leading-tight font-semibold tracking-[-0.015em]">
        {labels.title}
      </h1>
      <p className="mb-[22px] text-sm leading-[1.55] text-muted-foreground">{labels.intro}</p>

      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3.5">
        {rows.map((value, i) => {
          const error = sent.has(i) ? undefined : errorFor(i)
          const id = `signup-team-${i}`
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: three fixed rows; the index IS the row.
            <div key={i}>
              <Field
                id={id}
                name={`email${i}`}
                type="email"
                inputMode="email"
                autoComplete="off"
                label={labels.emailLabels[i] ?? labels.emailLabels[0]}
                placeholder={labels.emailPlaceholder}
                value={value}
                disabled={sent.has(i)}
                onChange={(e) => {
                  const next = e.currentTarget.value
                  setRows((prev) => prev.map((r, j) => (j === i ? next : r)))
                }}
                invalid={Boolean(error)}
                errorId={`${id}-error`}
              />
              {sent.has(i) && <p className="mt-1.5 text-xs text-muted-foreground">{labels.sent}</p>}
              {error && <InlineError id={`${id}-error`}>{labels.errors[error]}</InlineError>}
            </div>
          )
        })}

        <p className="text-xs leading-relaxed text-muted-foreground">{labels.note}</p>

        {state.form && <InlineError>{labels.errors[state.form]}</InlineError>}

        <Button type="submit" disabled={filled === 0} busy={pending} busyLabel={labels.sending}>
          {filled === 0
            ? labels.sendNone
            : filled === 1
              ? labels.sendOne
              : fill(labels.sendMany, { count: filled })}
        </Button>
        <div className="text-center">
          <StepLink href={skipHref}>{labels.skip}</StepLink>
        </div>
      </form>
    </>
  )
}
