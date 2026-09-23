'use client'

import type { VendorRow } from '@guestnote/db'
import { Button } from '@guestnote/ui/button'
import { Field } from '@guestnote/ui/field'
import { InlineError } from '@guestnote/ui/inline-error'
import { Sheet } from '@guestnote/ui/sheet'
import { type FormEvent, useId, useState, useTransition } from 'react'
import type { VendorActionResult } from '../../lib/vendor-input.ts'
import { type ErrorLabels, errorText, SmallButton } from './controls.tsx'

export type FormLabels = {
  titleNew: string
  titleEdit: string
  name: string
  category: string
  categoryHint: string
  email: string
  phone: string
  notes: string
  save: string
  saving: string
  cancel: string
  close: string
  archive: string
  archiveConfirm: string
  archiveConfirmYes: string
  archiveNote: string
  errors: ErrorLabels
}

type Props = {
  labels: FormLabels
  /** Present when editing. Absent for a new vendor. */
  vendor?: VendorRow
  onSubmit: (input: {
    name: string
    category: string
    email: string
    phone: string
    notes: string
  }) => Promise<VendorActionResult>
  /** Editing only, and only offered where the caller may archive. */
  onArchive?: () => Promise<VendorActionResult>
  onClose: () => void
}

/**
 * One form, two doors: the directory's Add and Edit, and the wedding's "new vendor". It sits
 * in a `Sheet`, so it is unmounted on close and a half-typed draft never survives.
 *
 * Fields are sent as raw strings and parsed on the server (`lib/vendor-input.ts`); nothing
 * here decides what is valid, so the two cannot disagree. The `required` attributes are only
 * the browser's first nudge.
 *
 * On success the sheet closes. The list underneath refreshes because the action revalidates
 * the route, not because this component pushes a row in: one source of truth for the list.
 */
export function VendorForm({ labels, vendor, onSubmit, onArchive, onClose }: Props) {
  const formId = useId()
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<VendorActionResult | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [failed, setFailed] = useState(false)

  const message = failed ? labels.errors.generic : errorText(labels.errors, result)

  const run = (fn: () => Promise<VendorActionResult>) => {
    setFailed(false)
    startTransition(async () => {
      try {
        const r = await fn()
        setResult(r)
        if (r.ok) onClose()
      } catch {
        setFailed(true)
      }
    })
  }

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const data = new FormData(e.currentTarget)
    const field = (key: string) => String(data.get(key) ?? '')
    run(() =>
      onSubmit({
        name: field('name'),
        category: field('category'),
        email: field('email'),
        phone: field('phone'),
        notes: field('notes'),
      }),
    )
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={vendor ? labels.titleEdit : labels.titleNew}
      closeLabel={labels.close}
      footer={
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="submit"
            form={formId}
            busy={pending}
            busyLabel={labels.saving}
            disabled={confirming}
          >
            {labels.save}
          </Button>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            {labels.cancel}
          </Button>
        </div>
      }
    >
      <form id={formId} onSubmit={submit} className="space-y-4">
        <Field
          id={`${formId}-name`}
          name="name"
          label={labels.name}
          defaultValue={vendor?.name ?? ''}
          required
          maxLength={120}
          autoComplete="off"
        />
        <div>
          <Field
            id={`${formId}-category`}
            name="category"
            label={labels.category}
            defaultValue={vendor?.category ?? ''}
            required
            maxLength={60}
            autoComplete="off"
          />
          <p className="text-muted-foreground mt-1.5 text-xs">{labels.categoryHint}</p>
        </div>
        <Field
          id={`${formId}-email`}
          name="email"
          type="email"
          label={labels.email}
          defaultValue={vendor?.email ?? ''}
          maxLength={254}
          autoComplete="off"
        />
        <Field
          id={`${formId}-phone`}
          name="phone"
          type="tel"
          label={labels.phone}
          defaultValue={vendor?.phone ?? ''}
          maxLength={40}
          autoComplete="off"
        />
        <div>
          <label htmlFor={`${formId}-notes`} className="mb-1.5 block text-sm font-medium">
            {labels.notes}
          </label>
          <textarea
            id={`${formId}-notes`}
            name="notes"
            defaultValue={vendor?.notes ?? ''}
            maxLength={2000}
            rows={4}
            className="bg-transparent block w-full rounded-[var(--radius)] border border-[var(--input)] px-3 py-2 text-sm"
          />
        </div>

        {message && <InlineError>{message}</InlineError>}

        {vendor && onArchive && (
          <div className="border-border border-t pt-4">
            {confirming ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm">{labels.archiveConfirm}</span>
                <SmallButton disabled={pending} onClick={() => run(onArchive)}>
                  {labels.archiveConfirmYes}
                </SmallButton>
                <SmallButton disabled={pending} onClick={() => setConfirming(false)}>
                  {labels.cancel}
                </SmallButton>
              </div>
            ) : (
              <SmallButton disabled={pending} onClick={() => setConfirming(true)}>
                {labels.archive}
              </SmallButton>
            )}
            <p className="text-muted-foreground mt-2 text-xs">{labels.archiveNote}</p>
          </div>
        )}
      </form>
    </Sheet>
  )
}
