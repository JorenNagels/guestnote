'use client'

import type { TemplateDetail, TemplateItemRow } from '@guestnote/db'
import { Button } from '@guestnote/ui/button'
import { Card } from '@guestnote/ui/card'
import { InlineError } from '@guestnote/ui/inline-error'
import { Pill } from '@guestnote/ui/pill'
import { Sheet } from '@guestnote/ui/sheet'
import { Table, TableBody, TableCell, TableHead, TableHeaderCell } from '@guestnote/ui/table'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useFormatter, useTranslations } from 'next-intl'
import { type FormEvent, useId, useRef, useState, useTransition } from 'react'
import {
  addItemAction,
  applyTemplateAction,
  deleteItemAction,
  deleteTemplateAction,
  duplicateTemplateAction,
  moveItemAction,
  updateItemAction,
  updateTemplateAction,
} from '../../app/pro/(app)/templates/[templateId]/actions.ts'
import { app } from '../../lib/routes.ts'
import {
  EMPTY_ITEM,
  formFromItem,
  type ItemFormValues,
  type TemplateActionError,
} from '../../lib/template-input.ts'
import { addDaysCivil, formatOffset } from '../../lib/template-preview.ts'
import { formatDate } from '../tasks/format.ts'
import { SELECT_CLASS, SmallButton } from '../vendors/controls.tsx'
import { ItemFields } from './item-fields.tsx'
import { TemplateSheet } from './template-sheet.tsx'

export type WeddingOption = { id: string; name: string; date: string | null }

type Result = { ok: true } | { ok: false; error: TemplateActionError }
type ApplyState =
  | { kind: 'idle' }
  | { kind: 'done'; count: number; weddingId: string; wedding: string }
  | { kind: 'error'; error: string }

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

function ApplyPanel({
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

function AddItemForm({ templateId }: { templateId: string }) {
  const t = useTranslations('app.templates')
  const formId = useId()
  const title = useRef<HTMLInputElement>(null)
  const [values, setValues] = useState<ItemFormValues>(EMPTY_ITEM)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      try {
        const r = await addItemAction(templateId, values)
        if (r.ok) {
          // Keep timing, owner and visibility: a plan is typed in runs of similar rows.
          setValues({ ...values, title: '', offsetDays: '' })
          title.current?.focus()
        } else {
          setError(r.error)
        }
      } catch {
        setError('generic')
      }
    })
  }

  return (
    <form
      onSubmit={submit}
      aria-labelledby={`${formId}-heading`}
      className="border-border rounded-[var(--radius)] border border-dashed p-3"
    >
      {/* `-heading`, not `-title`: `idPrefix={formId}` below also names the title FIELD
          `${formId}-title`, and two elements sharing one id breaks its `label[for]`. */}
      <h2 id={`${formId}-heading`} className="mb-2 text-sm font-semibold">
        {t('item.addTitle')}
      </h2>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1">
          <ItemFields
            values={values}
            onChange={setValues}
            idPrefix={formId}
            layout="row"
            titleRef={title}
          />
        </div>
        <div className="w-full sm:w-32">
          <Button type="submit" busy={pending} busyLabel={t('item.adding')}>
            {t('item.add')}
          </Button>
        </div>
      </div>
      {error && <InlineError>{t(`errors.${error}`)}</InlineError>}
    </form>
  )
}

function ItemSheet({
  templateId,
  item,
  onClose,
}: {
  templateId: string
  item: TemplateItemRow
  onClose: () => void
}) {
  const t = useTranslations('app.templates')
  const formId = useId()
  const [values, setValues] = useState<ItemFormValues>(() => formFromItem(item))
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  const run = (fn: () => Promise<Result>) => {
    setError(null)
    startTransition(async () => {
      try {
        const r = await fn()
        if (r.ok) onClose()
        else setError(r.error)
      } catch {
        setError('generic')
      }
    })
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={t('item.editTitle')}
      closeLabel={t('form.close')}
      footer={
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="submit"
            form={formId}
            busy={pending}
            busyLabel={t('form.saving')}
            disabled={confirming}
          >
            {t('form.save')}
          </Button>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            {t('form.cancel')}
          </Button>
        </div>
      }
    >
      <form
        id={formId}
        onSubmit={(e) => {
          e.preventDefault()
          run(() => updateItemAction(templateId, item.id, values))
        }}
        className="space-y-4"
      >
        <ItemFields values={values} onChange={setValues} idPrefix={formId} layout="stack" />
        {error && <InlineError>{t(`errors.${error}`)}</InlineError>}
        <div className="border-border border-t pt-4">
          {confirming ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm">{t('item.removeConfirm')}</span>
              <SmallButton
                disabled={pending}
                onClick={() => run(() => deleteItemAction(templateId, item.id))}
              >
                {t('item.removeConfirmYes')}
              </SmallButton>
              <SmallButton disabled={pending} onClick={() => setConfirming(false)}>
                {t('form.cancel')}
              </SmallButton>
            </div>
          ) : (
            <SmallButton disabled={pending} onClick={() => setConfirming(true)}>
              {t('item.remove')}
            </SmallButton>
          )}
        </div>
      </form>
    </Sheet>
  )
}
