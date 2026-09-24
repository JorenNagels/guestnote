'use client'

import { Button, LinkButton } from '@guestnote/ui/button'
import { InlineError } from '@guestnote/ui/inline-error'
import { Sheet } from '@guestnote/ui/sheet'
import { usePathname } from 'next/navigation'
import { useId, useRef, useState, useTransition } from 'react'
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
                <label
                  key={value}
                  className="has-[:checked]:border-foreground has-[:checked]:font-semibold border-input flex h-9 cursor-pointer items-center gap-2 rounded-[var(--radius)] border px-3 text-sm"
                >
                  <input
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

          <div>
            <label htmlFor={ids.shot} className="mb-1.5 block text-sm font-medium">
              {labels.screenshot}
            </label>
            <input
              id={ids.shot}
              ref={fileInput}
              type="file"
              accept="image/*"
              aria-invalid={shotError || undefined}
              aria-describedby={shotError ? ids.shotError : undefined}
              onChange={(e) => void pick(e.target.files?.[0])}
              className="text-sm"
            />
            {shot ? (
              <LinkButton
                className="ml-3"
                onClick={() => {
                  setShot(null)
                  if (fileInput.current) fileInput.current.value = ''
                }}
              >
                {labels.removeScreenshot}
              </LinkButton>
            ) : null}
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
