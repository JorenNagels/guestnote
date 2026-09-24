'use client'

import { LinkButton } from '@guestnote/ui/button'
import { InlineError } from '@guestnote/ui/inline-error'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { Done, StartUpload } from '../../lib/wedding-files.ts'
import { withoutExtension } from './format.ts'
import { uploadFile } from './upload.ts'
import { UploadZone, type UploadZoneLabels } from './upload-zone.tsx'

export type MoodTile = {
  readonly id: string
  /** The caption. It is `files.name`, so the file's own name until somebody writes a better one. */
  readonly name: string
  /** A signed GET that lives five minutes, or `null` when signing failed. */
  readonly url: string | null
}

export type MoodboardActions = {
  start(input: {
    name: string
    mime: string
    sizeBytes: number
    visibility: 'shared' | 'internal'
  }): Promise<StartUpload>
  confirm(fileId: string): Promise<Done>
  remove(fileId: string): Promise<Done>
  rename(fileId: string, name: string): Promise<Done>
}

export type MoodboardLabels = {
  title: string
  empty: { title: string; body: string }
  upload: UploadZoneLabels
  tileRemove: string
  tileRemoveConfirm: string
  tileRemoveYes: string
  tileCancel: string
  /** A template: `{name}` is the caption, so each tile's buttons are distinct by name. */
  aria: { remove: string; caption: string }
  captionField: string
  captionSave: string
  imageUnavailable: string
  errors: Readonly<Record<string, string>> & { unknown: string }
}

const fill = (template: string, name: string) => template.replace('{name}', name)

/**
 * The moodboard: image tiles, add, remove, caption. A native board (spec 0003): the couple's
 * reactions that the prototype hangs beside each tile are the couple portal's, a separate spec.
 *
 * Images are `<img>` and not `next/image`: `next.config.ts` turns the optimiser off (research/05
 * section 6), and the source is a signed URL that changes on every render, which would make
 * every render a cache miss in an optimiser anyway.
 */
export function MoodboardScreen({
  items,
  labels,
  actions,
}: {
  items: readonly MoodTile[]
  labels: MoodboardLabels
  actions: MoodboardActions
}) {
  const router = useRouter()
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [confirming, setConfirming] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [errors, setErrors] = useState<Readonly<Record<string, string>>>({})

  const message = (code: string) => labels.errors[code] ?? labels.errors.unknown

  const act = async (id: string, work: () => Promise<Done>) => {
    setBusy(id)
    setErrors(({ [id]: _dropped, ...rest }) => rest)
    try {
      const result = await work()
      if (!result.ok) {
        setErrors((e) => ({ ...e, [id]: message(result.error) }))
      } else {
        setEditing(null)
        setConfirming(null)
        router.refresh()
      }
    } catch {
      setErrors((e) => ({ ...e, [id]: message('network') }))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-6 pt-6 pb-8">
      <h2 className="text-xl font-semibold tracking-tight">{labels.title}</h2>

      <div className="mt-6">
        <UploadZone
          accept="image/*"
          labels={labels.upload}
          onDone={() => router.refresh()}
          upload={(file) =>
            uploadFile(
              file,
              { name: withoutExtension(file.name) || file.name, visibility: 'shared' },
              { start: actions.start, confirm: actions.confirm },
            )
          }
        />
      </div>

      {items.length === 0 ? (
        <div className="mt-6 rounded-[var(--radius)] border border-border bg-card px-6 py-10 text-center">
          <p className="font-medium">{labels.empty.title}</p>
          <p className="text-muted-foreground mx-auto mt-1.5 max-w-prose text-sm leading-relaxed">
            {labels.empty.body}
          </p>
        </div>
      ) : (
        <ul className="mt-6 grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2.5">
          {items.map((t) => {
            const error = errors[t.id]
            const isBusy = busy === t.id
            return (
              <li
                key={t.id}
                className="flex flex-col overflow-hidden rounded-[var(--radius)] border border-border bg-card"
              >
                {t.url ? (
                  // biome-ignore lint/performance/noImgElement: see the component comment
                  <img
                    src={t.url}
                    alt={t.name}
                    loading="lazy"
                    className="aspect-[4/3] w-full border-b border-border bg-muted object-cover"
                  />
                ) : (
                  <div className="text-muted-foreground bg-muted grid aspect-[4/3] place-items-center border-b border-border px-2 text-center text-xs">
                    {labels.imageUnavailable}
                  </div>
                )}

                <div className="flex flex-1 flex-col gap-2 px-3 py-2.5">
                  {editing === t.id ? (
                    <form
                      className="flex flex-col gap-1.5"
                      onSubmit={(e) => {
                        e.preventDefault()
                        void act(t.id, () => actions.rename(t.id, draft))
                      }}
                    >
                      <input
                        aria-label={labels.captionField}
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => e.key === 'Escape' && setEditing(null)}
                        // biome-ignore lint/a11y/noAutofocus: the person just chose to edit it
                        autoFocus
                        className="border-input h-9 w-full rounded-[var(--radius)] border bg-transparent px-2 text-sm"
                      />
                      <span className="flex gap-3">
                        <LinkButton type="submit" disabled={isBusy}>
                          {labels.captionSave}
                        </LinkButton>
                        <LinkButton onClick={() => setEditing(null)}>
                          {labels.tileCancel}
                        </LinkButton>
                      </span>
                    </form>
                  ) : (
                    <button
                      type="button"
                      aria-label={fill(labels.aria.caption, t.name)}
                      onClick={() => {
                        setDraft(t.name)
                        setEditing(t.id)
                      }}
                      className="cursor-pointer text-left text-[12.5px] leading-snug break-words hover:underline"
                    >
                      {t.name}
                    </button>
                  )}

                  {confirming === t.id ? (
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="text-xs">{labels.tileRemoveConfirm}</span>
                      <LinkButton
                        disabled={isBusy}
                        onClick={() => void act(t.id, () => actions.remove(t.id))}
                      >
                        {labels.tileRemoveYes}
                      </LinkButton>
                      <LinkButton onClick={() => setConfirming(null)}>
                        {labels.tileCancel}
                      </LinkButton>
                    </span>
                  ) : (
                    <span>
                      <LinkButton
                        disabled={isBusy}
                        aria-label={fill(labels.aria.remove, t.name)}
                        onClick={() => setConfirming(t.id)}
                      >
                        {labels.tileRemove}
                      </LinkButton>
                    </span>
                  )}
                  {error && <InlineError>{error}</InlineError>}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
