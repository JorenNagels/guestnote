'use client'

import { Button } from '@guestnote/ui/button'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { Done, StartUpload } from '../../../lib/wedding-files.ts'
import { withoutExtension } from '../../files/format.ts'
import { uploadFile } from '../../files/upload.ts'
import { UploadZone, type UploadZoneLabels } from '../../files/upload-zone.tsx'
import { CommentThread, type ThreadComment, type ThreadCopy } from '../comment-thread.tsx'
import { countLabel } from './portal-tasks.tsx'

export type PortalTile = {
  readonly id: string
  readonly name: string
  readonly url: string | null
  /** "Toegevoegd door Anna", already filled, or null for the planner's own images. */
  readonly addedBy: string | null
  readonly isOwn: boolean
  readonly commentCount: number
}

export type PortalBoardCopy = {
  readonly empty: string
  readonly remove: string
  readonly imageUnavailable: string
  readonly upload: UploadZoneLabels
  readonly comments: { readonly none: string; readonly one: string; readonly other: string }
  readonly thread: ThreadCopy
}

/**
 * One shared board in the couple's portal (spec 0008): the grid, the upload control, and under
 * each image its comment thread. The couple deletes only what they added. On an archived
 * wedding (`readOnly`) there is no upload, no delete and no comment box -- only the looking.
 *
 * `<img>` and not `next/image`, for the reason `files/moodboard-screen.tsx` gives.
 */
export function PortalBoard({
  tiles,
  copy,
  readOnly,
  actions,
}: {
  tiles: readonly PortalTile[]
  copy: PortalBoardCopy
  readOnly: boolean
  actions: {
    start(input: {
      name: string
      mime: string
      sizeBytes: number
      visibility: 'shared' | 'internal'
    }): Promise<StartUpload>
    confirm(fileId: string): Promise<Done>
    remove(fileId: string): Promise<boolean>
    thread(fileId: string): Promise<ThreadComment[] | null>
    comment(fileId: string, body: string): Promise<boolean>
    removeComment(commentId: string): Promise<boolean>
  }
}) {
  const router = useRouter()
  const [open, setOpen] = useState<{ id: string; comments: ThreadComment[] } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const reload = async (fileId: string) => {
    const list = await actions.thread(fileId)
    setOpen(list ? { id: fileId, comments: list } : null)
  }

  return (
    <div>
      {!readOnly && (
        <div className="mb-4 print:hidden">
          <UploadZone
            accept="image/*"
            labels={copy.upload}
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
      )}
      {tiles.length === 0 ? (
        <p className="text-muted-foreground border-border bg-background rounded-[var(--radius-container)] border p-6 text-center text-sm">
          {copy.empty}
        </p>
      ) : (
        <ul className="m-0 grid list-none grid-cols-2 gap-2.5 p-0 sm:grid-cols-3">
          {tiles.map((t) => (
            <li
              key={t.id}
              className="border-border bg-background flex flex-col overflow-hidden rounded-[var(--radius-container)] border"
            >
              {t.url ? (
                // biome-ignore lint/performance/noImgElement: see the component comment
                <img
                  src={t.url}
                  alt={t.name}
                  loading="lazy"
                  className="bg-muted aspect-[4/3] w-full object-cover"
                />
              ) : (
                <div className="bg-muted text-muted-foreground grid aspect-[4/3] place-items-center px-2 text-center text-xs">
                  {copy.imageUnavailable}
                </div>
              )}
              <div className="flex flex-1 flex-col gap-1.5 p-2.5">
                <p className="text-[12.5px] leading-snug break-words">{t.name}</p>
                {t.addedBy && <p className="text-muted-foreground text-[11.5px]">{t.addedBy}</p>}
                <button
                  type="button"
                  aria-expanded={open?.id === t.id}
                  onClick={() => (open?.id === t.id ? setOpen(null) : void reload(t.id))}
                  className="text-primary min-h-8 text-left text-sm underline underline-offset-[3px]"
                >
                  {countLabel(copy.comments, t.commentCount)}
                </button>
                {t.isOwn && !readOnly && (
                  <Button
                    type="button"
                    variant="secondary"
                    busy={busy === t.id}
                    onClick={async () => {
                      setBusy(t.id)
                      if (await actions.remove(t.id).catch(() => false)) router.refresh()
                      setBusy(null)
                    }}
                  >
                    {copy.remove}
                  </Button>
                )}
              </div>
              {open?.id === t.id && (
                <div className="border-border border-t px-2.5 pb-2.5">
                  <CommentThread
                    comments={open.comments}
                    copy={copy.thread}
                    readOnly={readOnly}
                    add={async (body) => {
                      const ok = await actions.comment(t.id, body)
                      if (ok) {
                        // Saved; a failed re-read must not report the save as failed.
                        await reload(t.id).catch(() => undefined)
                        router.refresh()
                      }
                      return ok
                    }}
                    remove={async (id) => {
                      const ok = await actions.removeComment(id)
                      if (ok) {
                        await reload(t.id).catch(() => undefined)
                        router.refresh()
                      }
                      return ok
                    }}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
