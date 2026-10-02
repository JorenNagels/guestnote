'use client'

import type { TaskAssignee, TaskCommentRow, TaskRow } from '@guestnote/db'
import { Sheet } from '@guestnote/ui/sheet'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import type { TaskAnchorOption } from '../../lib/task-form.ts'
import { Comments } from './comments.tsx'
import { TaskDetail } from './task-detail.tsx'

/**
 * One task in a side sheet over the checklist (spec 0009 B1), addressed by `?task=<id>`.
 *
 * The page decides whether it is open, from the URL, so Back closes it and the address can be
 * sent to a colleague. Closing is `router.replace` to the same list without `task`, and not a
 * push: a push would leave the open task one Back away, so Back after closing would reopen it.
 *
 * It closes on the client first and asks the server second. Waiting for the new render before
 * the sheet goes would make Escape feel like a page load; unmounting at once also hands focus
 * back to the row link that opened it (the `Sheet`'s own return-focus). The page keys this by
 * the task id, so opening the next task starts open again rather than inheriting `closed`.
 *
 * The content is the task page's own -- `TaskDetail` and `Comments` -- so the two frames cannot
 * drift. Rejected: an intercepting and parallel route pair, which would give a modal over the
 * list for free but needs a second route tree; the query parameter is how this screen already
 * addresses its filter.
 */
export function TaskPanel({
  task,
  comments,
  coupleUserIds,
  weddingDate,
  events,
  staff,
  viewerId,
  today,
  closeHref,
}: {
  task: TaskRow
  comments: TaskCommentRow[]
  coupleUserIds: readonly string[]
  weddingDate: string | null
  events: readonly TaskAnchorOption[]
  staff: readonly TaskAssignee[]
  viewerId: string
  today: string
  /** The checklist as it was behind the panel: the same filter, no `task`. */
  closeHref: string
}) {
  const t = useTranslations('app.tasks')
  const router = useRouter()
  const [open, setOpen] = useState(true)

  return (
    <Sheet
      open={open}
      onClose={() => {
        setOpen(false)
        router.replace(closeHref, { scroll: false })
      }}
      title={t('panel.title')}
      closeLabel={t('panel.close')}
    >
      <TaskDetail
        task={task}
        weddingDate={weddingDate}
        events={events}
        staff={staff}
        viewerId={viewerId}
        today={today}
        inPanel
      />
      <Comments
        weddingId={task.weddingId}
        taskId={task.id}
        visibility={task.visibility}
        comments={comments}
        coupleUserIds={coupleUserIds}
      />
    </Sheet>
  )
}
