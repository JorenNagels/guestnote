'use client'

import { Button } from '@guestnote/ui/button'
import { Card } from '@guestnote/ui/card'
import { Field } from '@guestnote/ui/field'
import { InlineError } from '@guestnote/ui/inline-error'
import { LiveRegion } from '@guestnote/ui/live-region'
import { type FormEvent, useId, useRef, useState, useTransition } from 'react'
import type { InviteOutcome } from '../../lib/staff-invite.ts'

export type InviteFormCopy = {
  readonly title: string
  readonly hint: string
  readonly email: string
  readonly emailPlaceholder: string
  readonly role: string
  readonly roleAdmin: string
  readonly roleMember: string
  readonly roleAdminHint: string
  readonly roleMemberHint: string
  readonly send: string
  readonly sending: string
  /** Contains `{email}`. */
  readonly sent: string
  readonly errors: Readonly<Record<Exclude<InviteOutcome, { ok: true }>['reason'], string>>
}

/**
 * The invite form. The action arrives as a prop, not an import, so the component is tested
 * without a server and the page stays the one place that names the Server Function.
 *
 * Errors are shown under the field that caused them and the success line is also announced
 * through a live region that is in the DOM from first paint (see `LiveRegion`). The email
 * field is cleared only on success, so a typo after a refusal is one edit away.
 */
export function InviteForm({
  copy,
  invite,
}: {
  copy: InviteFormCopy
  invite: (input: { email: string; role: string }) => Promise<InviteOutcome>
}) {
  const id = useId()
  const emailRef = useRef<HTMLInputElement>(null)
  const [role, setRole] = useState<'admin' | 'member'>('member')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState('')
  const [pending, start] = useTransition()

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const email = emailRef.current?.value.trim() ?? ''
    setError(null)
    setDone('')
    start(async () => {
      const outcome = await invite({ email, role })
      if (outcome.ok) {
        setDone(copy.sent.replace('{email}', email))
        if (emailRef.current) emailRef.current.value = ''
        return
      }
      setError(copy.errors[outcome.reason])
      emailRef.current?.focus()
    })
  }

  const errorId = `${id}-error`

  return (
    <Card as="section" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="text-base font-semibold">
        {copy.title}
      </h2>
      <p className="text-muted-foreground mt-1 text-sm leading-relaxed">{copy.hint}</p>

      <form onSubmit={submit} noValidate className="mt-4 space-y-4">
        <div>
          <Field
            ref={emailRef}
            id={`${id}-email`}
            name="email"
            type="email"
            autoComplete="off"
            label={copy.email}
            placeholder={copy.emailPlaceholder}
            invalid={error !== null}
            errorId={errorId}
            required
          />
          {error !== null ? <InlineError id={errorId}>{error}</InlineError> : null}
        </div>

        <div>
          <label htmlFor={`${id}-role`} className="mb-1.5 block text-sm font-medium">
            {copy.role}
          </label>
          <select
            id={`${id}-role`}
            name="role"
            value={role}
            onChange={(e) => setRole(e.target.value === 'admin' ? 'admin' : 'member')}
            aria-describedby={`${id}-role-hint`}
            className="border-input bg-card h-11 w-full rounded-[var(--radius)] border px-3 text-base"
          >
            <option value="member">{copy.roleMember}</option>
            <option value="admin">{copy.roleAdmin}</option>
          </select>
          <p
            id={`${id}-role-hint`}
            className="text-muted-foreground mt-1.5 text-xs leading-relaxed"
          >
            {role === 'admin' ? copy.roleAdminHint : copy.roleMemberHint}
          </p>
        </div>

        <Button type="submit" busy={pending} busyLabel={copy.sending}>
          {copy.send}
        </Button>
      </form>

      {done !== '' ? (
        <p className="text-foreground mt-3 text-sm" data-testid="invite-sent">
          {done}
        </p>
      ) : null}
      <LiveRegion message={done} />
    </Card>
  )
}
