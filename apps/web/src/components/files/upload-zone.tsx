'use client'

import { Button } from '@guestnote/ui/button'
import { cx } from '@guestnote/ui/cx'
import { InlineError } from '@guestnote/ui/inline-error'
import { LiveRegion } from '@guestnote/ui/live-region'
import { type DragEvent, type ReactNode, useRef, useState } from 'react'
import { inPool, type UploadError, type UploadOutcome } from './upload.ts'

export type UploadZoneLabels = {
  button: string
  hint: string
  uploading: string
  dismiss: string
  /** One sentence per failure. `unknown` covers a code this build has no sentence for. */
  errors: Readonly<Record<UploadError | 'unknown', string>>
}

type Entry = {
  readonly id: number
  readonly name: string
  readonly error: UploadError | null
}

/**
 * The upload control both screens share: a button, a drop area, and one line per file in flight
 * or failed. It knows nothing about what a file is *for*; `upload` is handed one `File` and
 * answers with the outcome, so the Files screen and the moodboard differ only in what they pass.
 *
 * A failed file stays listed with its reason until dismissed, because on a venue connection the
 * planner has walked away from the screen by the time it fails, and a toast would be gone.
 * `onDone` fires once per batch, after at least one file made it, so the page refreshes once and
 * not per file.
 */
export function UploadZone({
  accept,
  labels,
  upload,
  onDone,
  children,
}: {
  accept?: string
  labels: UploadZoneLabels
  upload: (file: File) => Promise<UploadOutcome>
  onDone: () => void
  /** Sits beside the button: the Files screen's "internal only" checkbox. */
  children?: ReactNode
}) {
  const input = useRef<HTMLInputElement>(null)
  const seq = useRef(0)
  const [entries, setEntries] = useState<readonly Entry[]>([])
  const [over, setOver] = useState(false)
  const [announce, setAnnounce] = useState('')

  const run = async (list: readonly File[]) => {
    if (list.length === 0) return
    const batch = list.map((file) => ({ file, id: seq.current++ }))
    setEntries((all) => [
      ...all,
      ...batch.map((b) => ({ id: b.id, name: b.file.name, error: null })),
    ])
    setAnnounce(labels.uploading)

    let anyOk = false
    await inPool(batch, async ({ file, id }) => {
      const outcome = await upload(file)
      if (outcome.ok) {
        anyOk = true
        setEntries((all) => all.filter((e) => e.id !== id))
      } else {
        setEntries((all) => all.map((e) => (e.id === id ? { ...e, error: outcome.error } : e)))
      }
    })
    setAnnounce('')
    if (anyOk) onDone()
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setOver(false)
    void run(Array.from(e.dataTransfer.files))
  }

  return (
    <section
      aria-label={labels.button}
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
      className={cx(
        'rounded-[var(--radius)] border border-dashed px-4 py-4 transition-colors',
        over ? 'border-foreground bg-muted' : 'border-input',
      )}
    >
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <div className="w-full sm:w-auto">
          <Button className="px-4" onClick={() => input.current?.click()}>
            {labels.button}
          </Button>
        </div>
        {children}
        <p className="text-muted-foreground min-w-0 flex-1 text-xs leading-relaxed">
          {labels.hint}
        </p>
      </div>

      {/* Visually hidden, not `display: none`: the button above opens it, and this stays the
          real control for anything that drives the page without a pointer. */}
      <input
        ref={input}
        type="file"
        multiple
        accept={accept}
        tabIndex={-1}
        aria-hidden="true"
        data-testid="upload-input"
        className="sr-only"
        onChange={(e) => {
          const picked = Array.from(e.target.files ?? [])
          // Cleared so choosing the same file again fires `change`.
          e.target.value = ''
          void run(picked)
        }}
      />

      {entries.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1.5">
          {entries.map((e) => (
            <li key={e.id} className="text-sm">
              <div className="flex items-baseline gap-2">
                <span className="min-w-0 flex-1 truncate">{e.name}</span>
                {e.error ? (
                  <button
                    type="button"
                    onClick={() => setEntries((all) => all.filter((x) => x.id !== e.id))}
                    className="text-muted-foreground cursor-pointer text-xs underline underline-offset-[3px]"
                  >
                    {labels.dismiss}
                  </button>
                ) : (
                  <span className="text-muted-foreground text-xs">{labels.uploading}</span>
                )}
              </div>
              {e.error && (
                <InlineError>{labels.errors[e.error] ?? labels.errors.unknown}</InlineError>
              )}
            </li>
          ))}
        </ul>
      )}
      <LiveRegion message={announce} />
    </section>
  )
}
