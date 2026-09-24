'use client'

import type { VendorRow, WeddingVendorRow } from '@guestnote/db'
import { Card } from '@guestnote/ui/card'
import { InlineError } from '@guestnote/ui/inline-error'
import { Pill } from '@guestnote/ui/pill'
import { Table, TableBody, TableCell, TableHead, TableHeaderCell } from '@guestnote/ui/table'
import { useId, useMemo, useState, useTransition } from 'react'
import {
  addVendorToWedding,
  createVendorOnWedding,
  setWeddingVendorStatus,
} from '../../app/pro/(app)/weddings/[id]/vendors/actions.ts'
import { formatCents } from '../../lib/money.ts'
import { VENDOR_STATUSES, type VendorActionResult } from '../../lib/vendor-input.ts'
import { type ErrorLabels, errorText, Monogram, SELECT_CLASS, SmallButton } from './controls.tsx'
import { STATUS_TONE, type StatusLabels, type VendorStatus } from './status.tsx'
import { type FormLabels, VendorForm } from './vendor-form.tsx'
import type { ManageLinkLabels } from './vendor-link-controls.tsx'
import { WeddingVendorSheet } from './wedding-vendor-sheet.tsx'

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
  /** The unpaid payments on this vendor's budget lines -- the prototype's last column. */
  colOutstanding: string
  openOne: string
  /** Template with `{count}`, filled here for the same reason as `statusAria`. */
  openOther: string
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
  locale,
  labels,
}: {
  weddingId: string
  linked: WeddingVendorRow[]
  directory: VendorRow[]
  canCreate: boolean
  /** The wedding's own locale: amounts are written the way the budget and payments write them. */
  locale: string
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
              <TableHeaderCell className="text-right">{labels.colOutstanding}</TableHeaderCell>
              <TableHeaderCell className="text-right">{labels.colActions}</TableHeaderCell>
            </tr>
          </TableHead>
          <TableBody>
            {linked.map((v) => (
              <Row
                key={v.id}
                weddingId={weddingId}
                vendor={v}
                locale={locale}
                labels={labels}
                onEdit={() => setEditing(v)}
              />
            ))}
          </TableBody>
        </Table>
      )}

      {editing && (
        <WeddingVendorSheet
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
  locale,
  labels,
  onEdit,
}: {
  weddingId: string
  vendor: WeddingVendorRow
  locale: string
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
        {/* A dash and not "€ 0,00" for a vendor with nothing open: most rows on a real wedding
            are that, and a column of zeros hides the two that are not. */}
        {vendor.openPayments === 0 ? (
          <span className="text-muted-foreground">–</span>
        ) : (
          <>
            <span className="block font-mono text-sm whitespace-nowrap tabular-nums">
              {formatCents(vendor.outstandingCents, locale)}
            </span>
            <span className="text-muted-foreground block text-xs whitespace-nowrap">
              {vendor.openPayments === 1
                ? labels.openOne
                : labels.openOther.replace('{count}', String(vendor.openPayments))}
            </span>
          </>
        )}
      </TableCell>
      <TableCell className="text-right">
        <SmallButton aria-label={labels.editAria.replace('{name}', vendor.name)} onClick={onEdit}>
          {labels.edit}
        </SmallButton>
      </TableCell>
    </tr>
  )
}
