'use client'

import { Button } from '@guestnote/ui/button'
import { InlineError } from '@guestnote/ui/inline-error'
import { Pill } from '@guestnote/ui/pill'
import { useId, useState, useTransition } from 'react'

export type ThreadComment = {
  readonly id: string
  readonly author: string
  /** Draw the "Koppel" chip beside the author. */
  readonly byCouple: boolean
  /** The reader wrote it, so it may be deleted (when `remove` is given). */
  readonly isOwn: boolean
  readonly body: string
  /** Pre-formatted in the reader's locale. */
  readonly when: string
}

export type ThreadCopy = {
  readonly empty: string
  readonly placeholder: string
  readonly send: string
  readonly sending: string
  readonly remove: string
  readonly failed: string
  readonly tooLong: string
  readonly couple: string
}

/** 4000, `COMMENT_MAX`: the database functions refuse more (migration 0013). */
const MAX = 4000

/**
 * A comment thread, oldest first, and the box to add to it (spec 0008): on a moodboard image for
 * staff and couple alike, and on a task in the couple's portal. The caller owns the data and
 * refreshes after a write; this only draws and submits. `readOnly` (an archived wedding) hides
 * the box and the deletes, and keeps the thread.
 */
export function CommentThread({
  comments,
  copy,
  add,
  remove,
  readOnly = false,
}: {
  comments: readonly ThreadComment[]
  copy: ThreadCopy
  add(body: string): Promise<boolean>
  remove?: (id: string) => Promise<boolean>
  readOnly?: boolean
}) {
  const uid = useId()
  const [body, setBody] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, start] = useTransition()

  function submit(event: React.FormEvent) {
    event.preventDefault()
    const text = body.trim()
    if (!text) return
    if (text.length > MAX) {
      setError(copy.tooLong)
      return
    }
    setError(null)
    start(async () => {
      if (await add(text).catch(() => false)) setBody('')
      else setError(copy.failed)
    })
  }

  return (
    <div className="mt-2">
      {comments.length === 0 ? (
        <p className="text-muted-foreground text-sm">{copy.empty}</p>
      ) : (
        <ol className="divide-border m-0 list-none divide-y p-0">
          {comments.map((c) => (
            <li key={c.id} className="py-2">
              <p className="flex flex-wrap items-baseline gap-2 text-[0.78rem]">
                <span className="font-semibold">{c.author}</span>
                {c.byCouple && <Pill tone="accent">{copy.couple}</Pill>}
                <span className="text-muted-foreground text-[0.7rem]">{c.when}</span>
                {c.isOwn && remove && !readOnly && (
                  <button
                    type="button"
                    className="text-muted-foreground ml-auto text-xs underline underline-offset-2"
                    onClick={() =>
                      start(async () => {
                        if (!(await remove(c.id).catch(() => false))) setError(copy.failed)
                      })
                    }
                  >
                    {copy.remove}
                  </button>
                )}
              </p>
              <p className="mt-0.5 text-sm whitespace-pre-wrap break-words">{c.body}</p>
            </li>
          ))}
        </ol>
      )}
      {!readOnly && (
        <form onSubmit={submit} className="mt-2">
          <label htmlFor={`${uid}-body`} className="sr-only">
            {copy.placeholder}
          </label>
          <textarea
            id={`${uid}-body`}
            value={body}
            rows={2}
            maxLength={MAX}
            placeholder={copy.placeholder}
            onChange={(e) => setBody(e.target.value)}
            className="border-input w-full rounded-[var(--radius-container)] border bg-transparent px-3 py-2 text-base"
          />
          {error && <InlineError>{error}</InlineError>}
          <Button
            type="submit"
            busy={busy}
            busyLabel={copy.sending}
            disabled={body.trim().length === 0}
            className="mt-1.5 w-auto!"
          >
            {copy.send}
          </Button>
        </form>
      )}
    </div>
  )
}
