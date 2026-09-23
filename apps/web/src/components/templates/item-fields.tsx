'use client'

import { useTranslations } from 'next-intl'
import type { Ref } from 'react'
import type { ItemFormValues } from '../../lib/template-input.ts'
import { TEMPLATE_LIMITS } from '../../lib/template-input.ts'
import { SELECT_CLASS } from '../vendors/controls.tsx'

const INPUT =
  'bg-transparent h-[var(--control-h)] w-full min-w-0 rounded-[var(--radius)] border border-[var(--input)] px-2 text-sm'
const LABEL = 'text-muted-foreground mb-1 block text-[11px] font-medium'

/**
 * The five fields of a template row, controlled by the caller. One component for the add row
 * under the table and the edit sheet, so the two cannot drift on what an item is.
 *
 * `layout="row"` is one line from `sm` up, so a planner can type a whole plan with Tab and Enter
 * and never leave the keyboard (the bar is a spreadsheet); `"stack"` is for the sheet.
 *
 * Native controls, like S3's row selects: fastest on a phone, and they follow `--control-h`.
 */
export function ItemFields({
  values,
  onChange,
  idPrefix,
  layout,
  titleRef,
}: {
  values: ItemFormValues
  onChange: (next: ItemFormValues) => void
  idPrefix: string
  layout: 'row' | 'stack'
  titleRef?: Ref<HTMLInputElement>
}) {
  const t = useTranslations('app.templates.item')
  const owner = useTranslations('app.templates.editor.owner')
  const set = <K extends keyof ItemFormValues>(key: K, value: ItemFormValues[K]) =>
    onChange({ ...values, [key]: value })

  return (
    <div
      className={
        layout === 'row'
          ? 'grid gap-2 sm:grid-cols-[minmax(0,1fr)_4.5rem_9.5rem_7rem_11rem] sm:items-end'
          : 'grid grid-cols-2 gap-3'
      }
    >
      <div className={layout === 'stack' ? 'col-span-2' : 'col-span-full sm:col-span-1'}>
        <label htmlFor={`${idPrefix}-title`} className={LABEL}>
          {t('title')}
        </label>
        <input
          id={`${idPrefix}-title`}
          ref={titleRef}
          value={values.title}
          onChange={(e) => set('title', e.target.value)}
          maxLength={TEMPLATE_LIMITS.title}
          autoComplete="off"
          required
          className={INPUT}
        />
      </div>
      <div>
        <label htmlFor={`${idPrefix}-days`} className={LABEL}>
          {t('days')}
        </label>
        <input
          id={`${idPrefix}-days`}
          value={values.offsetDays}
          onChange={(e) => set('offsetDays', e.target.value)}
          inputMode="numeric"
          autoComplete="off"
          required
          className={`${INPUT} font-mono tabular-nums`}
        />
      </div>
      <div>
        <label htmlFor={`${idPrefix}-direction`} className={LABEL}>
          {t('direction')}
        </label>
        <select
          id={`${idPrefix}-direction`}
          value={values.offsetDirection}
          onChange={(e) => set('offsetDirection', e.target.value === 'after' ? 'after' : 'before')}
          className={`${SELECT_CLASS} w-full`}
        >
          <option value="before">{t('before')}</option>
          <option value="after">{t('after')}</option>
        </select>
      </div>
      <div>
        <label htmlFor={`${idPrefix}-owner`} className={LABEL}>
          {t('owner')}
        </label>
        <select
          id={`${idPrefix}-owner`}
          value={values.assigneeRole}
          onChange={(e) => set('assigneeRole', e.target.value === 'couple' ? 'couple' : 'planner')}
          className={`${SELECT_CLASS} w-full`}
        >
          <option value="planner">{owner('planner')}</option>
          <option value="couple">{owner('couple')}</option>
        </select>
      </div>
      <div>
        <label htmlFor={`${idPrefix}-visibility`} className={LABEL}>
          {t('visibility')}
        </label>
        <select
          id={`${idPrefix}-visibility`}
          value={values.visibility}
          onChange={(e) => set('visibility', e.target.value === 'internal' ? 'internal' : 'shared')}
          className={`${SELECT_CLASS} w-full`}
        >
          <option value="shared">{t('shared')}</option>
          <option value="internal">{t('internal')}</option>
        </select>
      </div>
    </div>
  )
}
