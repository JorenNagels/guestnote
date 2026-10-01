'use client'

import { Button } from '@guestnote/ui/button'
import { Card } from '@guestnote/ui/card'
import { Field } from '@guestnote/ui/field'
import { InlineError } from '@guestnote/ui/inline-error'
import { LiveRegion } from '@guestnote/ui/live-region'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { type FormEvent, useId, useRef, useState, useTransition } from 'react'
import type { InviteCoupleOutcome } from '../../app/pro/(app)/weddings/[id]/couple/actions.ts'
import type { CoupleInviteResult } from '../../lib/couple-invite.ts'

export type InviteCardCopy = {
  readonly title: string
  readonly body: string
  readonly partner1: string
  readonly partner2: string
  /** Already formatted with the count. */
  readonly sharedCount: string
  readonly send: string
  readonly sending: string
  readonly sent: string
  readonly resend: string
  /** `{date}` */
  readonly invitedOn: string
  readonly expired: string
  readonly mailFailed: string
  readonly errEmail: string
  readonly errSame: string
  /** `{email}` in each of the three below. */
  readonly errStaff: string
  readonly errExists: string
  readonly errPartner: string
  readonly errForbidden: string
  readonly errFull: string
  readonly errGeneric: string
}

export type PendingInvite = {
  readonly id: string
  readonly email: string
  /** Pre-formatted in the planner's locale. */
  readonly sentOn: string
  readonly expired: boolean
}

/**
 * The overview's "Koppel uitnodigen" card (spec 0008), shown while no partner has accepted. Two
 * addresses, the second optional; each partner gets their own invitation. Above the button, the
 * number of shared tasks the couple will see -- the one mitigation spec 0008 chose for keeping
 * `tasks.visibility`'s `shared` default: the planner reads it before pressing send.
 *
 * Actions arrive as props, as in `team/invite-form.tsx`, so this is tested without a server.
 */
export function InviteCard({
  copy,
  tasksHref,
  pending,
  slots = 2,
  invite,
  resend,
}: {
  copy: InviteCardCopy
  tasksHref: string
  pending: readonly PendingInvite[]
  /**
   * Partner fields to offer: two, less whoever already has access or a live invite (spec 0008,
   * two partners). None hides the form and leaves the pending list.
   */
  slots?: number
  invite: (emails: string[]) => Promise<InviteCoupleOutcome>
  resend: (invitationId: string) => Promise<CoupleInviteResult | null>
}) {
  const id = useId()
  const router = useRouter()
  const first = useRef<HTMLInputElement>(null)
  const second = useRef<HTMLInputElement>(null)
  const [errors, setErrors] = useState<readonly [string | null, string | null]>([null, null])
  const [done, setDone] = useState('')
  const [busy, start] = useTransition()
  const [resending, setResending] = useState<string | null>(null)
  const [resendError, setResendError] = useState<Readonly<Record<string, string>>>({})

  const refusal = (r: Extract<CoupleInviteResult, { ok: false }>) => {
    switch (r.reason) {
      case 'alreadyStaff':
        return copy.errStaff.replace('{email}', r.email)
      case 'duplicate':
        return copy.errExists.replace('{email}', r.email)
      case 'alreadyPartner':
        return copy.errPartner.replace('{email}', r.email)
      case 'full':
        return copy.errFull
      case 'forbidden':
      case 'notFound':
        return copy.errForbidden
      case 'mailFailed':
        return copy.mailFailed
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const values = [first.current?.value ?? '', second.current?.value ?? '']
    setErrors([null, null])
    setDone('')
    start(async () => {
      const out = await invite(values)
      if (!out.ok) {
        const msg =
          out.reason === 'sameEmail'
            ? copy.errSame
            : out.reason === 'forbidden'
              ? copy.errForbidden
              : copy.errEmail
        const at = out.index === 1 ? 1 : 0
        setErrors(at === 1 ? [null, msg] : [msg, null])
        ;(at === 1 ? second : first).current?.focus()
        return
      }
      // Results come back in the order the non-blank fields were given; place each under the
      // field it came from, and clear a field whose invite went out (a failed mail still left a
      // pending invite, which the list below now shows with its resend).
      const filled = values.map((v) => v.trim() !== '')
      const next: [string | null, string | null] = [null, null]
      let k = 0
      for (let i = 0; i < 2; i++) {
        if (!filled[i]) continue
        const r = out.results[k++]
        if (!r) continue
        const ref = i === 0 ? first : second
        if (r.ok) {
          if (ref.current) ref.current.value = ''
        } else {
          next[i] = refusal(r)
          if (r.reason === 'mailFailed' && ref.current) ref.current.value = ''
        }
      }
      setErrors(next)
      if (out.results.some((r) => r.ok)) setDone(copy.sent)
      router.refresh()
    })
  }

  async function again(invitationId: string) {
    setResending(invitationId)
    // A throw (the trial guard, a dropped connection) is a refusal like any other, and the
    // button must stop spinning either way.
    const r = await resend(invitationId)
      .catch(() => null)
      .finally(() => setResending(null))
    setResendError((e) => ({
      ...e,
      [invitationId]: r === null ? copy.errGeneric : r.ok ? '' : refusal(r),
    }))
    if (r?.ok) {
      setDone(copy.sent)
      router.refresh()
    }
  }

  return (
    <Card as="section" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="text-[15px] font-semibold tracking-tight">
        {copy.title}
      </h2>
      <p className="text-muted-foreground mt-1 text-sm leading-relaxed">{copy.body}</p>

      {pending.length > 0 ? (
        <ul className="divide-border mt-3 list-none divide-y p-0">
          {pending.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
              <span className="min-w-0 flex-1 truncate text-sm">{p.email}</span>
              <span className="text-muted-foreground text-xs">
                {p.expired ? copy.expired : copy.invitedOn.replace('{date}', p.sentOn)}
              </span>
              <Button
                variant="secondary"
                type="button"
                busy={resending === p.id}
                busyLabel={copy.sending}
                onClick={() => again(p.id)}
              >
                {copy.resend}
              </Button>
              {resendError[p.id] ? (
                <InlineError id={`${id}-${p.id}`}>{resendError[p.id]}</InlineError>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {slots > 0 && (
        <form onSubmit={submit} noValidate className="mt-4 space-y-3">
          {[copy.partner1, copy.partner2].slice(0, Math.min(slots, 2)).map((label, i) => (
            <div key={label}>
              <Field
                ref={i === 0 ? first : second}
                id={`${id}-p${i}`}
                name={`partner${i + 1}`}
                type="email"
                autoComplete="off"
                label={label}
                invalid={errors[i] !== null}
                errorId={`${id}-p${i}-error`}
                required={i === 0}
              />
              {errors[i] !== null ? (
                <InlineError id={`${id}-p${i}-error`}>{errors[i]}</InlineError>
              ) : null}
            </div>
          ))}
          <p className="text-muted-foreground text-sm">
            <Link href={tasksHref} className="text-primary underline underline-offset-[3px]">
              {copy.sharedCount}
            </Link>
          </p>
          <Button type="submit" busy={busy} busyLabel={copy.sending}>
            {copy.send}
          </Button>
        </form>
      )}
      {done !== '' ? <p className="mt-3 text-sm">{done}</p> : null}
      <LiveRegion message={done} />
    </Card>
  )
}
