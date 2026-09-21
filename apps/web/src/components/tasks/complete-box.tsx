'use client'

import { useTranslations } from 'next-intl'
import { useOptimistic, useTransition } from 'react'
import { setTaskDoneAction } from '../../app/pro/(app)/weddings/[id]/tasks/actions.ts'

/**
 * The tick box, on the row and on the detail.
 *
 * Optimistic: the box flips at once and the server answer only ever CORRECTS it. A checklist
 * that waits a round trip per tick loses to a spreadsheet, and the action is a one-row update
 * that fails only for a task that vanished. `useOptimistic` snaps back to the prop when the
 * transition ends, so a failed write needs no undo code; `onFail` is how the caller says so.
 *
 * The label names the task ("Mark as done: Book the DJ"), which a bare checkbox beside a
 * link would leave for the reader to pair up. A native input, not a styled button with
 * `role="checkbox"`: the browser supplies the keyboard and the checked state.
 */
export function CompleteBox({
  weddingId,
  taskId,
  title,
  done,
  onFail,
}: {
  weddingId: string
  taskId: string
  title: string
  done: boolean
  onFail?: () => void
}) {
  const t = useTranslations('app.s2')
  const [optimistic, setOptimistic] = useOptimistic(done)
  const [, startTransition] = useTransition()

  return (
    <input
      type="checkbox"
      checked={optimistic}
      aria-label={t(optimistic ? 'row.reopen' : 'row.complete', { title })}
      className="accent-primary size-[18px] flex-none cursor-pointer"
      onChange={() => {
        const next = !optimistic
        startTransition(async () => {
          setOptimistic(next)
          const result = await setTaskDoneAction(weddingId, taskId, next)
          if (!result.ok) onFail?.()
        })
      }}
    />
  )
}
