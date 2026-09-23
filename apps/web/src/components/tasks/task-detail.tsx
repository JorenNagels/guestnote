'use client'

import type { TaskRow } from '@guestnote/db'
import { Button } from '@guestnote/ui/button'
import { InlineError } from '@guestnote/ui/inline-error'
import { Pill } from '@guestnote/ui/pill'
import Link from 'next/link'
import { useFormatter, useTranslations } from 'next-intl'
import { useState, useTransition } from 'react'
import { setTaskVisibilityAction } from '../../app/pro/(app)/weddings/[id]/tasks/actions.ts'
import { app } from '../../lib/routes.ts'
import { formFromTask } from '../../lib/task-form.ts'
import { isOverdue } from './buckets.ts'
import { CompleteBox } from './complete-box.tsx'
import { formatDate, labelText } from './format.ts'
import { dueLabel, ruleLabel } from './labels.ts'
import { TaskForm } from './task-form.tsx'
import { VisibilityTag } from './visibility-tag.tsx'

/**
 * The task detail card, and the edit form that swaps into its place.
 *
 * The Due row and the Rule row sit side by side on purpose (spec 0003, "offset and resolved
 * date side by side"): the stored value is an offset, the date is derived, and a planner who
 * sees only one of them cannot check the other.
 */
export function TaskDetail({
  task,
  weddingDate,
  today,
}: {
  task: TaskRow
  weddingDate: string | null
  today: string
}) {
  const t = useTranslations('app.tasks')
  const format = useFormatter()
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  if (editing) {
    return (
      <TaskForm
        weddingId={task.weddingId}
        taskId={task.id}
        weddingDate={weddingDate}
        initial={formFromTask(task)}
        onDone={() => setEditing(false)}
        onCancel={() => setEditing(false)}
      />
    )
  }

  const done = task.status === 'done'
  const overdue = isOverdue(task, today)
  const relative = labelText(t, dueLabel(task, today))
  const rule = labelText(t, ruleLabel(task))
  const assignee =
    task.assigneeRole === 'couple'
      ? t('row.couple')
      : task.assigneeRole === 'planner'
        ? (task.assigneeName ?? t('row.planner'))
        : t('detail.unassigned')

  function toggleVisibility() {
    setError(null)
    startTransition(async () => {
      const result = await setTaskVisibilityAction(
        task.weddingId,
        task.id,
        task.visibility === 'internal' ? 'shared' : 'internal',
      )
      if (!result.ok) setError(result.error)
    })
  }

  return (
    <div>
      <Link
        href={app.weddingTasks(task.weddingId)}
        className="text-muted-foreground mb-4 inline-flex items-center gap-1 text-[0.78rem] hover:underline"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="size-3.5"
        >
          <path d="M15 6l-6 6 6 6" />
        </svg>
        {t('detail.back')}
      </Link>

      <div className="border-border bg-card rounded-[var(--radius)] border">
        <div className="flex items-center gap-3 px-4 py-3.5">
          <CompleteBox
            weddingId={task.weddingId}
            taskId={task.id}
            title={task.title}
            done={done}
            onFail={() => setError('failed')}
          />
          <h1
            className={
              done
                ? 'text-muted-foreground min-w-0 flex-1 text-lg font-semibold line-through'
                : 'min-w-0 flex-1 text-lg font-semibold'
            }
          >
            {task.title}
          </h1>
          {task.status === 'in_progress' && <Pill tone="accent">{t('row.inProgress')}</Pill>}
          <Button
            variant="secondary"
            onClick={() => setEditing(true)}
            className="h-8! w-auto! px-3 text-[0.78rem]"
          >
            {t('detail.edit')}
          </Button>
        </div>

        <dl className="border-border grid grid-cols-[8rem_1fr] gap-x-4 gap-y-2.5 border-t px-4 py-3.5 text-sm">
          <dt className="text-muted-foreground">{t('detail.due')}</dt>
          <dd>
            {task.dueDate !== null ? (
              <time
                dateTime={task.dueDate}
                className={
                  overdue
                    ? 'text-destructive font-mono font-semibold tabular-nums'
                    : 'font-mono tabular-nums'
                }
              >
                {formatDate(format, task.dueDate)}
              </time>
            ) : (
              <span className="text-muted-foreground">
                {task.dueOffsetDays !== null ? t('row.noWeddingDate') : t('row.noDue')}
              </span>
            )}
            {relative && task.dueDate !== null && (
              <span className={overdue ? 'text-destructive' : 'text-muted-foreground'}>
                {' · '}
                {relative}
              </span>
            )}
          </dd>

          {rule && (
            <>
              <dt className="text-muted-foreground">{t('detail.rule')}</dt>
              <dd>{rule}</dd>
            </>
          )}

          <dt className="text-muted-foreground">{t('detail.assignedTo')}</dt>
          <dd>{assignee}</dd>

          <dt className="text-muted-foreground">{t('detail.visibility')}</dt>
          <dd className="flex flex-wrap items-center gap-3">
            <VisibilityTag visibility={task.visibility} />
            <button
              type="button"
              onClick={toggleVisibility}
              disabled={pending}
              className="text-muted-foreground enabled:hover:text-foreground text-xs underline underline-offset-[3px] enabled:cursor-pointer"
            >
              {t(task.visibility === 'internal' ? 'detail.makeShared' : 'detail.makeInternal')}
            </button>
          </dd>

          {task.notes && (
            <>
              <dt className="text-muted-foreground">{t('detail.notes')}</dt>
              <dd className="whitespace-pre-wrap">{task.notes}</dd>
            </>
          )}

          {done && task.completedAt && (
            <>
              <dt className="sr-only">{t('buckets.done')}</dt>
              <dd className="text-muted-foreground col-span-2 text-xs">
                {t('detail.completedAt', {
                  date: format.dateTime(task.completedAt, {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                    timeZone: 'UTC',
                  }),
                })}
              </dd>
            </>
          )}
        </dl>
        {error && (
          <div className="px-4 pb-3">
            <InlineError>{t(`errors.${error}`)}</InlineError>
          </div>
        )}
      </div>
    </div>
  )
}
