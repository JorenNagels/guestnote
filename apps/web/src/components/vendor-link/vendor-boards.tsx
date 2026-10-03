'use client'

import { Button } from '@guestnote/ui/button'
import { type KeyboardEvent, useRef, useState } from 'react'
import { isImageType } from '../../lib/board-items.ts'
import type { VendorBoard } from '../../lib/vendor-boards.ts'
import { DocPreview } from '../files/doc-preview.tsx'
import { formatSize } from '../files/format.ts'
import { openItem } from '../files/open-item.ts'

export type VendorBoardLabels = {
  download: string
  close: string
  /** `{name}`: the caption. */
  open: string
  /** `{name}`: the caption of a document, which opens in a tab or downloads (2026-10-04). */
  openFile: string
}

export type VendorBoardActions = {
  refresh(): Promise<Readonly<Record<string, string>> | null>
  download(fileId: string): Promise<string | null>
  /** Signed `inline` now: a PDF opens in a tab; an Office file comes back `attachment`. */
  open(fileId: string): Promise<string | null>
}

/**
 * A URL signed less than this long ago that fails to load is really broken (a HEIC an old browser
 * cannot draw, an object that is gone), not expired: re-signing it would only fail again. Older
 * than this, a failure is taken to be the five-minute expiry, and the page asks for fresh URLs.
 * A minute rather than nearer five: a false "expired" costs one harmless re-sign, a false
 * "broken" leaves a live tile on its fallback, so it errs towards re-signing. Chosen, not measured.
 */
const FRESH_MS = 60_000

/**
 * The boards shared with this vendor (spec 0007): a grid per board, tap to enlarge, download.
 *
 * URLs are signed for five minutes at render. When a tile fails to load after that, one call
 * (shared by every tile failing at the same moment) asks the server for fresh URLs with the
 * link's own token; the server re-checks the link, so a revoked one returns `null` and the tiles
 * stay on their fallback. A tile that fails on a fresh URL falls back at once: caption and a
 * download button, which is how a HEIC shows on a browser that cannot draw it.
 *
 * A document on the board (2026-10-04) has no render-time URL and nothing to refresh: it is drawn
 * as an icon with its type and size, and tapping it signs one through the token and opens it --
 * a PDF in a new tab, an Office file as a download (`files/open-item.ts`).
 */
export function VendorBoards({
  boards,
  labels,
  actions,
  locale,
}: {
  boards: readonly VendorBoard[]
  labels: VendorBoardLabels
  actions: VendorBoardActions
  locale: string
}) {
  const [urls, setUrls] = useState<Readonly<Record<string, string | null>>>(() =>
    Object.fromEntries(boards.flatMap((b) => b.images.map((i) => [i.id, i.url]))),
  )
  const [dead, setDead] = useState<ReadonlySet<string>>(new Set())
  const [open, setOpen] = useState<{ id: string; name: string } | null>(null)
  const signedAt = useRef(Date.now())
  const inflight = useRef<Promise<Readonly<Record<string, string>> | null> | null>(null)

  const kill = (id: string) => setDead((d) => new Set(d).add(id))

  const onError = async (id: string) => {
    if (Date.now() - signedAt.current < FRESH_MS) {
      kill(id)
      return
    }
    inflight.current ??= actions.refresh().finally(() => {
      inflight.current = null
    })
    try {
      const fresh = await inflight.current
      signedAt.current = Date.now()
      if (!fresh) {
        kill(id)
        return
      }
      setUrls((u) => ({ ...u, ...fresh }))
      if (!fresh[id]) kill(id)
    } catch {
      kill(id)
    }
  }

  const download = async (id: string) => {
    const url = await actions.download(id).catch(() => null)
    if (url) window.location.assign(url)
  }

  return (
    <>
      {boards.map((board) => (
        <section key={board.id} className="mt-5">
          <h2 className="mb-2 text-sm font-semibold tracking-tight">{board.name}</h2>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {board.images.map((image) => {
              const url = urls[image.id]
              const broken = !url || dead.has(image.id)
              return (
                <li
                  key={image.id}
                  className="border-border bg-background overflow-hidden rounded-[var(--radius-container)] border"
                >
                  {!isImageType(image.mime) ? (
                    <button
                      type="button"
                      aria-label={labels.openFile.replace('{name}', () => image.name)}
                      onClick={() => void openItem(image.mime, () => actions.open(image.id))}
                      className="block w-full cursor-pointer"
                    >
                      <DocPreview mime={image.mime} size={formatSize(image.sizeBytes, locale)} />
                    </button>
                  ) : broken ? (
                    <div className="bg-muted flex aspect-[4/3] flex-col items-center justify-center gap-2 px-2 text-center">
                      <span className="text-xs break-words">{image.name}</span>
                      <Button variant="secondary" onClick={() => void download(image.id)}>
                        {labels.download}
                      </Button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      aria-label={labels.open.replace('{name}', () => image.name)}
                      onClick={() => setOpen({ id: image.id, name: image.name })}
                      className="block w-full cursor-zoom-in"
                    >
                      {/* biome-ignore lint/performance/noImgElement: signed URLs, optimiser off (moodboard-screen.tsx) */}
                      <img
                        src={url}
                        alt={image.name}
                        loading="lazy"
                        onError={() => void onError(image.id)}
                        className="bg-muted aspect-[4/3] w-full object-cover"
                      />
                    </button>
                  )}
                  <p className="truncate px-2.5 py-1.5 text-xs">{image.name}</p>
                </li>
              )
            })}
          </ul>
        </section>
      ))}

      {open && (
        <Lightbox
          url={urls[open.id] ?? null}
          name={open.name}
          labels={labels}
          onDownload={() => void download(open.id)}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  )
}

function Lightbox({
  url,
  name,
  labels,
  onDownload,
  onClose,
}: {
  url: string | null
  name: string
  labels: VendorBoardLabels
  onDownload: () => void
  onClose: () => void
}) {
  const onKeyDown = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={name}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      className="fixed inset-0 z-50 flex flex-col bg-black/90 p-4"
    >
      <div className="flex items-center justify-between gap-3 text-white">
        <p className="min-w-0 truncate text-sm">{name}</p>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onDownload}>
            {labels.download}
          </Button>
          <Button variant="secondary" onClick={onClose} autoFocus>
            {labels.close}
          </Button>
        </div>
      </div>
      {url && (
        // biome-ignore lint/performance/noImgElement: as above
        <img src={url} alt={name} className="mx-auto mt-4 min-h-0 flex-1 object-contain" />
      )}
    </div>
  )
}
