'use client'

import type { AssignedTaskRow } from '@guestnote/db'
import Link from 'next/link'
import { useFormatter, useTranslations } from 'next-intl'
import { useState } from 'react'
import { app } from '../../lib/routes.ts'
import { isOverdue } from '../tasks/buckets.ts'
import { CompleteBox } from '../tasks/complete-box.tsx'
import { formatDate, labelText } from '../tasks/format.ts'
import { dueLabel } from '../tasks/labels.ts'
import { VisibilityTag } from '../tasks/visibility-tag.tsx'

/**
 * One row of a Today list.
 *
 * It borrows the checklist's pieces rather than its row: `TaskRowView` names the owner (always
 * the reader here, so it says nothing) and has no room for the wedding, which is the one thing
 * a cross-wedding list needs. The tick box is S2's, so it is the same write through the same
 * action, and an internal task says so in words for the reason `VisibilityTag` gives.
 *
 * A shared task carries no tag at all: on a list where most rows are shared, a tag on every one
 * is noise, and the exception is what needs marking. Rows read `app.tasks` -- mounted by
 * `TasksIntl` in the page, which is why this file has no provider of its own.
 */
export function TodayTaskRow({ task, today }: { task: AssignedTaskRow; today: string }) {
  const t = useTranslations('app.tasks')
  const format = useFormatter()
  const [failed, setFailed] = useState(false)

  const overdue = isOverdue(task, today)
  const label = labelText(t, dueLabel(task, today))
  const tone = overdue ? 'text-destructive' : 'text-muted-foreground'

  return (
    <li className="border-border min-h-[var(--row-h)] border-t first:border-t-0">
      <div className="flex items-center gap-3 px-3.5 py-1.5">
        <CompleteBox
          weddingId={task.weddingId}
          taskId={task.id}
          title={task.title}
          done={false}
          onFail={() => setFailed(true)}
        />
        <span className="min-w-0 flex-1 py-0.5">
          <Link
            href={app.weddingTask(task.weddingId, task.id)}
            className="block truncate text-[0.84rem] hover:underline"
          >
            {task.title}
          </Link>
          <Link
            href={app.wedding(task.weddingId)}
            className="text-muted-foreground mt-0.5 block truncate text-[0.72rem] hover:underline"
          >
            {task.weddingName}
          </Link>
        </span>
        {task.visibility === 'internal' && (
          <span className="hidden flex-none sm:block">
            <VisibilityTag visibility="internal" />
          </span>
        )}
        <span className="w-[7.5rem] flex-none text-right">
          {task.dueDate !== null && (
            <time
              dateTime={task.dueDate}
              className={`block font-mono text-[0.72rem] tabular-nums ${overdue ? 'text-destructive font-semibold' : ''}`}
            >
              {formatDate(format, task.dueDate)}
            </time>
          )}
          {label && <span className={`mt-px block text-[0.66rem] ${tone}`}>{label}</span>}
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
