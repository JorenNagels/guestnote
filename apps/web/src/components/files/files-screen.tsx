'use client'

import { LinkButton } from '@guestnote/ui/button'
import { InlineError } from '@guestnote/ui/inline-error'
import { Pill } from '@guestnote/ui/pill'
import { Table, TableBody, TableCell, TableHead, TableHeaderCell } from '@guestnote/ui/table'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { Done, StartUpload } from '../../lib/wedding-files.ts'
import { formatSize, kindLabel } from './format.ts'
import { type UploadVisibility, uploadFile } from './upload.ts'
import { UploadZone, type UploadZoneLabels } from './upload-zone.tsx'

export type FileItem = {
  readonly id: string
  readonly name: string
  readonly mime: string
  readonly sizeBytes: number
  readonly visibility: UploadVisibility
  readonly uploadedByName: string | null
  /** ISO 8601. A string so it crosses the server/client boundary as plain data. */
  readonly createdAt: string
}

export type FilesActions = {
  start(input: {
    name: string
    mime: string
    sizeBytes: number
    visibility: UploadVisibility
  }): Promise<StartUpload>
  confirm(fileId: string): Promise<Done>
  remove(fileId: string): Promise<Done>
  rename(fileId: string, name: string): Promise<Done>
  setVisibility(fileId: string, visibility: UploadVisibility): Promise<Done>
  /** A fresh signed URL, or `null` when the caller may not read the file. */
  download(fileId: string): Promise<string | null>
}

export type FilesLabels = {
  title: string
  tableCaption: string
  columnName: string
  columnActions: string
  empty: { title: string; body: string }
  internalOnly: string
  upload: UploadZoneLabels
  /** Applies to the next files added: the checkbox beside the button. */
  internalNext: string
  actions: {
    download: string
    rename: string
    makeInternal: string
    makeShared: string
    remove: string
    /** A template: `{name}` is the file's name. */
    removeConfirm: string
    removeYes: string
    save: string
    cancel: string
    renameField: string
  }
  /**
   * Templates with `{name}`, so five rows of "Download" are not five identical buttons to a
   * screen reader. The visible text stays short; the accessible name says which file.
   */
  aria: {
    download: string
    rename: string
    makeInternal: string
    makeShared: string
    remove: string
  }
  by: string
  errors: Readonly<Record<string, string>> & { unknown: string }
}

const fill = (template: string, name: string) => template.replace('{name}', name)

/**
 * The Files screen. Client because every row is interactive; the page hands it plain data and
 * the six Server Functions it may call, each already bound to this wedding.
 *
 * Nothing here decides who may do what: every action re-checks membership on the server, so a
 * button that renders is a convenience and never a permission (invariant 7).
 */
export function FilesScreen({
  items,
  locale,
  labels,
  actions,
  navigate = (url) => window.location.assign(url),
}: {
  items: readonly FileItem[]
  locale: string
  labels: FilesLabels
  actions: FilesActions
  navigate?: (url: string) => void
}) {
  const router = useRouter()
  const [internalNext, setInternalNext] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [confirming, setConfirming] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [rowErrors, setRowErrors] = useState<Readonly<Record<string, string>>>({})

  const message = (code: string) => labels.errors[code] ?? labels.errors.unknown

  const act = async (id: string, work: () => Promise<Done | string | null>) => {
    setBusy(id)
    setRowErrors(({ [id]: _dropped, ...rest }) => rest)
    try {
      const result = await work()
      if (result === null) {
        setRowErrors((e) => ({ ...e, [id]: message('notFound') }))
      } else if (typeof result === 'string') {
        navigate(result)
      } else if (!result.ok) {
        setRowErrors((e) => ({ ...e, [id]: message(result.error) }))
      } else {
        setEditing(null)
        setConfirming(null)
        router.refresh()
      }
    } catch {
      setRowErrors((e) => ({ ...e, [id]: message('network') }))
    } finally {
      setBusy(null)
    }
  }

  const date = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    // The Brussels calendar day, not the server's or the browser's: the same file must show the
    // same date in the server-rendered HTML and after hydration, and a planner reads "today".
    timeZone: 'Europe/Brussels',
  })

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">{labels.title}</h1>

      <div className="mt-6">
        <UploadZone
          labels={labels.upload}
          onDone={() => router.refresh()}
          upload={(file) =>
            uploadFile(
              file,
              { name: file.name, visibility: internalNext ? 'internal' : 'shared' },
              { start: actions.start, confirm: actions.confirm },
            )
          }
        >
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={internalNext}
              onChange={(e) => setInternalNext(e.target.checked)}
              className="size-4"
            />
            {labels.internalNext}
          </label>
        </UploadZone>
      </div>

      {items.length === 0 ? (
        <div className="mt-6 rounded-[var(--radius)] border border-border bg-card px-6 py-10 text-center">
          <p className="font-medium">{labels.empty.title}</p>
          <p className="text-muted-foreground mx-auto mt-1.5 max-w-prose text-sm leading-relaxed">
            {labels.empty.body}
          </p>
        </div>
      ) : (
        <div className="mt-6">
          <Table caption={labels.tableCaption}>
            <TableHead>
              <tr>
                <TableHeaderCell>{labels.columnName}</TableHeaderCell>
                <TableHeaderCell className="text-right">
                  <span className="sr-only">{labels.columnActions}</span>
                </TableHeaderCell>
              </tr>
            </TableHead>
            <TableBody>
              {items.map((f) => {
                const error = rowErrors[f.id]
                const isBusy = busy === f.id
                return (
                  <tr key={f.id} className="align-top">
                    <TableCell className="py-2.5">
                      {editing === f.id ? (
                        <form
                          className="flex flex-wrap items-center gap-2"
                          onSubmit={(e) => {
                            e.preventDefault()
                            void act(f.id, () => actions.rename(f.id, draft))
                          }}
                        >
                          <input
                            aria-label={labels.actions.renameField}
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                            onKeyDown={(e) => e.key === 'Escape' && setEditing(null)}
                            // biome-ignore lint/a11y/noAutofocus: the person just chose "rename"
                            autoFocus
                            className="border-input h-9 min-w-0 flex-1 rounded-[var(--radius)] border bg-transparent px-2.5 text-sm"
                          />
                          <LinkButton type="submit" disabled={isBusy}>
                            {labels.actions.save}
                          </LinkButton>
                          <LinkButton onClick={() => setEditing(null)}>
                            {labels.actions.cancel}
                          </LinkButton>
                        </form>
                      ) : (
                        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                          <span className="min-w-0 break-words text-[13.5px]">{f.name}</span>
                          {f.visibility === 'internal' && (
                            <Pill tone="warning">{labels.internalOnly}</Pill>
                          )}
                        </div>
                      )}
                      <p className="text-muted-foreground mt-0.5 text-xs">
                        {kindLabel(f.mime)} · {formatSize(f.sizeBytes, locale)}
                        {f.uploadedByName ? ` · ${labels.by} ${f.uploadedByName}` : ''} ·{' '}
                        {date.format(new Date(f.createdAt))}
                      </p>
                      {error && <InlineError>{error}</InlineError>}
                    </TableCell>
                    <TableCell className="py-2.5 text-right">
                      {confirming === f.id ? (
                        <span className="inline-flex flex-wrap items-center justify-end gap-x-3 gap-y-1.5">
                          <span className="text-sm">
                            {fill(labels.actions.removeConfirm, f.name)}
                          </span>
                          <LinkButton
                            disabled={isBusy}
                            onClick={() => void act(f.id, () => actions.remove(f.id))}
                          >
                            {labels.actions.removeYes}
                          </LinkButton>
                          <LinkButton onClick={() => setConfirming(null)}>
                            {labels.actions.cancel}
                          </LinkButton>
                        </span>
                      ) : (
                        <span className="inline-flex flex-wrap items-center justify-end gap-x-3 gap-y-1.5">
                          <LinkButton
                            disabled={isBusy}
                            aria-label={fill(labels.aria.download, f.name)}
                            onClick={() => void act(f.id, () => actions.download(f.id))}
                          >
                            {labels.actions.download}
                          </LinkButton>
                          <LinkButton
                            disabled={isBusy}
                            aria-label={fill(labels.aria.rename, f.name)}
                            onClick={() => {
                              setDraft(f.name)
                              setEditing(f.id)
                            }}
                          >
                            {labels.actions.rename}
                          </LinkButton>
                          <LinkButton
                            disabled={isBusy}
                            aria-label={fill(
                              f.visibility === 'internal'
                                ? labels.aria.makeShared
                                : labels.aria.makeInternal,
                              f.name,
                            )}
                            onClick={() =>
                              void act(f.id, () =>
                                actions.setVisibility(
                                  f.id,
                                  f.visibility === 'internal' ? 'shared' : 'internal',
                                ),
                              )
                            }
                          >
                            {f.visibility === 'internal'
                              ? labels.actions.makeShared
                              : labels.actions.makeInternal}
                          </LinkButton>
                          <LinkButton
                            disabled={isBusy}
                            aria-label={fill(labels.aria.remove, f.name)}
                            onClick={() => setConfirming(f.id)}
                          >
                            {labels.actions.remove}
                          </LinkButton>
                        </span>
                      )}
                    </TableCell>
                  </tr>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
