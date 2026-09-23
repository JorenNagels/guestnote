'use client'

import type { WeddingVendorRow } from '@guestnote/db'
import { Button } from '@guestnote/ui/button'
import { InlineError } from '@guestnote/ui/inline-error'
import { Sheet } from '@guestnote/ui/sheet'
import { useId, useState, useTransition } from 'react'
import {
  removeVendorFromWedding,
  saveWeddingVendor,
} from '../../app/pro/(app)/weddings/[id]/vendors/actions.ts'
import { VENDOR_STATUSES, type VendorActionResult } from '../../lib/vendor-input.ts'
import { errorText, SmallButton } from './controls.tsx'
import type { VendorStatus } from './status.tsx'
import { VendorLinkControls } from './vendor-link-controls.tsx'
import type { WeddingLabels } from './wedding-vendors-view.tsx'
/** Status, notes and unlink for one row. Unmounted when closed, like every `Sheet`. */
export function WeddingVendorSheet({
  weddingId,
  vendor,
  canManageLink,
  labels,
  onClose,
}: {
  weddingId: string
  vendor: WeddingVendorRow
  /** Owner/admin only (spec 0003 permissions table: "create signed links"). A `member` can
   *  still edit status and notes below -- this gates only the link section. */
  canManageLink: boolean
  labels: WeddingLabels
  onClose: () => void
}) {
  const formId = useId()
  const [status, setStatus] = useState<VendorStatus>(vendor.status)
  const [notes, setNotes] = useState(vendor.notes ?? '')
  const [confirming, setConfirming] = useState(false)
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<VendorActionResult | null>(null)
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

  return (
    <Sheet
      open
      onClose={onClose}
      title={labels.sheetTitle.replace('{name}', vendor.name)}
      closeLabel={labels.close}
      footer={
        <div className="grid grid-cols-2 gap-2">
          <Button
            busy={pending}
            busyLabel={labels.saving}
            disabled={confirming}
            onClick={() => run(() => saveWeddingVendor(weddingId, vendor.id, status, notes))}
          >
            {labels.save}
          </Button>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            {labels.cancel}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <label htmlFor={`${formId}-status`} className="mb-1.5 block text-sm font-medium">
            {labels.status}
          </label>
          <select
            id={`${formId}-status`}
            value={status}
            onChange={(e) => {
              const next = VENDOR_STATUSES.find((s) => s === e.target.value)
              if (next) setStatus(next)
            }}
            className="border-[var(--input)] h-11 w-full rounded-[var(--radius)] border bg-transparent px-3 text-sm"
          >
            {VENDOR_STATUSES.map((s) => (
              <option key={s} value={s}>
                {labels.statuses[s]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`${formId}-notes`} className="mb-1.5 block text-sm font-medium">
            {labels.notes}
          </label>
          <textarea
            id={`${formId}-notes`}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={2000}
            rows={6}
            aria-describedby={`${formId}-notes-hint`}
            className="block w-full rounded-[var(--radius)] border border-[var(--input)] bg-transparent px-3 py-2 text-sm"
          />
          {/* The vendor link (`/vendor/<token>`) renders these notes verbatim as "what the
              planner needs". Without this line a planner reads "notes for this wedding" as
              internal and writes prices or opinions into a field any link holder can read.
              Rejected for now: a separate vendor-facing column -- a migration for what one
              honest sentence already prevents. */}
          <p id={`${formId}-notes-hint`} className="text-muted-foreground mt-1.5 text-xs">
            {labels.notesHint}
          </p>
        </div>

        {message && <InlineError>{message}</InlineError>}

        {canManageLink && (
          <div className="border-border border-t pt-4">
            <VendorLinkControls
              weddingId={weddingId}
              vendorLinkId={vendor.id}
              activeLink={vendor.activeLink}
              labels={labels.manageLink}
            />
          </div>
        )}

        <div className="border-border border-t pt-4">
          {confirming ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm">{labels.removeConfirm}</span>
              <SmallButton
                disabled={pending}
                onClick={() => run(() => removeVendorFromWedding(weddingId, vendor.id))}
              >
                {labels.removeConfirmYes}
              </SmallButton>
              <SmallButton disabled={pending} onClick={() => setConfirming(false)}>
                {labels.cancel}
              </SmallButton>
            </div>
          ) : (
            <SmallButton disabled={pending} onClick={() => setConfirming(true)}>
              {labels.remove}
            </SmallButton>
          )}
          <p className="text-muted-foreground mt-2 text-xs">{labels.removeNote}</p>
        </div>
      </div>
    </Sheet>
  )
}
