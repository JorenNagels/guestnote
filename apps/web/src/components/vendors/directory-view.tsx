'use client'

import type { VendorRow } from '@guestnote/db'
import { Card } from '@guestnote/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeaderCell } from '@guestnote/ui/table'
import { useMemo, useState } from 'react'
import {
  archiveDirectoryVendor,
  createDirectoryVendor,
  updateDirectoryVendor,
} from '../../app/pro/(app)/vendors/actions.ts'
import { Monogram, SmallButton } from './controls.tsx'
import { type FormLabels, VendorForm } from './vendor-form.tsx'

export type DirectoryLabels = {
  add: string
  searchLabel: string
  searchPlaceholder: string
  emptyTitle: string
  emptyBody: string
  emptyReadOnly: string
  noResults: string
  caption: string
  colVendor: string
  colCategory: string
  colContact: string
  colActions: string
  edit: string
  /** Template with `{name}`. Filled here, because a function cannot cross the server boundary. */
  editAria: string
  readOnly: string
  form: FormLabels
}

type Sheet = { kind: 'new' } | { kind: 'edit'; vendor: VendorRow }

/** Case-insensitive match on everything a planner might remember about a vendor. */
export function matchesQuery(v: VendorRow, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return [v.name, v.category, v.email, v.phone].some((f) => f?.toLowerCase().includes(q))
}

/**
 * The org's vendor directory. Search is client-side over the whole list: a studio's directory
 * is hundreds of rows at the very most, and a round trip per keystroke loses to a
 * spreadsheet's Ctrl+F, which is the bar (CLAUDE.md).
 *
 * `canWrite` only decides what is drawn. The actions and the policies decide what is allowed.
 */
export function DirectoryView({
  vendors,
  canWrite,
  labels,
}: {
  vendors: VendorRow[]
  canWrite: boolean
  labels: DirectoryLabels
}) {
  const [query, setQuery] = useState('')
  const [sheet, setSheet] = useState<Sheet | null>(null)
  const shown = useMemo(() => vendors.filter((v) => matchesQuery(v, query)), [vendors, query])
  const close = () => setSheet(null)

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {vendors.length > 0 && (
          <input
            type="search"
            aria-label={labels.searchLabel}
            placeholder={labels.searchPlaceholder}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="bg-transparent h-[var(--control-h)] min-w-0 flex-1 basis-56 rounded-[var(--radius)] border border-[var(--input)] px-3 text-sm sm:max-w-sm"
          />
        )}
        <span className="flex-1" />
        {canWrite ? (
          <SmallButton tone="primary" onClick={() => setSheet({ kind: 'new' })}>
            {labels.add}
          </SmallButton>
        ) : (
          <p className="text-muted-foreground text-xs">{labels.readOnly}</p>
        )}
      </div>

      {vendors.length === 0 ? (
        <Card className="text-center">
          <p className="text-sm font-semibold">{labels.emptyTitle}</p>
          <p className="text-muted-foreground mx-auto mt-1 max-w-prose text-sm">
            {canWrite ? labels.emptyBody : labels.emptyReadOnly}
          </p>
        </Card>
      ) : shown.length === 0 ? (
        <p className="text-muted-foreground py-8 text-center text-sm">{labels.noResults}</p>
      ) : (
        <Table caption={labels.caption}>
          <TableHead>
            <tr>
              <TableHeaderCell>{labels.colVendor}</TableHeaderCell>
              <TableHeaderCell>{labels.colCategory}</TableHeaderCell>
              <TableHeaderCell>{labels.colContact}</TableHeaderCell>
              {canWrite && (
                <TableHeaderCell className="text-right">{labels.colActions}</TableHeaderCell>
              )}
            </tr>
          </TableHead>
          <TableBody>
            {shown.map((v) => (
              <tr key={v.id}>
                <TableCell>
                  <span className="flex min-w-0 items-center gap-2.5">
                    <Monogram name={v.name} />
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{v.name}</span>
                      {v.notes && (
                        <span className="text-muted-foreground block max-w-xs truncate text-xs">
                          {v.notes}
                        </span>
                      )}
                    </span>
                  </span>
                </TableCell>
                <TableCell className="text-muted-foreground">{v.category}</TableCell>
                <TableCell>
                  {v.email && (
                    <a
                      className="block truncate underline-offset-2 hover:underline"
                      href={`mailto:${v.email}`}
                    >
                      {v.email}
                    </a>
                  )}
                  {v.phone && (
                    <span className="text-muted-foreground block text-xs">{v.phone}</span>
                  )}
                </TableCell>
                {canWrite && (
                  <TableCell className="text-right">
                    <SmallButton
                      aria-label={labels.editAria.replace('{name}', v.name)}
                      onClick={() => setSheet({ kind: 'edit', vendor: v })}
                    >
                      {labels.edit}
                    </SmallButton>
                  </TableCell>
                )}
              </tr>
            ))}
          </TableBody>
        </Table>
      )}

      {sheet?.kind === 'new' && (
        <VendorForm
          labels={labels.form}
          onClose={close}
          onSubmit={(i) => createDirectoryVendor(i)}
        />
      )}
      {sheet?.kind === 'edit' && (
        <VendorForm
          labels={labels.form}
          vendor={sheet.vendor}
          onClose={close}
          onSubmit={(i) => updateDirectoryVendor(sheet.vendor.id, i)}
          onArchive={() => archiveDirectoryVendor(sheet.vendor.id)}
        />
      )}
    </div>
  )
}
