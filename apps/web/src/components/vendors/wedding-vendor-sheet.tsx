'use client'

import type { WeddingVendorRow } from '@guestnote/db'
import { Button } from '@guestnote/ui/button'
import { InlineError } from '@guestnote/ui/inline-error'
import { Sheet } from '@guestnote/ui/sheet'
import Link from 'next/link'
import { useId, useState, useTransition } from 'react'
import {
  removeVendorFromWedding,
  restoreVendorToWedding,
  saveWeddingVendor,
  setWeddingVendorFullRunSheet,
} from '../../app/pro/(app)/weddings/[id]/vendors/actions.ts'
import { app } from '../../lib/routes.ts'
import { VENDOR_STATUSES, type VendorActionResult } from '../../lib/vendor-input.ts'
import { useToast } from '../toast/toast-provider.tsx'
import { errorText, SmallButton, undoAnswer } from './controls.tsx'
import type { VendorStatus } from './status.tsx'
import { VendorLinkControls } from './vendor-link-controls.tsx'
import type { WeddingLabels } from './wedding-vendors-view.tsx'
export type SheetBoard = {
  readonly id: string
  readonly name: string
  readonly sharedWith: readonly string[]
}

/**
 * Status, notes and unlink for one row, and since spec 0007 what the vendor's link shows: the
 * whole day or only their own rows, and which moodboards. Unmounted when closed, like every
 * `Sheet`.
 *
 * The timeline switch saves on its own, at once, like the share ticks on the moodboard: it is a
 * statement about what a link shows right now, and folding it into Save would leave it unsaved
 * whenever someone closes the sheet instead. The boards are read-only here -- they are shared
 * from the board (spec 0007), and each name links there.
 */
export function WeddingVendorSheet({
  weddingId,
  vendor,
  canManageLink,
  boards,
  labels,
  onClose,
}: {
  weddingId: string
  vendor: WeddingVendorRow
  /** Owner/admin only (spec 0003 permissions table: "create signed links"). A `member` can
   *  still edit status and notes below -- this gates only the link section. */
  canManageLink: boolean
  /** The boards shared with THIS vendor. */
  boards: readonly SheetBoard[]
  labels: WeddingLabels
  onClose: () => void
}) {
  const formId = useId()
  const [status, setStatus] = useState<VendorStatus>(vendor.status)
  const [notes, setNotes] = useState(vendor.notes ?? '')
  const [pending, startTransition] = useTransition()
  const toast = useToast()
  const [result, setResult] = useState<VendorActionResult | null>(null)
  const [failed, setFailed] = useState(false)
  const [fullDay, setFullDay] = useState(vendor.fullRunSheet)
  const message = failed ? labels.errors.generic : errorText(labels.errors, result)

  const toggleFullDay = (on: boolean) => {
    setFullDay(on)
    setFailed(false)
    setResult(null)
    startTransition(async () => {
      try {
        const r = await setWeddingVendorFullRunSheet(weddingId, vendor.id, on)
        if (!r.ok) {
          setFullDay(!on)
          setResult(r)
        }
      } catch {
        setFullDay(!on)
        setFailed(true)
      }
    })
  }

  /**
   * Spec 0009 C4: off the wedding at once, then Undo. The row is soft-deleted and everything that
   * hangs off it is untouched (`removeWeddingVendor`), so the restore puts back status, notes and
   * links alike; a confirmation would have guarded nothing Undo cannot return. `run` closes the
   * sheet on success, and the toast lives in the layout, so it outlives it.
   */
  const remove = async () => {
    const r = await removeVendorFromWedding(weddingId, vendor.id)
    if (r.ok) {
      toast.show({
        // A replacer, so a `$&` in the name is text and not a replacement pattern.
        message: labels.removed.replace('{name}', () => vendor.name),
        undo: async () =>
          undoAnswer(labels.errors, await restoreVendorToWedding(weddingId, vendor.id)),
      })
    }
    return r
  }

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
      title={labels.sheetTitle.replace('{name}', () => vendor.name)}
      closeLabel={labels.close}
      footer={
        <div className="grid grid-cols-2 gap-2">
          <Button
            busy={pending}
            busyLabel={labels.saving}
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
            className="block w-full rounded-[var(--radius-container)] border border-[var(--input)] bg-transparent px-3 py-2 text-sm"
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

        <div className="border-border space-y-3 border-t pt-4">
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={fullDay}
              disabled={pending}
              onChange={(e) => toggleFullDay(e.target.checked)}
              className="mt-1 size-4"
            />
            <span>
              <span className="block text-sm font-medium">{labels.fullRunSheet}</span>
              <span className="text-muted-foreground block text-xs">{labels.fullRunSheetHint}</span>
            </span>
          </label>
          <p className="text-sm">
            {boards.length === 0 ? (
              <span className="text-muted-foreground">{labels.noBoards}</span>
            ) : (
              <BoardLinks weddingId={weddingId} boards={boards} template={labels.boards} />
            )}
          </p>
        </div>

        {message && <InlineError>{message}</InlineError>}

        {canManageLink && (
          <div className="border-border border-t pt-4">
            <VendorLinkControls
              weddingId={weddingId}
              vendorLinkId={vendor.id}
              activeLink={vendor.activeLink}
              vendorName={vendor.name}
              vendorEmail={vendor.email}
              labels={labels.manageLink}
            />
          </div>
        )}

        <div className="border-border border-t pt-4">
          <SmallButton disabled={pending} onClick={() => run(remove)}>
            {labels.remove}
          </SmallButton>
          <p className="text-muted-foreground mt-2 text-xs">{labels.removeNote}</p>
        </div>
      </div>
    </Sheet>
  )
}

/** "Moodboards: A, B", with each name a link to that board. The template's `{names}` is split
 *  around, so the words either side stay translatable. */
function BoardLinks({
  weddingId,
  boards,
  template,
}: {
  weddingId: string
  boards: readonly SheetBoard[]
  template: string
}) {
  const [before = '', after = ''] = template.split('{names}')
  return (
    <>
      {before}
      {boards.map((b, i) => (
        <span key={b.id}>
          {i > 0 && ', '}
          <Link
            href={app.weddingMoodboard(weddingId, b.id)}
            className="underline underline-offset-[3px]"
          >
            {b.name}
          </Link>
        </span>
      ))}
      {after}
    </>
  )
}
