'use client'

import type { VendorRow, WeddingVendorRow } from '@guestnote/db'
import { Button } from '@guestnote/ui/button'
import { Card } from '@guestnote/ui/card'
import { InlineError } from '@guestnote/ui/inline-error'
import { Pill } from '@guestnote/ui/pill'
import { Sheet } from '@guestnote/ui/sheet'
import { Table, TableBody, TableCell, TableHead, TableHeaderCell } from '@guestnote/ui/table'
import { useId, useMemo, useState, useTransition } from 'react'
import {
  addVendorToWedding,
  createVendorLinkAction,
  createVendorOnWedding,
  removeVendorFromWedding,
  revokeVendorLinkAction,
  saveWeddingVendor,
  setWeddingVendorStatus,
} from '../../app/pro/(app)/weddings/[id]/vendors/actions.ts'
import { VENDOR_STATUSES, type VendorActionResult } from '../../lib/vendor-input.ts'
import { type ErrorLabels, errorText, Monogram, SELECT_CLASS, SmallButton } from './controls.tsx'
import { STATUS_TONE, type StatusLabels, type VendorStatus } from './status.tsx'
import { type FormLabels, VendorForm } from './vendor-form.tsx'

/**
 * Spec 0003, S10: create/copy/revoke a vendor's signed link. Read by `LinkSheet` alone, and
 * kept as its own type (not folded into `WeddingLabels`' flat shape) so `app.s10`'s catalogue
 * stays S10's file -- `catalogue.ts` merges one slice's JSON per key, and `WeddingLabels`
 * already reads `app.s3`.
 */
export type ManageLinkLabels = {
  title: string
  createButton: string
  creating: string
  created: string
  copyButton: string
  copied: string
  /** `{date}` template, filled with `YYYY-MM-DD`. */
  expiresLabel: string
  revokeButton: string
  revokeConfirm: string
  revokeConfirmYes: string
  revoked: string
  cancel: string
  error: string
}

export type WeddingLabels = {
  addLabel: string
  addPlaceholder: string
  addButton: string
  addNone: string
  newVendor: string
  directoryLink: string
  emptyTitle: string
  emptyBody: string
  emptyBodyReadOnly: string
  caption: string
  colVendor: string
  colCategory: string
  colContact: string
  colStatus: string
  colActions: string
  /** Templates with `{name}`, filled here: a function cannot cross the server boundary. */
  statusAria: string
  edit: string
  editAria: string
  sheetTitle: string
  status: string
  notes: string
  /** Says out loud that the vendor link shows these notes -- see the textarea below. */
  notesHint: string
  save: string
  saving: string
  cancel: string
  close: string
  remove: string
  removeConfirm: string
  removeConfirmYes: string
  removeNote: string
  statuses: StatusLabels
  errors: ErrorLabels
  form: FormLabels
  manageLink: ManageLinkLabels
}

/**
 * The vendors on ONE wedding: the link rows, the picker over the studio directory, and the
 * inline "new vendor" for people who may write the directory.
 *
 * Every change goes through a Server Function and comes back as data. The list is not patched
 * locally: the action revalidates the route and the fresh rows arrive as new props, so what is
 * on screen is what is in the database and a failed write cannot leave a phantom row.
 *
 * The status control is a real `<select>` dressed as the status pill. The word is the state
 * (never colour alone), and a native select is one tap on a phone with nothing to build.
 */
export function WeddingVendorsView({
  weddingId,
  linked,
  directory,
  canCreate,
  labels,
}: {
  weddingId: string
  linked: WeddingVendorRow[]
  directory: VendorRow[]
  canCreate: boolean
  labels: WeddingLabels
}) {
  const [editing, setEditing] = useState<WeddingVendorRow | null>(null)
  const [creating, setCreating] = useState(false)

  const candidates = useMemo(() => {
    const taken = new Set(linked.map((l) => l.vendorId))
    return directory.filter((v) => !taken.has(v.id))
  }, [linked, directory])

  return (
    <div>
      <AddRow weddingId={weddingId} candidates={candidates} labels={labels}>
        {canCreate && (
          <SmallButton onClick={() => setCreating(true)}>{labels.newVendor}</SmallButton>
        )}
      </AddRow>

      {linked.length === 0 ? (
        <Card className="text-center">
          <p className="text-sm font-semibold">{labels.emptyTitle}</p>
          <p className="text-muted-foreground mx-auto mt-1 max-w-prose text-sm">
            {canCreate ? labels.emptyBody : labels.emptyBodyReadOnly}
          </p>
        </Card>
      ) : (
        <Table caption={labels.caption}>
          <TableHead>
            <tr>
              <TableHeaderCell>{labels.colVendor}</TableHeaderCell>
              <TableHeaderCell>{labels.colCategory}</TableHeaderCell>
              <TableHeaderCell>{labels.colContact}</TableHeaderCell>
              <TableHeaderCell>{labels.colStatus}</TableHeaderCell>
              <TableHeaderCell className="text-right">{labels.colActions}</TableHeaderCell>
            </tr>
          </TableHead>
          <TableBody>
            {linked.map((v) => (
              <Row
                key={v.id}
                weddingId={weddingId}
                vendor={v}
                labels={labels}
                onEdit={() => setEditing(v)}
              />
            ))}
          </TableBody>
        </Table>
      )}

      {editing && (
        <LinkSheet
          weddingId={weddingId}
          vendor={editing}
          canManageLink={canCreate}
          labels={labels}
          onClose={() => setEditing(null)}
        />
      )}
      {creating && (
        <VendorForm
          labels={labels.form}
          onClose={() => setCreating(false)}
          onSubmit={(i) => createVendorOnWedding(weddingId, i)}
        />
      )}
    </div>
  )
}

function AddRow({
  weddingId,
  candidates,
  labels,
  children,
}: {
  weddingId: string
  candidates: VendorRow[]
  labels: WeddingLabels
  children: React.ReactNode
}) {
  const id = useId()
  const [choice, setChoice] = useState('')
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<VendorActionResult | null>(null)
  const [failed, setFailed] = useState(false)
  const message = failed ? labels.errors.generic : errorText(labels.errors, result)

  const add = () => {
    if (!choice) return
    setFailed(false)
    startTransition(async () => {
      try {
        const r = await addVendorToWedding(weddingId, choice)
        setResult(r)
        if (r.ok) setChoice('')
      } catch {
        setFailed(true)
      }
    })
  }

  return (
    <div className="mb-4">
      <div className="flex flex-wrap items-center gap-2">
        {candidates.length > 0 ? (
          <>
            <label htmlFor={id} className="sr-only">
              {labels.addLabel}
            </label>
            <select
              id={id}
              value={choice}
              onChange={(e) => setChoice(e.target.value)}
              disabled={pending}
              className={`${SELECT_CLASS} min-w-0 max-w-full flex-1 basis-56 sm:max-w-xs`}
            >
              <option value="">{labels.addPlaceholder}</option>
              {candidates.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} · {v.category}
                </option>
              ))}
            </select>
            <SmallButton tone="primary" disabled={!choice || pending} onClick={add}>
              {labels.addButton}
            </SmallButton>
          </>
        ) : (
          <p className="text-muted-foreground text-xs">{labels.addNone}</p>
        )}
        <span className="flex-1" />
        {children}
      </div>
      {message && <InlineError>{message}</InlineError>}
    </div>
  )
}

function Row({
  weddingId,
  vendor,
  labels,
  onEdit,
}: {
  weddingId: string
  vendor: WeddingVendorRow
  labels: WeddingLabels
  onEdit: () => void
}) {
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<VendorActionResult | null>(null)
  const [failed, setFailed] = useState(false)
  const message = failed ? labels.errors.generic : errorText(labels.errors, result)

  const change = (status: VendorStatus) => {
    setFailed(false)
    startTransition(async () => {
      try {
        setResult(await setWeddingVendorStatus(weddingId, vendor.id, status))
      } catch {
        setFailed(true)
      }
    })
  }

  return (
    <tr>
      <TableCell>
        <span className="flex min-w-0 items-center gap-2.5">
          <Monogram name={vendor.name} />
          <span className="min-w-0">
            <span className="block truncate font-medium">{vendor.name}</span>
            {vendor.notes && (
              <span className="text-muted-foreground block max-w-xs truncate text-xs">
                {vendor.notes}
              </span>
            )}
          </span>
        </span>
      </TableCell>
      <TableCell className="text-muted-foreground">{vendor.category}</TableCell>
      <TableCell>
        {vendor.email && (
          <a
            className="block truncate underline-offset-2 hover:underline"
            href={`mailto:${vendor.email}`}
          >
            {vendor.email}
          </a>
        )}
        {vendor.phone && (
          <span className="text-muted-foreground block text-xs">{vendor.phone}</span>
        )}
      </TableCell>
      <TableCell>
        <Pill tone={STATUS_TONE[vendor.status]}>
          <select
            aria-label={labels.statusAria.replace('{name}', vendor.name)}
            value={vendor.status}
            disabled={pending}
            onChange={(e) => {
              const next = VENDOR_STATUSES.find((s) => s === e.target.value)
              if (next) change(next)
            }}
            className="[&>option]:bg-popover [&>option]:text-popover-foreground cursor-pointer bg-transparent text-[11px] font-medium text-inherit disabled:opacity-60"
          >
            {VENDOR_STATUSES.map((s) => (
              <option key={s} value={s}>
                {labels.statuses[s]}
              </option>
            ))}
          </select>
        </Pill>
        {message && <InlineError>{message}</InlineError>}
      </TableCell>
      <TableCell className="text-right">
        <SmallButton aria-label={labels.editAria.replace('{name}', vendor.name)} onClick={onEdit}>
          {labels.edit}
        </SmallButton>
      </TableCell>
    </tr>
  )
}

/** Status, notes and unlink for one row. Unmounted when closed, like every `Sheet`. */
function LinkSheet({
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

/**
 * Create, copy once, revoke. Spec 0003, S10.
 *
 * The plain token exists ONLY in `created` state, held in memory for this mount and never
 * written anywhere -- reloading the sheet loses it, same as the server: `vendor_links` stores
 * only the hash (`createVendorLinkAction`). "Create" reads "replace" (the repo revokes any
 * link already live for this vendor in the same transaction, see `vendor-links.ts`), so this
 * never needs to reconcile two live links.
 */
function VendorLinkControls({
  weddingId,
  vendorLinkId,
  activeLink,
  labels,
}: {
  weddingId: string
  vendorLinkId: string
  activeLink: WeddingVendorRow['activeLink']
  labels: ManageLinkLabels
}) {
  const [created, setCreated] = useState<{ token: string; expiresAt: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const [confirmingRevoke, setConfirmingRevoke] = useState(false)
  const [revoked, setRevoked] = useState(false)
  const [pending, startTransition] = useTransition()
  const [failed, setFailed] = useState(false)

  const create = () => {
    setFailed(false)
    startTransition(async () => {
      try {
        const r = await createVendorLinkAction(weddingId, vendorLinkId, undefined)
        if (r.ok) {
          setCreated({ token: r.token, expiresAt: r.expiresAt })
          setCopied(false)
        } else {
          setFailed(true)
        }
      } catch {
        setFailed(true)
      }
    })
  }

  const revoke = (linkId: string) => {
    setFailed(false)
    startTransition(async () => {
      try {
        const r = await revokeVendorLinkAction(weddingId, linkId)
        if (r.ok) {
          setRevoked(true)
          setConfirmingRevoke(false)
        } else {
          setFailed(true)
        }
      } catch {
        setFailed(true)
      }
    })
  }

  const copy = async (token: string) => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/vendor/${token}`)
      setCopied(true)
    } catch {
      // Clipboard access can be denied by the browser; the token stays selectable on screen.
    }
  }

  return (
    <div>
      <p className="mb-2 text-sm font-medium">{labels.title}</p>

      {created ? (
        <div className="space-y-2">
          <p className="text-muted-foreground text-xs">{labels.created}</p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="border-border bg-muted min-w-0 flex-1 basis-56 truncate rounded-[var(--radius)] border px-2 py-1.5 text-xs">
              {`${typeof window === 'undefined' ? '' : window.location.origin}/vendor/${created.token}`}
            </code>
            <SmallButton onClick={() => copy(created.token)}>
              {copied ? labels.copied : labels.copyButton}
            </SmallButton>
          </div>
          <p className="text-muted-foreground text-xs">
            {labels.expiresLabel.replace('{date}', created.expiresAt.slice(0, 10))}
          </p>
        </div>
      ) : activeLink && !revoked ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground text-xs">
            {labels.expiresLabel.replace('{date}', activeLink.expiresAt.toISOString().slice(0, 10))}
          </span>
          {confirmingRevoke ? (
            <>
              <span className="text-sm">{labels.revokeConfirm}</span>
              <SmallButton disabled={pending} onClick={() => revoke(activeLink.id)}>
                {labels.revokeConfirmYes}
              </SmallButton>
              <SmallButton disabled={pending} onClick={() => setConfirmingRevoke(false)}>
                {labels.cancel}
              </SmallButton>
            </>
          ) : (
            <SmallButton disabled={pending} onClick={() => setConfirmingRevoke(true)}>
              {labels.revokeButton}
            </SmallButton>
          )}
        </div>
      ) : (
        <SmallButton tone="primary" disabled={pending} onClick={create}>
          {pending ? labels.creating : labels.createButton}
        </SmallButton>
      )}

      {revoked && !created && (
        <p className="text-muted-foreground mt-2 text-xs">{labels.revoked}</p>
      )}
      {failed && <InlineError>{labels.error}</InlineError>}
    </div>
  )
}
