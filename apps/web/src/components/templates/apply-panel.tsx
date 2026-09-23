'use client'

import { Button } from '@guestnote/ui/button'
import { Card } from '@guestnote/ui/card'
import { InlineError } from '@guestnote/ui/inline-error'
import Link from 'next/link'
import { useFormatter, useTranslations } from 'next-intl'
import { useId, useState, useTransition } from 'react'
import { applyTemplateAction } from '../../app/pro/(app)/templates/[templateId]/actions.ts'
import { app } from '../../lib/routes.ts'
import { formatDate } from '../tasks/format.ts'
import { SELECT_CLASS } from '../vendors/controls.tsx'

export type WeddingOption = { id: string; name: string; date: string | null }

type ApplyState =
  | { kind: 'idle' }
  | { kind: 'done'; count: number; weddingId: string; wedding: string }
  | { kind: 'error'; error: string }

export function ApplyPanel({
  templateId,
  weddings,
  weddingId,
  onWedding,
  hasItems,
}: {
  templateId: string
  weddings: WeddingOption[]
  weddingId: string
  onWedding: (id: string) => void
  hasItems: boolean
}) {
  const t = useTranslations('app.templates')
  const format = useFormatter()
  const selectId = useId()
  const [pending, startTransition] = useTransition()
  const [state, setState] = useState<ApplyState>({ kind: 'idle' })
  const wedding = weddings.find((w) => w.id === weddingId) ?? null

  const apply = () => {
    if (!wedding) return
    setState({ kind: 'idle' })
    startTransition(async () => {
      try {
        const r = await applyTemplateAction(templateId, wedding.id)
        setState(
          r.ok
            ? { kind: 'done', count: r.count, weddingId: wedding.id, wedding: wedding.name }
            : { kind: 'error', error: r.error },
        )
      } catch {
        setState({ kind: 'error', error: 'generic' })
      }
    })
  }

  return (
    <Card as="section" aria-labelledby={`${selectId}-title`}>
      <h2 id={`${selectId}-title`} className="text-sm font-semibold">
        {t('apply.title')}
      </h2>
      {weddings.length === 0 ? (
        <p className="text-muted-foreground mt-2 text-sm">{t('apply.noWeddings')}</p>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <div className="min-w-0 flex-1 basis-56 sm:max-w-sm">
              <label
                htmlFor={selectId}
                className="text-muted-foreground mb-1 block text-[11px] font-medium"
              >
                {t('apply.wedding')}
              </label>
              <select
                id={selectId}
                value={weddingId}
                onChange={(e) => {
                  onWedding(e.target.value)
                  setState({ kind: 'idle' })
                }}
                className={`${SELECT_CLASS} w-full`}
              >
                {weddings.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} · {w.date ? formatDate(format, w.date) : t('apply.noDateOption')}
                  </option>
                ))}
              </select>
            </div>
            <div className="w-full sm:w-64">
              <Button
                busy={pending}
                busyLabel={t('apply.applying')}
                disabled={!hasItems || !wedding}
                onClick={apply}
              >
                {t('apply.button')}
              </Button>
            </div>
          </div>
          <p className="text-muted-foreground mt-2 text-xs">
            {wedding && wedding.date === null ? t('apply.noDateNote') : t('apply.becomesHint')}
          </p>
          <p className="text-muted-foreground mt-1 text-xs">{t('apply.copyNote')}</p>
        </>
      )}
      {state.kind === 'done' && (
        <p role="status" className="mt-3 text-sm">
          {t('apply.done', { count: state.count, wedding: state.wedding })}{' '}
          <Link className="underline underline-offset-2" href={app.weddingTasks(state.weddingId)}>
            {t('apply.openChecklist')}
          </Link>
        </p>
      )}
      {state.kind === 'error' && <InlineError>{t(`errors.${state.error}`)}</InlineError>}
    </Card>
  )
}
