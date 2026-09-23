'use client'

import type { TaskRow } from '@guestnote/db'
import { Button } from '@guestnote/ui/button'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { app } from '../../lib/routes.ts'
import { EMPTY_FORM } from '../../lib/task-form.ts'
import { FILTERS, type Filter, filterCounts, groupTasks } from './buckets.ts'
import { TaskForm } from './task-form.tsx'
import { TaskRowView } from './task-row.tsx'

/**
 * The checklist screen: filter pills, the inline new-task form, then one card per due bucket.
 *
 * The filter is a link to `?filter=`, not state, so a filtered list can be sent to somebody and
 * the back button undoes a filter. `filter` and `today` arrive as props for the same reason
 * `buckets.ts` takes `today`: the server reads the clock once.
 */
export function Checklist({
  weddingId,
  weddingDate,
  tasks,
  filter,
  today,
}: {
  weddingId: string
  weddingDate: string | null
  tasks: TaskRow[]
  filter: Filter
  today: string
}) {
  const t = useTranslations('app.tasks')
  const [adding, setAdding] = useState(false)

  const counts = filterCounts(tasks, today)
  const groups = groupTasks(tasks, filter, today)
  const base = app.weddingTasks(weddingId)

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        <nav aria-label={t('filtersLabel')} className="flex flex-wrap items-center gap-1.5">
          {FILTERS.map((f) => (
            <Link
              key={f}
              href={f === 'all' ? base : `${base}?filter=${f}`}
              aria-current={f === filter ? 'page' : undefined}
              className={
                f === filter
                  ? 'border-primary bg-primary text-primary-foreground inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.78rem]'
                  : 'border-input hover:border-foreground inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.78rem]'
              }
            >
              {t(`filters.${f}`)}
              <span className="font-mono text-[0.68rem] tabular-nums opacity-75">{counts[f]}</span>
            </Link>
          ))}
        </nav>
        <span className="flex-1" />
        {!adding && (
          <Button
            variant="secondary"
            onClick={() => setAdding(true)}
            className="h-8! w-auto! rounded-full px-3.5 text-[0.78rem]"
          >
            {t('newTask')}
          </Button>
        )}
      </div>

      {adding && (
        <TaskForm
          weddingId={weddingId}
          weddingDate={weddingDate}
          initial={EMPTY_FORM}
          onDone={() => setAdding(false)}
          onCancel={() => setAdding(false)}
        />
      )}

      {tasks.length === 0 && !adding && (
        <div className="border-border bg-card rounded-[var(--radius)] border px-6 py-10 text-center">
          <p className="text-sm font-semibold">{t('empty.title')}</p>
          <p className="text-muted-foreground mx-auto mt-1 max-w-sm text-sm">{t('empty.body')}</p>
          <Button onClick={() => setAdding(true)} className="mx-auto mt-4 w-auto! px-4">
            {t('newTask')}
          </Button>
        </div>
      )}

      {tasks.length > 0 && groups.length === 0 && (
        <div className="border-border bg-card rounded-[var(--radius)] border px-6 py-8 text-center">
          <p className="text-sm font-semibold">{t('filterEmpty.title')}</p>
          <Link href={base} className="text-sm underline underline-offset-[3px]">
            {t('filterEmpty.back')}
          </Link>
        </div>
      )}

      {groups.map((group) => (
        <section key={group.bucket} className="mb-5" aria-labelledby={`bucket-${group.bucket}`}>
          <div className="mb-2 flex items-baseline gap-2">
            <h2
              id={`bucket-${group.bucket}`}
              className={
                group.bucket === 'overdue'
                  ? 'text-destructive text-[0.8rem] font-semibold tracking-[0.05em] uppercase'
                  : 'text-[0.8rem] font-semibold tracking-[0.05em] uppercase'
              }
            >
              {t(`buckets.${group.bucket}`)}
            </h2>
            <span className="text-muted-foreground font-mono text-[0.7rem] tabular-nums">
              {group.tasks.length}
            </span>
          </div>
          <ul className="border-border bg-card overflow-hidden rounded-[var(--radius)] border">
            {group.tasks.map((task) => (
              <TaskRowView key={task.id} task={task} today={today} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
