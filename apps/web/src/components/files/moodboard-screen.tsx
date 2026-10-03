'use client'

import { LinkButton } from '@guestnote/ui/button'
import { InlineError } from '@guestnote/ui/inline-error'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { BOARD_ACCEPT, isImageType } from '../../lib/board-items.ts'
import type { BoardDone } from '../../lib/moodboards.ts'
import type { Done, StartUpload } from '../../lib/wedding-files.ts'
import { CommentThread, type ThreadComment, type ThreadCopy } from '../couple/comment-thread.tsx'
import { PencilIcon } from '../nav/icons.tsx'
import { useToast } from '../toast/toast-provider.tsx'
import { type BoardActions, BoardBar, type BoardLabels, type Boards } from './board-bar.tsx'
import { DocPreview } from './doc-preview.tsx'
import { withoutExtension } from './format.ts'
import { openItem } from './open-item.ts'
import { uploadFile } from './upload.ts'
import { UploadZone, type UploadZoneLabels } from './upload-zone.tsx'

export type MoodTile = {
  readonly id: string
  /** The caption. It is `files.name`, so the file's own name until somebody writes a better one. */
  readonly name: string
  /**
   * A signed GET that lives five minutes, or `null` when signing failed -- and always `null` for
   * a document, which is drawn as an icon (`DocPreview`) and signed when it is opened.
   */
  readonly url: string | null
  /** `files.mime`. An image, a PDF or an Office file since 2026-10-04 (`lib/board-items.ts`). */
  readonly mime: string
  /** Formatted for the planner's locale; shown under a document's icon. */
  readonly size?: string | null | undefined
  /** Spec 0008: the couple's side of this image, when the caller may see it. */
  readonly couple?:
    | {
        readonly unread: boolean
        /** The uploader's name when it was the couple, else null. */
        readonly addedBy: string | null
        readonly commentCount: number
      }
    | undefined
}

/** Spec 0008: an image's comment thread. Optional so the vendor-free tests need not pass it. */
export type MoodboardComments = {
  list(fileId: string): Promise<ThreadComment[] | null>
  add(fileId: string, body: string): Promise<boolean>
  copy: ThreadCopy & {
    /** `{name}` */
    addedBy: string
    unread: string
    /** `{n}` */
    comments: string
  }
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
  /** The toast's Undo for `remove` (spec 0009 C4). */
  restore(fileId: string): Promise<Done>
  rename(fileId: string, name: string): Promise<Done>
  /** To another board of the same wedding (spec 0007). */
  move(fileId: string, boardId: string): Promise<BoardDone>
  /** A URL signed now, to open the item in (2026-10-04); `null` when it is gone. */
  open(fileId: string): Promise<string | null>
}

export type MoodboardLabels = {
  title: string
  empty: { title: string; body: string }
  upload: UploadZoneLabels
  tileRemove: string
  /** The toast after a remove. A template: `{name}` is the caption. */
  tileRemoved: string
  tileCancel: string
  /** A template: `{name}` is the caption, so each tile's buttons are distinct by name. */
  aria: { remove: string; caption: string; open: string }
  /** Under a tile whose file could not be opened. */
  openFailed: string
  captionField: string
  captionSave: string
  imageUnavailable: string
  /** "Verplaats naar…": the select's first, empty option, and its accessible name per tile. */
  moveTo: string
  moveAria: string
  boards: BoardLabels
  errors: Readonly<Record<string, string>> & { unknown: string }
}

// A replacer function, not the string: as a string, a name holding `$&` or `$'` is read as a
// replacement pattern and a file called 'Bloem $& Co' would come back as 'Bloem {name} Co'.
const fill = (template: string, name: string) => template.replace('{name}', () => name)

/**
 * The moodboard: named boards (spec 0007), and on the current one image tiles -- add, remove,
 * caption, move to another board. A native board (spec 0003). Spec 0008 adds the couple's side
 * when the page passes `comments`: who added an image, the unread dot, and a comment thread.
 * Since 2026-10-04 a tile may be a PDF or an Office file, drawn as an icon, and every tile opens:
 * an image or a PDF in a new tab, anything else as a download (`open-item.ts`).
 *
 * Images are `<img>` and not `next/image`: `next.config.ts` turns the optimiser off (research/05
 * section 6), and the source is a signed URL that changes on every render, which would make
 * every render a cache miss in an optimiser anyway.
 */
export function MoodboardScreen({
  items,
  labels,
  actions,
  boards,
  boardActions,
  comments,
}: {
  items: readonly MoodTile[]
  labels: MoodboardLabels
  actions: MoodboardActions
  boards: Boards
  boardActions: BoardActions
  comments?: MoodboardComments
}) {
  const router = useRouter()
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const toast = useToast()
  const [errors, setErrors] = useState<Readonly<Record<string, string>>>({})
  const [thread, setThread] = useState<{ id: string; comments: ThreadComment[] } | null>(null)

  const openThread = async (id: string) => {
    if (!comments) return
    if (thread?.id === id) {
      setThread(null)
      return
    }
    const list = await comments.list(id)
    setThread(list ? { id, comments: list } : null)
    // Opening it cleared the dot on the server; redraw so the tile agrees.
    if (list) router.refresh()
  }

  const message = (code: string) => labels.errors[code] ?? labels.errors.unknown

  const others = boards.list.filter((b) => b.id !== boards.current)

  // Not through `act`: opening changes nothing, so there is no refresh and no busy state, and
  // `openItem` must reach `window.open` before its first await -- it is called synchronously here.
  const open = async (t: MoodTile) => {
    setErrors(({ [t.id]: _dropped, ...rest }) => rest)
    if (!(await openItem(t.mime, () => actions.open(t.id)))) {
      setErrors((e) => ({ ...e, [t.id]: labels.openFailed }))
    }
  }

  const act = async (id: string, work: () => Promise<Done | BoardDone>, onDone?: () => void) => {
    setBusy(id)
    setErrors(({ [id]: _dropped, ...rest }) => rest)
    try {
      const result = await work()
      if (!result.ok) {
        setErrors((e) => ({ ...e, [id]: message(result.error) }))
      } else {
        setEditing(null)
        router.refresh()
        onDone?.()
      }
    } catch {
      setErrors((e) => ({ ...e, [id]: message('network') }))
    } finally {
      setBusy(null)
    }
  }

  /**
   * Spec 0009 C4: at once, then Undo -- an image is soft-deleted like a file (`removeFile`). The
   * undo refreshes the board itself, for the reason the Files screen gives. Deleting a whole
   * BOARD keeps its confirmation in `BoardBar`: `moodboards` has no `deleted_at`, the board row
   * is gone for good, and an undo that brought back the images without their board would be a
   * different thing from what was deleted.
   */
  const remove = (t: MoodTile) =>
    act(
      t.id,
      () => actions.remove(t.id),
      () =>
        toast.show({
          message: fill(labels.tileRemoved, t.name),
          undo: async () => {
            const back = await actions.restore(t.id)
            if (back.ok) {
              router.refresh()
              return 'restored'
            }
            return back.error === 'notFound' ? 'gone' : { message: message(back.error) }
          },
        }),
    )

  return (
    <div className="mx-auto max-w-5xl px-6 pt-6 pb-8">
      <h2 className="text-xl font-semibold tracking-tight">{labels.title}</h2>
      {/* Keyed by board: switching is a navigation to the same route, so without a key a rename
          or delete confirm begun on one board would still be open -- and aimed -- at the next. */}
      <BoardBar
        key={boards.current}
        boards={boards}
        actions={boardActions}
        labels={labels.boards}
      />

      <div className="mt-6">
        <UploadZone
          accept={BOARD_ACCEPT}
          labels={labels.upload}
          onDone={() => router.refresh()}
          upload={(file) =>
            uploadFile(
              file,
              {
                // An image's caption drops its extension (`IMG_2031`); a document keeps it,
                // because its name is also the name it is saved under, and a Word file saved
                // without `.docx` will not open.
                name: isImageType(file.type) ? withoutExtension(file.name) || file.name : file.name,
                visibility: 'shared',
              },
              { start: actions.start, confirm: actions.confirm },
            )
          }
        />
      </div>

      {items.length === 0 ? (
        <div className="mt-6 rounded-[var(--radius-container)] border border-border bg-card px-6 py-10 text-center">
          {/* With one board, S5's wording; with several, it says which one is empty. */}
          <p className="font-medium">
            {boards.list.length > 1 ? labels.boards.empty : labels.empty.title}
          </p>
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
                className="flex flex-col overflow-hidden rounded-[var(--radius-container)] border border-border bg-card"
              >
                <button
                  type="button"
                  aria-label={fill(labels.aria.open, t.name)}
                  onClick={() => void open(t)}
                  className="block w-full cursor-pointer border-b border-border"
                >
                  {!isImageType(t.mime) ? (
                    <DocPreview mime={t.mime} size={t.size} />
                  ) : t.url ? (
                    // biome-ignore lint/performance/noImgElement: see the component comment
                    <img
                      src={t.url}
                      alt={t.name}
                      loading="lazy"
                      className="block aspect-[4/3] w-full bg-muted object-cover"
                    />
                  ) : (
                    <span className="text-muted-foreground bg-muted grid aspect-[4/3] place-items-center px-2 text-center text-xs">
                      {labels.imageUnavailable}
                    </span>
                  )}
                </button>

                <div className="flex flex-1 flex-col gap-2 px-3 py-2.5">
                  {t.couple && comments && (t.couple.unread || t.couple.addedBy) && (
                    <p className="text-muted-foreground flex items-center gap-1.5 text-[11.5px]">
                      {t.couple.unread && (
                        <span className="flex-none" data-testid="couple-unread">
                          <span
                            aria-hidden="true"
                            className="bg-primary block size-2 rounded-full"
                          />
                          <span className="sr-only">{comments.copy.unread}</span>
                        </span>
                      )}
                      {t.couple.addedBy && fill(comments.copy.addedBy, t.couple.addedBy)}
                    </p>
                  )}
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
                      // `group` so the pencil can answer the button's own hover and focus. It is
                      // always in the DOM and only its opacity changes, so the caption does not
                      // reflow as the pointer crosses the grid (spec 0009 C4, report 13b). A
                      // screen with no hover (a phone) shows it always: there is nothing to reveal it.
                      className="group flex cursor-pointer items-start gap-1.5 text-left text-[12.5px] leading-snug break-words hover:underline"
                    >
                      <span className="min-w-0">{t.name}</span>
                      <PencilIcon className="text-muted-foreground mt-px size-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 [@media(hover:none)]:opacity-100" />
                    </button>
                  )}

                  <span>
                    <LinkButton
                      disabled={isBusy}
                      aria-label={fill(labels.aria.remove, t.name)}
                      onClick={() => void remove(t)}
                    >
                      {labels.tileRemove}
                    </LinkButton>
                  </span>
                  {others.length > 0 && (
                    <select
                      aria-label={fill(labels.moveAria, t.name)}
                      value=""
                      disabled={isBusy}
                      onChange={(e) => {
                        const to = e.target.value
                        if (to) void act(t.id, () => actions.move(t.id, to))
                      }}
                      className="border-input text-muted-foreground h-8 w-full rounded-[var(--radius)] border bg-transparent px-1.5 text-xs"
                    >
                      <option value="">{labels.moveTo}</option>
                      {others.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  )}
                  {comments && (
                    <span>
                      <LinkButton
                        aria-expanded={thread?.id === t.id}
                        onClick={() => void openThread(t.id)}
                      >
                        {comments.copy.comments.replace('{n}', String(t.couple?.commentCount ?? 0))}
                      </LinkButton>
                    </span>
                  )}
                  {comments && thread?.id === t.id && (
                    <CommentThread
                      comments={thread.comments}
                      copy={comments.copy}
                      add={async (body) => {
                        const ok = await comments.add(t.id, body)
                        if (ok) {
                          // Saved; a failed re-read must not report the save as failed.
                          const list = await comments.list(t.id).catch(() => null)
                          if (list) setThread({ id: t.id, comments: list })
                          router.refresh()
                        }
                        return ok
                      }}
                    />
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
