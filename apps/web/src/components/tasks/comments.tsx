'use client'

import type { TaskCommentRow, TaskVisibility } from '@guestnote/db'
import { Button } from '@guestnote/ui/button'
import { InlineError } from '@guestnote/ui/inline-error'
import { useFormatter, useTranslations } from 'next-intl'
import { useId, useState, useTransition } from 'react'
import { addCommentAction } from '../../app/pro/(app)/weddings/[id]/tasks/actions.ts'
import { COMMENT_MAX } from './form.ts'
import { formatInstant } from './format.ts'

/**
 * A task's thread, oldest first, and the box to add to it.
 *
 * A comment's visibility is the task's, copied by a database trigger, so there is no toggle
 * here: what the form does is SAY which one applies, because the planner is about to type
 * something and needs to know whether the couple will read it.
 */
export function Comments({
  weddingId,
  taskId,
  visibility,
  comments,
}: {
  weddingId: string
  taskId: string
  visibility: TaskVisibility
  comments: TaskCommentRow[]
}) {
  const t = useTranslations('app.s2')
  const format = useFormatter()
  const uid = useId()
  const [body, setBody] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function submit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    startTransition(async () => {
      const result = await addCommentAction(weddingId, taskId, body)
      if (result.ok) setBody('')
      else setError(result.error)
    })
  }

  return (
    <section aria-labelledby={`${uid}-heading`} className="mt-6">
      <h2 id={`${uid}-heading`} className="mb-2 text-sm font-semibold">
        {t('comments.heading')}
      </h2>

      {comments.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t('comments.empty')}</p>
      ) : (
        <ol className="divide-border border-border bg-card divide-y rounded-[var(--radius)] border">
          {comments.map((c) => (
            <li key={c.id} className="px-4 py-3">
              <p className="flex items-baseline gap-2 text-[0.78rem]">
                <span className="font-semibold">{c.authorName ?? t('comments.unknownAuthor')}</span>
                <time
                  dateTime={c.createdAt.toISOString()}
                  className="text-muted-foreground font-mono text-[0.7rem] tabular-nums"
                >
                  {t('comments.utc', { date: formatInstant(format, c.createdAt) })}
                </time>
              </p>
              <p className="mt-1 text-sm whitespace-pre-wrap">{c.body}</p>
            </li>
          ))}
        </ol>
      )}

      <form onSubmit={submit} className="mt-3">
        <label htmlFor={`${uid}-body`} className="sr-only">
          {t('comments.label')}
        </label>
        <textarea
          id={`${uid}-body`}
          value={body}
          rows={2}
          maxLength={COMMENT_MAX}
          placeholder={t('comments.placeholder')}
          onChange={(e) => setBody(e.target.value)}
          aria-describedby={`${uid}-note`}
          className="border-input w-full rounded-[var(--radius)] border bg-transparent px-3 py-2 text-base"
        />
        <p id={`${uid}-note`} className="text-muted-foreground mt-1 text-xs">
          {t(visibility === 'internal' ? 'comments.internalNote' : 'comments.sharedNote')}
        </p>
        {error && <InlineError>{t(`errors.${error}`)}</InlineError>}
        <Button
          type="submit"
          busy={pending}
          busyLabel={t('comments.adding')}
          disabled={body.trim().length === 0}
          className="mt-2 w-auto! px-4"
        >
          {t('comments.add')}
        </Button>
      </form>
    </section>
  )
}
