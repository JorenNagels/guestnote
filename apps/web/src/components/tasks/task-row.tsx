'use client'

import type { TaskRow as Task } from '@guestnote/db'
import { Pill } from '@guestnote/ui/pill'
import Link from 'next/link'
import { useFormatter, useTranslations } from 'next-intl'
import { useState } from 'react'
import { app } from '../../lib/routes.ts'
import { isOverdue } from './buckets.ts'
import { CompleteBox } from './complete-box.tsx'
import { formatDate, labelText } from './format.ts'
import { dueLabel } from './labels.ts'
import { VisibilityTag } from './visibility-tag.tsx'

/**
 * One checklist row. Density is `--row-h`, so the compact setting shrinks it with the tables.
 *
 * The overdue state is the red date AND the words ("3 days overdue"): the prototype's own note
 * is that these lists are printed in black and white.
 */
export function TaskRowView({ task, today }: { task: Task; today: string }) {
  const t = useTranslations('app.tasks')
  const format = useFormatter()
  const [failed, setFailed] = useState(false)

  const done = task.status === 'done'
  const overdue = isOverdue(task, today)
  const label = labelText(t, dueLabel(task, today))
  const owner = task.assigneeRole === 'couple' ? t('row.couple') : t('row.planner')

  return (
    <li className="border-border min-h-[var(--row-h)] border-t first:border-t-0">
      <div className="flex items-center gap-3 px-3.5 py-1.5">
        <CompleteBox
          weddingId={task.weddingId}
          taskId={task.id}
          title={task.title}
          done={done}
          onFail={() => setFailed(true)}
        />
        <Link
          href={app.weddingTask(task.weddingId, task.id)}
          className="min-w-0 flex-1 py-0.5 hover:underline"
        >
          <span
            className={
              done
                ? 'text-muted-foreground block truncate text-[0.84rem] line-through'
                : 'block truncate text-[0.84rem]'
            }
          >
            {task.title}
          </span>
          <span className="text-muted-foreground mt-0.5 flex items-center gap-1.5 text-[0.72rem]">
            {owner}
            {task.status === 'in_progress' && <Pill tone="accent">{t('row.inProgress')}</Pill>}
          </span>
        </Link>
        <span className="hidden flex-none sm:block">
          <VisibilityTag visibility={task.visibility} />
        </span>
        <span className="w-[7.5rem] flex-none text-right">
          {task.dueDate !== null && (
            <time
              dateTime={task.dueDate}
              className={
                overdue
                  ? 'text-destructive block font-mono text-[0.72rem] font-semibold tabular-nums'
                  : 'block font-mono text-[0.72rem] tabular-nums'
              }
            >
              {formatDate(format, task.dueDate)}
            </time>
          )}
          {label && (
            <span
              className={
                overdue
                  ? 'text-destructive mt-px block text-[0.66rem]'
                  : 'text-muted-foreground mt-px block text-[0.66rem]'
              }
            >
              {label}
            </span>
          )}
        </span>
      </div>
      {failed && (
        <p role="alert" className="text-destructive px-3.5 pb-1.5 text-xs">
          {t('errors.failed')}
        </p>
      )}
    </li>
  )
}
