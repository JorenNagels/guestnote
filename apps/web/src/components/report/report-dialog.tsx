'use client'

import { Button, LinkButton } from '@guestnote/ui/button'
import { InlineError } from '@guestnote/ui/inline-error'
import { Sheet } from '@guestnote/ui/sheet'
import { usePathname } from 'next/navigation'
import { useEffect, useId, useRef, useState, useTransition } from 'react'
import { type ReportFailure, sendReport } from '../../app/pro/(app)/report/actions.ts'
import {
  REPORT_CATEGORIES,
  REPORT_MAX_CHARS,
  type ReportCategory,
} from '../../app/pro/(app)/report/limits.ts'
import { shrinkScreenshot } from './shrink.ts'

export type ReportLabels = {
  title: string
  close: string
  category: string
  categories: Record<ReportCategory, string>
  message: string
  screenshot: string
  chooseScreenshot: string
  screenshotAdded: string
  removeScreenshot: string
  send: string
  sending: string
  sent: string
  errors: Record<ReportFailure | 'tooLarge', string>
}

/**
 * "Report a problem" (spec 0005): a category, what happened, and optionally a screenshot.
 *
 * On the `Sheet` primitive rather than a centred modal: it is the panel every editor in the app
 * already uses, and on a phone it is the whole screen, which is where a planner at a venue is
 * most likely to be reporting from. Context (page, org, wedding, browser) is attached on the
 * server, so the form asks only for what only the planner knows.
 *
 * The screenshot is shrunk the moment it is picked, not on send: the "too large" answer then
 * arrives beside the picker, while the text is still being written.
 *
 * **Mounted only while open** (`shell.tsx`). Closing unmounts it, which is the reset: a reopened
 * dialog starts empty, and a send or a shrink still in flight when it closed resolves into an
 * unmounted component and writes nothing. It used to stay mounted and reset its state in
 * `close()`, and a late `setSent(true)` then reopened as "thanks" with no Send button (review,
 * 2026-09-24).
 */
export function ReportDialog({
  open,
  onClose,
  labels,
}: {
  open: boolean
  onClose: () => void
  labels: ReportLabels
}) {
  const pathname = usePathname()
  const ids = { message: useId(), error: useId(), shot: useId(), shotError: useId() }
  const [category, setCategory] = useState<ReportCategory>('bug')
  const [message, setMessage] = useState('')
  const [shot, setShot] = useState<Blob | null>(null)
  const [shotError, setShotError] = useState(false)
  const [error, setError] = useState<ReportFailure | null>(null)
  const [sent, setSent] = useState(false)
  const [pending, startTransition] = useTransition()
  const fileInput = useRef<HTMLInputElement>(null)

  const pick = async (file: File | undefined) => {
    setShot(null)
    setShotError(false)
    if (!file) return
    const small = await shrinkScreenshot(file).catch(() => null)
    if (small) setShot(small)
    else setShotError(true)
  }

  const submit = () => {
    setError(null)
    const body = new FormData()
    body.set('category', category)
    body.set('message', message)
    body.set('page', pathname)
    if (shot) body.set('screenshot', new File([shot], 'screenshot.jpg', { type: shot.type }))
    startTransition(async () => {
      const out = await sendReport(body)
      if (out.ok) setSent(true)
      else setError(out.reason)
    })
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={labels.title}
      closeLabel={labels.close}
      footer={
        sent ? null : (
          <Button busy={pending} busyLabel={labels.sending} onClick={submit}>
            {labels.send}
          </Button>
        )
      }
    >
      {sent ? (
        <p role="status" className="text-sm">
          {labels.sent}
        </p>
      ) : (
        <div className="flex flex-col gap-5">
          <fieldset>
            <legend className="mb-2 text-sm font-medium">{labels.category}</legend>
            <div className="flex flex-wrap gap-2">
              {REPORT_CATEGORIES.map((value) => (
                // A pill, with the radio itself visually hidden: the native dot was the same
                // unstyled-widget problem as the file input. Still a real radio group, so arrow
                // keys move between them; the ring follows keyboard focus.
                <label
                  key={value}
                  className="has-[:checked]:border-foreground has-[:checked]:bg-muted has-[:checked]:font-semibold has-[:focus-visible]:outline-ring border-input flex h-9 cursor-pointer items-center rounded-[var(--radius)] border px-3 text-sm outline-offset-2 has-[:focus-visible]:outline-2"
                >
                  <input
                    className="sr-only"
                    type="radio"
                    name="category"
                    value={value}
                    checked={category === value}
                    onChange={() => setCategory(value)}
                  />
                  {labels.categories[value]}
                </label>
              ))}
            </div>
          </fieldset>

          <div>
            <label htmlFor={ids.message} className="mb-1.5 block text-sm font-medium">
              {labels.message}
            </label>
            <textarea
              id={ids.message}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={REPORT_MAX_CHARS}
              rows={6}
              aria-invalid={error === 'empty' || error === 'tooLong' || undefined}
              aria-describedby={error ? ids.error : undefined}
              className="border-input hover:border-foreground w-full rounded-[var(--radius)] border bg-transparent px-3 py-2 text-base"
            />
          </div>

          {/* The Files screen's upload pattern (`components/files/upload-zone.tsx`): a real
              button opens a visually hidden input. The native control was the first version,
              and it rendered as unstyled "Choose File / No file chosen" text in dark mode --
              a browser widget no token reaches. */}
          <div>
            <span id={ids.shot} className="mb-1.5 block text-sm font-medium">
              {labels.screenshot}
            </span>
            <div className="border-input rounded-[var(--radius)] border border-dashed p-3">
              {shot ? (
                <div className="flex items-center gap-3">
                  <Thumbnail blob={shot} />
                  <span className="min-w-0 flex-1 truncate text-sm">{labels.screenshotAdded}</span>
                  <LinkButton
                    onClick={() => {
                      setShot(null)
                      if (fileInput.current) fileInput.current.value = ''
                    }}
                  >
                    {labels.removeScreenshot}
                  </LinkButton>
                </div>
              ) : (
                // `w-fit` on a wrapper: `Button` is `w-full` and `cx` does not merge classes.
                <div className="w-fit">
                  <Button
                    variant="secondary"
                    className="h-9 px-3"
                    aria-describedby={shotError ? ids.shotError : undefined}
                    onClick={() => fileInput.current?.click()}
                  >
                    {labels.chooseScreenshot}
                  </Button>
                </div>
              )}
            </div>
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              tabIndex={-1}
              aria-hidden="true"
              data-testid="screenshot-input"
              className="sr-only"
              onChange={(e) => void pick(e.target.files?.[0])}
            />
            {shotError ? (
              <InlineError id={ids.shotError}>{labels.errors.tooLarge}</InlineError>
            ) : null}
          </div>

          {error ? <InlineError id={ids.error}>{labels.errors[error]}</InlineError> : null}
        </div>
      )}
    </Sheet>
  )
}

/**
 * A preview of the shrunk screenshot, so the planner sees what will be sent. The object URL is
 * revoked when the blob changes or the dialog unmounts. Guarded because jsdom has no
 * `URL.createObjectURL`; there the preview is simply absent.
 */
function Thumbnail({ blob }: { blob: Blob }) {
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => {
    if (typeof URL.createObjectURL !== 'function') return
    const url = URL.createObjectURL(blob)
    setSrc(url)
    return () => URL.revokeObjectURL(url)
  }, [blob])
  if (!src) return null
  return (
    // biome-ignore lint/performance/noImgElement: a local blob URL, which next/image cannot optimise
    <img
      src={src}
      alt=""
      className="border-border size-12 shrink-0 rounded-[calc(var(--radius)-2px)] border object-cover"
    />
  )
}
