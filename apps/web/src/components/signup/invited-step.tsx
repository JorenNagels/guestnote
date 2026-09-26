'use client'

import { Button } from '@guestnote/ui/button'
import { Card } from '@guestnote/ui/card'
import { InlineError } from '@guestnote/ui/inline-error'
import { LiveRegion } from '@guestnote/ui/live-region'
import { useState, useTransition } from 'react'
import { fill, splitAround } from '../auth/copy.ts'
import { StepLink } from './signup-frame.tsx'
import type { JoinOutcome } from './state.ts'

export type InvitedLabels = Readonly<{
  title: string
  /** template, `{email}` */
  intro: string
  /** template, `{role}` */
  staffLine: string
  /** template, `{wedding}` */
  weddingLine: string
  /** template, `{inviter}` */
  invitedBy: string
  roleAdmin: string
  roleMember: string
  join: string
  joining: string
  open: string
  couplePortal: string
  ownStudio: string
  errors: Readonly<Record<'expired' | 'accepted' | 'unknown', string>>
}>

export type InvitationRow = Readonly<{
  id: string
  orgName: string
  /** Set for a wedding (couple/editor) invitation, null for staff. */
  weddingName: string | null
  isWedding: boolean
  role: string
  inviterName: string | null
}>

type Props = {
  readonly labels: InvitedLabels
  readonly email: string
  readonly invitations: readonly InvitationRow[]
  readonly ownStudioHref: string
  /** Where a successful Join lands: the dashboard, now acting in the joined studio. */
  readonly homeHref: string
  readonly join: (invitationId: string) => Promise<JoinOutcome>
}

/**
 * "You've been invited" (spec 0005): shown between Verify and Studio when the verified address
 * has pending invitations. Join (staff) accepts and opens that studio; Open (a wedding) says what
 * the invitation's own link says today -- the couple portal is not open yet -- and accepts
 * nothing. "Start my own studio anyway" is always there: a planner on staff somewhere may also
 * run their own.
 */
export function InvitedStep({ labels, email, invitations, ownStudioHref, homeHref, join }: Props) {
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [errors, setErrors] = useState<Readonly<Record<string, string>>>({})
  const [opened, setOpened] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const [, startTransition] = useTransition()
  const [before, after] = splitAround(labels.intro, 'email')

  function onJoin(id: string) {
    setPendingId(id)
    startTransition(async () => {
      const result = await join(id).catch(() => ({ ok: false, reason: 'unknown' }) as const)
      if (result.ok) {
        // A full navigation, so the shell renders fresh in the studio the action just chose.
        // `pendingId` stays set: the button keeps saying it is busy until the page goes.
        window.location.assign(homeHref)
        return
      }
      setPendingId(null)
      const message = labels.errors[result.reason]
      setErrors((prev) => ({ ...prev, [id]: message }))
      setAnnouncement(message)
    })
  }

  return (
    <>
      <LiveRegion message={announcement} />
      <h1 className="mb-1.5 text-2xl leading-tight font-semibold tracking-[-0.015em]">
        {labels.title}
      </h1>
      <p className="mb-[22px] text-sm leading-[1.55] text-muted-foreground">
        {before}
        <span className="font-medium break-words text-foreground">{email}</span>
        {after}
      </p>

      <ul className="flex flex-col gap-3">
        {invitations.map((inv) => {
          const role = inv.role === 'admin' ? labels.roleAdmin : labels.roleMember
          return (
            <li key={inv.id}>
              <Card className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{inv.orgName}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {inv.isWedding
                      ? fill(labels.weddingLine, { wedding: inv.weddingName ?? '' })
                      : fill(labels.staffLine, { role })}
                  </div>
                  {inv.inviterName && (
                    <div className="truncate text-xs text-muted-foreground">
                      {fill(labels.invitedBy, { inviter: inv.inviterName })}
                    </div>
                  )}
                </div>
                <div className="w-28 shrink-0">
                  {inv.isWedding ? (
                    <Button variant="secondary" onClick={() => setOpened(inv.id)}>
                      {labels.open}
                    </Button>
                  ) : (
                    <Button
                      busy={pendingId === inv.id}
                      busyLabel={labels.joining}
                      disabled={pendingId !== null}
                      onClick={() => onJoin(inv.id)}
                    >
                      {labels.join}
                    </Button>
                  )}
                </div>
              </Card>
              {opened === inv.id && (
                <p role="status" className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  {labels.couplePortal}
                </p>
              )}
              {errors[inv.id] && <InlineError>{errors[inv.id]}</InlineError>}
            </li>
          )
        })}
      </ul>

      <div className="mt-6 text-center">
        <StepLink href={ownStudioHref}>{labels.ownStudio}</StepLink>
      </div>
    </>
  )
}
