'use client'

import type { TemplateSummary } from '@guestnote/db'
import { Card } from '@guestnote/ui/card'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { createTemplateAction } from '../../app/pro/(app)/templates/actions.ts'
import { app } from '../../lib/routes.ts'
import { SmallButton } from '../vendors/controls.tsx'
import { TemplateSheet } from './template-sheet.tsx'

/**
 * The studio's templates as a column of cards, each one a link to its editor. The prototype puts
 * the editor beside the list; on a phone that is two screens anyway, so it is two routes here
 * and a Back link, which keeps the URL of a template shareable inside the studio.
 *
 * `canWrite` only decides what is drawn. The action and the policies decide what is allowed.
 */
export function TemplateList({
  templates,
  canWrite,
}: {
  templates: TemplateSummary[]
  canWrite: boolean
}) {
  const t = useTranslations('app.s7')
  const router = useRouter()
  const [creating, setCreating] = useState(false)

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <span className="flex-1" />
        {canWrite ? (
          <SmallButton tone="primary" onClick={() => setCreating(true)}>
            {t('list.new')}
          </SmallButton>
        ) : (
          <p className="text-muted-foreground text-xs">{t('list.readOnly')}</p>
        )}
      </div>

      {templates.length === 0 ? (
        <Card className="text-center">
          <p className="text-sm font-semibold">{t('list.emptyTitle')}</p>
          <p className="text-muted-foreground mx-auto mt-1 max-w-prose text-sm">
            {canWrite ? t('list.emptyBody') : t('list.emptyReadOnly')}
          </p>
        </Card>
      ) : (
        <ul aria-label={t('list.label')} className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((tpl) => (
            <li key={tpl.id}>
              <Link
                href={app.template(tpl.id)}
                className="border-border bg-card hover:border-foreground/40 focus-visible:outline-ring block h-full rounded-[var(--radius)] border px-4 py-3.5 transition-colors focus-visible:outline-2"
              >
                <span className="block text-sm font-semibold">{tpl.name}</span>
                {tpl.description && (
                  <span className="text-muted-foreground mt-1 line-clamp-2 block text-xs leading-relaxed">
                    {tpl.description}
                  </span>
                )}
                <span className="text-muted-foreground mt-2 block font-mono text-[11px] tabular-nums">
                  {t('list.items', { count: tpl.itemCount })}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {creating && (
        <TemplateSheet
          onClose={() => setCreating(false)}
          onSubmit={async (input) => {
            const r = await createTemplateAction(input)
            // Straight into the new template: an empty plan is only useful once it has items.
            if (r.ok) router.push(app.template(r.id))
            return r.ok ? { ok: true } : r
          }}
        />
      )}
    </div>
  )
}
