'use client'

import { Button } from '@guestnote/ui/button'
import { Card } from '@guestnote/ui/card'
import { InlineError } from '@guestnote/ui/inline-error'
import { LiveRegion } from '@guestnote/ui/live-region'
import { useRouter } from 'next/navigation'
import { useId, useState, useTransition } from 'react'
import type { CoupleInviteResult } from '../../lib/couple-invite.ts'

export const MODULES = ['tasks', 'moodboards', 'run_sheet', 'vendors', 'budget'] as const
export type Module = (typeof MODULES)[number]

export type CoupleSettingsCopy = {
  readonly title: string
  readonly intro: string
  readonly modulesTitle: string
  readonly module: Readonly<Record<Module, string>>
  readonly saved: string
  readonly accessTitle: string
  readonly noPartners: string
  readonly pending: string
  readonly expired: string
  /** `{date}` */
  readonly joinedOn: string
  /** `{date}` */
  readonly expiresOn: string
  readonly resend: string
  readonly revoke: string
  readonly remove: string
  readonly cancel: string
  /** `{email}` */
  readonly confirmRemove: string
  /** `{email}` */
  readonly confirmRevoke: string
  readonly sending: string
  readonly sent: string
  readonly mailFailed: string
  readonly errGeneric: string
}

export type Partner = {
  readonly userId: string
  readonly label: string
  readonly email: string
  readonly since: string
}
export type Invite = {
  readonly id: string
  readonly email: string
  readonly expiresOn: string
  readonly expired: boolean
}

/**
 * Wedding settings, "Koppel" (spec 0008): the five module switches, then who has access --
 * accepted partners with Remove, pending and expired invitations with Resend and Revoke. Each
 * switch saves on its own, immediately; remove and revoke ask once, naming the address.
 */
export function CoupleSettings({
  copy,
  modules,
  partners,
  invites,
  actions,
}: {
  copy: CoupleSettingsCopy
  modules: readonly Module[]
  partners: readonly Partner[]
  invites: readonly Invite[]
  actions: {
    setModules(modules: Module[]): Promise<{ ok: boolean }>
    resend(invitationId: string): Promise<CoupleInviteResult | null>
    revoke(invitationId: string): Promise<{ ok: boolean }>
    remove(userId: string): Promise<{ ok: boolean }>
  }
}) {
  const id = useId()
  const router = useRouter()
  const [on, setOn] = useState<ReadonlySet<Module>>(new Set(modules))
  const [announce, setAnnounce] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)
  const [busy, start] = useTransition()

  function toggle(m: Module) {
    const next = new Set(on)
    if (next.has(m)) next.delete(m)
    else next.add(m)
    const before = on
    setOn(next)
    setError(null)
    start(async () => {
      const r = await actions.setModules(MODULES.filter((x) => next.has(x)))
      if (r.ok) {
        setAnnounce(copy.saved)
        router.refresh()
      } else {
        setOn(before)
        setError(copy.errGeneric)
      }
    })
  }

  function run(key: string, fn: () => Promise<{ ok: boolean } | CoupleInviteResult | null>) {
    setError(null)
    start(async () => {
      const r = await fn()
      setConfirming(null)
      if (r === null || !r.ok) {
        setError(
          r && 'reason' in r && r.reason === 'mailFailed' ? copy.mailFailed : copy.errGeneric,
        )
        return
      }
      if (key.startsWith('resend')) setAnnounce(copy.sent)
      router.refresh()
    })
  }

  return (
    <Card as="section" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="text-base font-semibold">
        {copy.title}
      </h2>
      <p className="text-muted-foreground mt-1 text-sm">{copy.intro}</p>

      <fieldset className="mt-4">
        <legend className="mb-2 text-sm font-medium">{copy.modulesTitle}</legend>
        <ul className="m-0 list-none space-y-2 p-0">
          {MODULES.map((m) => (
            <li key={m}>
              <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={on.has(m)}
                  onChange={() => toggle(m)}
                  className="size-5 accent-[color:var(--primary)]"
                />
                {copy.module[m]}
              </label>
            </li>
          ))}
        </ul>
      </fieldset>

      <h3 className="mt-6 mb-2 text-sm font-medium">{copy.accessTitle}</h3>
      {partners.length === 0 && invites.length === 0 ? (
        <p className="text-muted-foreground text-sm">{copy.noPartners}</p>
      ) : (
        <ul className="divide-border m-0 list-none divide-y p-0">
          {partners.map((p) => (
            <Row
              key={p.userId}
              main={p.label}
              sub={copy.joinedOn.replace('{date}', p.since)}
              confirmText={copy.confirmRemove.replace('{email}', p.email)}
              confirming={confirming === `remove:${p.userId}`}
              onAsk={() => setConfirming(`remove:${p.userId}`)}
              onCancel={() => setConfirming(null)}
              onConfirm={() => run('remove', () => actions.remove(p.userId))}
              label={copy.remove}
              cancel={copy.cancel}
              busy={busy}
            />
          ))}
          {invites.map((i) => (
            <Row
              key={i.id}
              main={i.email}
              sub={
                i.expired
                  ? copy.expired
                  : `${copy.pending} · ${copy.expiresOn.replace('{date}', i.expiresOn)}`
              }
              confirmText={copy.confirmRevoke.replace('{email}', i.email)}
              confirming={confirming === `revoke:${i.id}`}
              onAsk={() => setConfirming(`revoke:${i.id}`)}
              onCancel={() => setConfirming(null)}
              onConfirm={() => run('revoke', () => actions.revoke(i.id))}
              label={copy.revoke}
              cancel={copy.cancel}
              busy={busy}
              extra={
                <Button
                  type="button"
                  variant="secondary"
                  busy={busy}
                  busyLabel={copy.sending}
                  onClick={() => run('resend', () => actions.resend(i.id))}
                >
                  {copy.resend}
                </Button>
              }
            />
          ))}
        </ul>
      )}
      {error !== null ? <InlineError id={`${id}-error`}>{error}</InlineError> : null}
      <LiveRegion message={announce} />
    </Card>
  )
}

function Row({
  main,
  sub,
  confirmText,
  confirming,
  onAsk,
  onCancel,
  onConfirm,
  label,
  cancel,
  busy,
  extra,
}: {
  main: string
  sub: string
  confirmText: string
  confirming: boolean
  onAsk(): void
  onCancel(): void
  onConfirm(): void
  label: string
  cancel: string
  busy: boolean
  extra?: React.ReactNode
}) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">{main}</p>
        <p className="text-muted-foreground text-xs">{sub}</p>
      </div>
      {confirming ? (
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <p className="text-sm">{confirmText}</p>
          <Button type="button" busy={busy} onClick={onConfirm}>
            {label}
          </Button>
          <Button type="button" variant="secondary" onClick={onCancel}>
            {cancel}
          </Button>
        </div>
      ) : (
        <>
          {extra}
          <Button type="button" variant="secondary" onClick={onAsk}>
            {label}
          </Button>
        </>
      )}
    </li>
  )
}
