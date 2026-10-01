'use client'

import { InlineError } from '@guestnote/ui/inline-error'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { CommentThread, type ThreadComment, type ThreadCopy } from '../comment-thread.tsx'

export type PortalTask = {
  readonly id: string
  readonly title: string
  readonly notes: string | null
  /** Pre-formatted "Tegen 14 maart", or null for an undated task. */
  readonly due: string | null
  readonly done: boolean
  /** Theirs to tick. */
  readonly ours: boolean
  readonly commentCount: number
}

export type PortalTaskGroup = { readonly label: string; readonly tasks: readonly PortalTask[] }

export type PortalTasksCopy = {
  readonly done: string
  /** `{title}` */
  readonly markDone: string
  readonly tickFailed: string
  /** The comment link: none yet, one, and `{n}` for more. */
  readonly comments: { readonly none: string; readonly one: string; readonly other: string }
  readonly thread: ThreadCopy
}

/**
 * The couple's plan (spec 0008): groups of tasks, a checkbox only on their own ones, and a
 * comment thread that opens under a task. A failed tick reverts and says so -- nothing is left
 * looking done that is not.
 */
export function PortalTasks({
  groups,
  copy,
  readOnly,
  actions,
}: {
  groups: readonly PortalTaskGroup[]
  copy: PortalTasksCopy
  readOnly: boolean
  actions: {
    tick(taskId: string, done: boolean): Promise<boolean>
    thread(taskId: string): Promise<ThreadComment[] | null>
    comment(taskId: string, body: string): Promise<boolean>
    remove(commentId: string): Promise<boolean>
  }
}) {
  const router = useRouter()
  const [, start] = useTransition()
  const [ticked, setTicked] = useState<Readonly<Record<string, boolean>>>({})
  const [failed, setFailed] = useState<string | null>(null)
  const [open, setOpen] = useState<{ id: string; comments: ThreadComment[] } | null>(null)

  const reload = async (taskId: string) => {
    const list = await actions.thread(taskId)
    setOpen(list ? { id: taskId, comments: list } : null)
  }

  function tick(task: PortalTask) {
    const next = !(ticked[task.id] ?? task.done)
    setTicked((t) => ({ ...t, [task.id]: next }))
    setFailed(null)
    start(async () => {
      const ok = await actions.tick(task.id, next).catch(() => false)
      if (!ok) {
        setTicked(({ [task.id]: _dropped, ...rest }) => rest)
        setFailed(task.id)
        return
      }
      router.refresh()
    })
  }

  return (
    <div className="space-y-6">
      {groups.map((g) => (
        <section key={g.label}>
          <h2 className="text-muted-foreground mb-2 text-xs font-semibold tracking-[0.08em] uppercase">
            {g.label}
          </h2>
          <ul className="border-border bg-background m-0 list-none divide-y divide-border overflow-hidden rounded-[var(--radius-container)] border p-0">
            {g.tasks.map((task) => {
              const done = ticked[task.id] ?? task.done
              return (
                <li key={task.id} className="p-3.5">
                  <div className="flex items-start gap-3">
                    {task.ours && !readOnly ? (
                      <input
                        type="checkbox"
                        checked={done}
                        onChange={() => tick(task)}
                        aria-label={copy.markDone.replace('{title}', task.title)}
                        className="mt-0.5 size-6 flex-none accent-[color:var(--primary)]"
                      />
                    ) : (
                      <span aria-hidden="true" className="mt-0.5 size-6 flex-none" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className={done ? 'text-muted-foreground line-through' : ''}>
                        {task.title}
                        {done && <span className="sr-only"> · {copy.done}</span>}
                      </p>
                      {task.due && (
                        <p className="text-muted-foreground mt-0.5 text-xs">{task.due}</p>
                      )}
                      {task.notes && (
                        <p className="text-muted-foreground mt-1 text-sm whitespace-pre-wrap">
                          {task.notes}
                        </p>
                      )}
                      <button
                        type="button"
                        aria-expanded={open?.id === task.id}
                        onClick={() =>
                          open?.id === task.id ? setOpen(null) : void reload(task.id)
                        }
                        className="text-primary mt-1.5 min-h-8 text-sm underline underline-offset-[3px] print:hidden"
                      >
                        {countLabel(copy.comments, task.commentCount)}
                      </button>
                      {failed === task.id && <InlineError>{copy.tickFailed}</InlineError>}
                      {open?.id === task.id && (
                        <CommentThread
                          comments={open.comments}
                          copy={copy.thread}
                          readOnly={readOnly}
                          add={async (body) => {
                            const ok = await actions.comment(task.id, body)
                            if (ok) {
                              // Saved; a failed re-read must not report the save as failed.
                              await reload(task.id).catch(() => undefined)
                              router.refresh()
                            }
                            return ok
                          }}
                          remove={async (id) => {
                            const ok = await actions.remove(id)
                            if (ok) {
                              await reload(task.id).catch(() => undefined)
                              router.refresh()
                            }
                            return ok
                          }}
                        />
                      )}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}

export function countLabel(
  c: { readonly none: string; readonly one: string; readonly other: string },
  n: number,
): string {
  return n === 0 ? c.none : n === 1 ? c.one : c.other.replace('{n}', String(n))
}
