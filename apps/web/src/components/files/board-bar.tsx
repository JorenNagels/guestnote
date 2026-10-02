'use client'

import type { BoardRow } from '@guestnote/db'
import { Button, LinkButton } from '@guestnote/ui/button'
import { InlineError } from '@guestnote/ui/inline-error'
import { Sheet } from '@guestnote/ui/sheet'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useId, useState } from 'react'
import type { BoardCreated, BoardDone } from '../../lib/moodboards.ts'
import { app } from '../../lib/routes.ts'

export type BoardVendor = {
  /** `wedding_vendors.id` -- what a share names. */
  readonly id: string
  readonly name: string
  readonly category: string
  /** Whether a live link exists; `null` when the caller cannot see links (a member). */
  readonly hasLink: boolean | null
}

export type Boards = {
  readonly list: readonly BoardRow[]
  readonly current: string
  /** The links are built here from it: a server page cannot hand a client a function. */
  readonly weddingId: string
  readonly vendors: readonly BoardVendor[]
}

export type BoardActions = {
  create(name: string): Promise<BoardCreated>
  rename(boardId: string, name: string): Promise<BoardDone>
  remove(boardId: string): Promise<BoardDone>
  share(boardId: string, weddingVendorIds: string[]): Promise<BoardDone>
  shareCouple(boardId: string, shared: boolean): Promise<BoardDone>
}

export type BoardLabels = {
  switcher: string
  new: string
  newName: string
  nameField: string
  save: string
  cancel: string
  rename: string
  sharedWith: string
  notShared: string
  share: string
  shareTitle: string
  shareCouple: string
  shareCoupleHint: string
  shareNoLink: string
  shareNoVendors: string
  couple: string
  close: string
  delete: string
  /** `{count}` is the number of images that go with the board. */
  deleteConfirm: string
  deleteConfirmEmpty: string
  deleteYes: string
  /** The empty state's title once a wedding has more than one board. */
  empty: string
  errors: Readonly<Record<string, string>> & { unknown: string }
}

/**
 * The board switcher and the current board's header (spec 0007): rename, delete, and "Delen".
 *
 * Boards are links (`?bord=<id>`), not client state, so the server renders the chosen board's
 * images and a reload lands on it. On a phone the pills become one `<select>`, because six named
 * boards do not fit a 360 px row and a horizontal scroller hides the one you want.
 *
 * The share sheet saves on every tick rather than on a Save button: a checklist of who can see
 * a board is read as the state of the world, and a "Save" a planner forgets would leave it lying.
 */
export function BoardBar({
  boards,
  actions,
  labels,
}: {
  boards: Boards
  actions: BoardActions
  labels: BoardLabels
}) {
  const router = useRouter()
  const formId = useId()
  const board = boards.list.find((b) => b.id === boards.current)
  const [mode, setMode] = useState<'idle' | 'creating' | 'renaming' | 'deleting' | 'sharing'>(
    'idle',
  )
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!board) return null
  const href = (boardId: string) => app.weddingMoodboard(boards.weddingId, boardId)

  const message = (code: string) => labels.errors[code] ?? labels.errors.unknown
  const run = async <R extends { ok: boolean }>(
    work: () => Promise<R>,
    then: (r: R) => void,
  ): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      const r = await work()
      if (r.ok) then(r)
      else setError(message('error' in r ? String(r.error) : 'unknown'))
    } catch {
      setError(message('network'))
    } finally {
      setBusy(false)
    }
  }

  const audience = [
    ...(board.sharedWithCouple ? [labels.couple] : []),
    ...boards.vendors.filter((v) => board.sharedWith.includes(v.id)).map((v) => v.name),
  ]

  return (
    <div className="mt-4">
      {/* Switcher: pills from `sm`, a select below it. */}
      <nav aria-label={labels.switcher} className="hidden flex-wrap gap-1.5 sm:flex">
        {boards.list.map((b) => (
          <Link
            key={b.id}
            href={href(b.id)}
            aria-current={b.id === board.id ? 'page' : undefined}
            className={`rounded-full border px-3 py-1 text-sm ${
              b.id === board.id
                ? 'border-foreground bg-foreground text-background'
                : 'border-border hover:bg-muted'
            }`}
          >
            {b.name} <span className="tabular-nums opacity-70">{b.imageCount}</span>
          </Link>
        ))}
        <button
          type="button"
          onClick={() => {
            setDraft(labels.newName)
            setMode('creating')
          }}
          className="border-border text-muted-foreground hover:bg-muted rounded-full border border-dashed px-3 py-1 text-sm"
        >
          {labels.new}
        </button>
      </nav>
      <div className="flex gap-2 sm:hidden">
        <select
          aria-label={labels.switcher}
          value={board.id}
          onChange={(e) => router.push(href(e.target.value))}
          className="border-input h-10 min-w-0 flex-1 rounded-[var(--radius)] border bg-transparent px-2 text-sm"
        >
          {boards.list.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name} ({b.imageCount})
            </option>
          ))}
        </select>
        <Button
          variant="secondary"
          onClick={() => {
            setDraft(labels.newName)
            setMode('creating')
          }}
        >
          {labels.new}
        </Button>
      </div>

      {mode === 'creating' && (
        <NameForm
          id={`${formId}-new`}
          labels={labels}
          value={draft}
          busy={busy}
          onChange={setDraft}
          onCancel={() => setMode('idle')}
          onSubmit={() =>
            void run(
              () => actions.create(draft),
              (r) => {
                setMode('idle')
                if ('id' in r && typeof r.id === 'string') router.push(href(r.id))
              },
            )
          }
        />
      )}

      {/* The current board's header. */}
      <div className="border-border mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b pb-3">
        <div className="min-w-0">
          {mode === 'renaming' ? (
            <NameForm
              id={`${formId}-rename`}
              labels={labels}
              value={draft}
              busy={busy}
              onChange={setDraft}
              onCancel={() => setMode('idle')}
              onSubmit={() =>
                void run(
                  () => actions.rename(board.id, draft),
                  () => {
                    setMode('idle')
                    router.refresh()
                  },
                )
              }
            />
          ) : (
            <button
              type="button"
              aria-label={labels.rename.replace('{name}', () => board.name)}
              onClick={() => {
                setDraft(board.name)
                setMode('renaming')
              }}
              className="cursor-pointer text-left text-base font-semibold hover:underline"
            >
              {board.name}
            </button>
          )}
          <p className="text-muted-foreground mt-0.5 text-xs">
            {audience.length > 0
              ? labels.sharedWith.replace('{names}', audience.join(' · '))
              : labels.notShared}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {mode === 'deleting' ? (
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="text-sm">
                {board.imageCount > 0
                  ? labels.deleteConfirm.replace('{count}', String(board.imageCount))
                  : labels.deleteConfirmEmpty}
              </span>
              <LinkButton
                disabled={busy}
                onClick={() =>
                  void run(
                    () => actions.remove(board.id),
                    () => {
                      setMode('idle')
                      const fallback = boards.list.find((b) => b.isDefault)
                      if (fallback) router.push(href(fallback.id))
                    },
                  )
                }
              >
                {labels.deleteYes}
              </LinkButton>
              <LinkButton onClick={() => setMode('idle')}>{labels.cancel}</LinkButton>
            </span>
          ) : (
            !board.isDefault && (
              <LinkButton onClick={() => setMode('deleting')}>{labels.delete}</LinkButton>
            )
          )}
          <Button variant="secondary" onClick={() => setMode('sharing')}>
            {labels.share}
          </Button>
        </div>
      </div>
      {error && mode !== 'sharing' && <InlineError>{error}</InlineError>}

      {mode === 'sharing' && (
        <ShareSheet
          board={board}
          vendors={boards.vendors}
          actions={actions}
          labels={labels}
          onClose={() => {
            setMode('idle')
            router.refresh()
          }}
        />
      )}
    </div>
  )
}

function NameForm({
  id,
  labels,
  value,
  busy,
  onChange,
  onCancel,
  onSubmit,
}: {
  id: string
  labels: BoardLabels
  value: string
  busy: boolean
  onChange: (v: string) => void
  onCancel: () => void
  onSubmit: () => void
}) {
  return (
    <form
      className="mt-2 flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit()
      }}
    >
      <input
        id={id}
        aria-label={labels.nameField}
        value={value}
        maxLength={80}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && onCancel()}
        // biome-ignore lint/a11y/noAutofocus: the person just chose to name it
        autoFocus
        onFocus={(e) => e.target.select()}
        className="border-input h-9 w-56 max-w-full rounded-[var(--radius)] border bg-transparent px-2 text-sm"
      />
      <LinkButton type="submit" disabled={busy}>
        {labels.save}
      </LinkButton>
      <LinkButton onClick={onCancel}>{labels.cancel}</LinkButton>
    </form>
  )
}

/**
 * Who sees one board. Each tick saves the whole vendor list (the repo replaces it, never patches),
 * optimistically, and puts the tick back if the save failed.
 */
function ShareSheet({
  board,
  vendors,
  actions,
  labels,
  onClose,
}: {
  board: BoardRow
  vendors: readonly BoardVendor[]
  actions: BoardActions
  labels: BoardLabels
  onClose: () => void
}) {
  const [shared, setShared] = useState<readonly string[]>(board.sharedWith)
  const [couple, setCouple] = useState(board.sharedWithCouple)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const message = (code: string) => labels.errors[code] ?? labels.errors.unknown

  const save = async (work: () => Promise<BoardDone>, undo: () => void) => {
    setSaving(true)
    setError(null)
    try {
      const r = await work()
      if (!r.ok) {
        undo()
        setError(message(r.error))
      }
    } catch {
      undo()
      setError(message('network'))
    } finally {
      setSaving(false)
    }
  }

  const toggleVendor = (id: string, on: boolean) => {
    const before = shared
    const next = on ? [...shared, id] : shared.filter((v) => v !== id)
    setShared(next)
    void save(
      () => actions.share(board.id, next),
      () => setShared(before),
    )
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={labels.shareTitle.replace('{name}', () => board.name)}
      closeLabel={labels.close}
    >
      <fieldset disabled={saving} className="space-y-4" aria-busy={saving || undefined}>
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={couple}
            onChange={(e) => {
              const on = e.target.checked
              setCouple(on)
              void save(
                () => actions.shareCouple(board.id, on),
                () => setCouple(!on),
              )
            }}
            className="mt-1 size-4"
          />
          <span>
            <span className="block text-sm font-medium">{labels.shareCouple}</span>
            <span className="text-muted-foreground block text-xs">{labels.shareCoupleHint}</span>
          </span>
        </label>

        <div className="border-border border-t pt-4">
          {vendors.length === 0 ? (
            <p className="text-muted-foreground text-sm">{labels.shareNoVendors}</p>
          ) : (
            <ul className="space-y-3">
              {vendors.map((v) => (
                <li key={v.id}>
                  <label className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={shared.includes(v.id)}
                      onChange={(e) => toggleVendor(v.id, e.target.checked)}
                      className="mt-1 size-4"
                    />
                    <span>
                      <span className="block text-sm font-medium">{v.name}</span>
                      <span className="text-muted-foreground block text-xs">
                        {v.category}
                        {v.hasLink === false && ` · ${labels.shareNoLink}`}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
        {error && <InlineError>{error}</InlineError>}
      </fieldset>
    </Sheet>
  )
}
