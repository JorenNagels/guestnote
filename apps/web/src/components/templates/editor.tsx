'use client'

import type { TemplateDetail, TemplateItemRow } from '@guestnote/db'
import { Card } from '@guestnote/ui/card'
import { InlineError } from '@guestnote/ui/inline-error'
import { Pill } from '@guestnote/ui/pill'
import { Table, TableBody, TableCell, TableHead, TableHeaderCell } from '@guestnote/ui/table'
import { useRouter } from 'next/navigation'
import { useFormatter, useTranslations } from 'next-intl'
import { useState, useTransition } from 'react'
import {
  deleteTemplateAction,
  duplicateTemplateAction,
  moveItemAction,
  updateTemplateAction,
} from '../../app/pro/(app)/templates/[templateId]/actions.ts'
import { app } from '../../lib/routes.ts'
import { addDaysCivil, formatOffset } from '../../lib/template-preview.ts'
import { formatDate } from '../tasks/format.ts'
import { SmallButton } from '../vendors/controls.tsx'
import { ApplyPanel, type WeddingOption } from './apply-panel.tsx'
import { TemplateSheet } from './template-sheet.tsx'

export type { WeddingOption }

import { AddItemForm, ItemSheet } from './item-editor.tsx'

/**
 * One template: its plan as a table, the apply panel, and the forms that change it.
 *
 * Everything the planner can edit saves at once and the page underneath refreshes because the
 * action revalidates the route -- this component keeps no copy of the rows, so the table is
 * always what the database says. The exception is the apply panel's selected wedding, which is
 * view state: it only decides what the "Becomes" column shows, and nothing is written until Apply.
 *
 * `canWrite` only decides what is drawn. The actions and the policies decide what is allowed.
 */
export function TemplateEditor({
  template,
  canWrite,
  weddings,
  defaultWeddingId,
}: {
  template: TemplateDetail
  canWrite: boolean
  weddings: WeddingOption[]
  defaultWeddingId: string | null
}) {
  const t = useTranslations('app.templates')
  const format = useFormatter()
  const router = useRouter()
  const [weddingId, setWeddingId] = useState(defaultWeddingId ?? '')
  const [editing, setEditing] = useState(false)
  const [editItem, setEditItem] = useState<TemplateItemRow | null>(null)
  const [pending, startTransition] = useTransition()
  const [duplicating, startDuplicate] = useTransition()
  const [rowError, setRowError] = useState<string | null>(null)
  const [duplicateError, setDuplicateError] = useState<string | null>(null)

  const wedding = weddings.find((w) => w.id === weddingId) ?? null

  const move = (item: TemplateItemRow, direction: 'up' | 'down') => {
    setRowError(null)
    startTransition(async () => {
      try {
        const r = await moveItemAction(template.id, item.id, direction)
        if (!r.ok) setRowError(r.error)
      } catch {
        setRowError('generic')
      }
    })
  }

  const duplicate = () => {
    setDuplicateError(null)
    startDuplicate(async () => {
      try {
        const r = await duplicateTemplateAction(template.id)
        if (r.ok) router.push(app.template(r.id))
        else setDuplicateError(r.error)
      } catch {
        setDuplicateError('generic')
      }
    })
  }

  const items = template.items

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{template.name}</h1>
          {template.description && (
            <p className="text-muted-foreground mt-1 max-w-prose text-sm">{template.description}</p>
          )}
          <p className="text-muted-foreground mt-1 font-mono text-xs tabular-nums">
            {t('editor.count', { count: items.length })}
          </p>
        </div>
        {canWrite ? (
          <div className="flex flex-wrap gap-2">
            <SmallButton disabled={duplicating} onClick={() => setEditing(true)}>
              {t('editor.edit')}
            </SmallButton>
            <SmallButton disabled={duplicating} onClick={duplicate}>
              {duplicating ? t('editor.duplicating') : t('editor.duplicate')}
            </SmallButton>
          </div>
        ) : (
          <p className="text-muted-foreground max-w-xs text-xs">{t('editor.readOnly')}</p>
        )}
      </div>
      {duplicateError && <InlineError>{t(`errors.${duplicateError}`)}</InlineError>}

      <ApplyPanel
        templateId={template.id}
        weddings={weddings}
        weddingId={weddingId}
        onWedding={setWeddingId}
        hasItems={items.length > 0}
      />

      {items.length === 0 ? (
        <Card className="text-center">
          <p className="text-sm font-semibold">{t('editor.emptyTitle')}</p>
          <p className="text-muted-foreground mt-1 text-sm">
            {canWrite ? t('editor.emptyBody') : t('editor.emptyReadOnly')}
          </p>
        </Card>
      ) : (
        <Table caption={t('editor.tableCaption')}>
          <TableHead>
            <tr>
              {canWrite && (
                <TableHeaderCell className="w-[1%]">{t('editor.colOrder')}</TableHeaderCell>
              )}
              <TableHeaderCell>{t('editor.colOffset')}</TableHeaderCell>
              <TableHeaderCell>{t('editor.colTask')}</TableHeaderCell>
              <TableHeaderCell>{t('editor.colOwner')}</TableHeaderCell>
              <TableHeaderCell className="text-right">{t('editor.colBecomes')}</TableHeaderCell>
              {canWrite && (
                <TableHeaderCell className="text-right">{t('editor.colActions')}</TableHeaderCell>
              )}
            </tr>
          </TableHead>
          <TableBody>
            {items.map((item, i) => {
              const becomes = addDaysCivil(wedding?.date ?? null, item.dueOffsetDays)
              return (
                <tr key={item.id}>
                  {canWrite && (
                    <TableCell>
                      <span className="flex gap-1">
                        <SmallButton
                          className="px-2"
                          disabled={pending || i === 0}
                          aria-label={t('editor.moveUp', { title: item.title })}
                          onClick={() => move(item, 'up')}
                        >
                          <span aria-hidden="true">↑</span>
                        </SmallButton>
                        <SmallButton
                          className="px-2"
                          disabled={pending || i === items.length - 1}
                          aria-label={t('editor.moveDown', { title: item.title })}
                          onClick={() => move(item, 'down')}
                        >
                          <span aria-hidden="true">↓</span>
                        </SmallButton>
                      </span>
                    </TableCell>
                  )}
                  <TableCell>
                    <span
                      className="font-mono text-xs whitespace-nowrap tabular-nums"
                      title={ruleText(t, item.dueOffsetDays)}
                    >
                      {formatOffset(item.dueOffsetDays)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="min-w-0">
                      {item.title}
                      {item.visibility === 'internal' && (
                        <Pill tone="warning" className="ml-2 align-middle">
                          {t('editor.internal')}
                        </Pill>
                      )}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {t(`editor.owner.${item.assigneeRole}`)}
                  </TableCell>
                  <TableCell className="text-right">
                    {becomes ? (
                      <span className="text-muted-foreground font-mono text-xs whitespace-nowrap tabular-nums">
                        {formatDate(format, becomes)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">
                        <span aria-hidden="true">-</span>
                        <span className="sr-only">{t('editor.noDate')}</span>
                      </span>
                    )}
                  </TableCell>
                  {canWrite && (
                    <TableCell className="text-right">
                      <SmallButton
                        disabled={pending}
                        aria-label={t('editor.editItemAria', { title: item.title })}
                        onClick={() => setEditItem(item)}
                      >
                        {t('editor.editItem')}
                      </SmallButton>
                    </TableCell>
                  )}
                </tr>
              )
            })}
          </TableBody>
        </Table>
      )}
      {rowError && <InlineError>{t(`errors.${rowError}`)}</InlineError>}

      {canWrite && <AddItemForm templateId={template.id} />}

      {editing && (
        <TemplateSheet
          template={template}
          onClose={() => setEditing(false)}
          onSubmit={(input) => updateTemplateAction(template.id, input)}
          onDelete={async () => {
            const r = await deleteTemplateAction(template.id)
            if (r.ok) router.push(app.templates())
            return r
          }}
        />
      )}
      {editItem && (
        <ItemSheet templateId={template.id} item={editItem} onClose={() => setEditItem(null)} />
      )}
    </div>
  )
}

function ruleText(t: ReturnType<typeof useTranslations>, offset: number): string {
  if (offset === 0) return t('editor.rule.onDay')
  return t(offset < 0 ? 'editor.rule.before' : 'editor.rule.after', { days: Math.abs(offset) })
}
