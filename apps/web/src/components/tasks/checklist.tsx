'use client'

import type { TaskRow } from '@guestnote/db'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { app } from '../../lib/routes.ts'
import type { TaskAnchorOption, TaskFormValues } from '../../lib/task-form.ts'
import { FILTERS, type Filter, filterCounts, groupTasks } from './buckets.ts'
import { QuickAdd } from './quick-add.tsx'
import { TaskForm } from './task-form.tsx'
import { TaskRowView } from './task-row.tsx'

/**
 * The checklist screen: the quick-add line, filter pills, then one card per due bucket.
 *
 * The filter is a link to `?filter=`, not state, so a filtered list can be sent to somebody and
 * the back button undoes a filter. `filter` and `today` arrive as props for the same reason
 * `buckets.ts` takes `today`: the server reads the clock once.
 *
 * Since spec 0009 B1 a row opens its task beside the list, at `?task=` with the filter kept, and
 * the full form opens only from "Meer opties…" on the quick-add line. The toolbar's "Nieuwe taak"
 * button went: with the line always at the top it was a second door to the same form, and the
 * empty state now points at the line instead of at a button.
 */
export function Checklist({
  weddingId,
  weddingDate,
  events = [],
  tasks,
  filter,
  today,
}: {
  weddingId: string
  weddingDate: string | null
  /** What a new task may count from besides the main day (spec 0004). */
  events?: readonly TaskAnchorOption[]
  tasks: TaskRow[]
  filter: Filter
  today: string
}) {
  const t = useTranslations('app.tasks')
  // The full form's starting values while it is open, from "Meer opties…"; `null` shows the line.
  const [adding, setAdding] = useState<TaskFormValues | null>(null)
  // What the line held when the full form was cancelled, so backing out does not lose the typing.
  const [carried, setCarried] = useState('')

  const counts = filterCounts(tasks, today)
  const groups = groupTasks(tasks, filter, today)
  const base = app.weddingTasks(weddingId)

  return (
    <div>
      {adding === null ? (
        <QuickAdd
          weddingId={weddingId}
          initialTitle={carried}
          onMore={(initial) => {
            setCarried('')
            setAdding(initial)
          }}
        />
      ) : (
        <TaskForm
          weddingId={weddingId}
          weddingDate={weddingDate}
          events={events}
          initial={adding}
          onDone={() => setAdding(null)}
          onCancel={() => {
            setCarried(adding.title)
            setAdding(null)
          }}
        />
      )}

      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        <nav aria-label={t('filtersLabel')} className="flex flex-wrap items-center gap-1.5">
          {FILTERS.map((f) => (
            <Link
              key={f}
              href={app.weddingTasks(weddingId, { filter: f })}
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
      </div>

      {tasks.length === 0 && adding === null && (
        <div className="border-border bg-card rounded-[var(--radius-container)] border px-6 py-10 text-center">
          <p className="text-sm font-semibold">{t('empty.title')}</p>
          <p className="text-muted-foreground mx-auto mt-1 max-w-sm text-sm">{t('empty.body')}</p>
        </div>
      )}

      {tasks.length > 0 && groups.length === 0 && (
        <div className="border-border bg-card rounded-[var(--radius-container)] border px-6 py-8 text-center">
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
          <ul className="border-border bg-card overflow-hidden rounded-[var(--radius-container)] border">
            {group.tasks.map((task) => (
              <TaskRowView
                key={task.id}
                task={task}
                today={today}
                href={app.weddingTasks(weddingId, { filter, task: task.id })}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
