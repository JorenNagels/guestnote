'use client'

import { Pill } from '@guestnote/ui/pill'
import { Table, TableBody, TableCell, TableHead, TableHeaderCell } from '@guestnote/ui/table'
import { useState, useTransition } from 'react'

export type PendingRow = {
  readonly id: string
  readonly email: string
  readonly roleLabel: string
  /** "Sent 3 days ago" and "expires in 4 days", already joined; or the expired word. */
  readonly statusLabel: string
  readonly expired: boolean
  /** "Revoke the invitation for x@y", so a screen reader hears which one. */
  readonly revokeLabel: string
}

export type PendingInvitesCopy = {
  readonly caption: string
  readonly email: string
  readonly role: string
  readonly status: string
  readonly revoke: string
  readonly revoking: string
  readonly revokeFailed: string
  readonly expiredPill: string
}

/**
 * The invitations nobody has accepted. Revoke is per row and never a bulk action: there is
 * one planner, a handful of rows, and a misclick on "revoke all" would be worse than ten clicks.
 *
 * The action is a prop (see `InviteForm`). A failed revoke shows one line under the table
 * and leaves the row; the page is server-rendered, so a successful one is the action's
 * `revalidatePath` removing the row on the next render, not local state.
 */
export function PendingInvites({
  rows,
  copy,
  revoke,
}: {
  rows: readonly PendingRow[]
  copy: PendingInvitesCopy
  revoke: (invitationId: string) => Promise<{ ok: boolean }>
}) {
  const [busyId, setBusyId] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const [, start] = useTransition()

  function revokeRow(id: string) {
    setBusyId(id)
    setFailed(false)
    start(async () => {
      const result = await revoke(id)
      if (!result.ok) setFailed(true)
      setBusyId(null)
    })
  }

  return (
    <div>
      <Table caption={copy.caption}>
        <TableHead>
          <tr>
            <TableHeaderCell>{copy.email}</TableHeaderCell>
            <TableHeaderCell>{copy.role}</TableHeaderCell>
            <TableHeaderCell>{copy.status}</TableHeaderCell>
            {/* `relative` so the sr-only span is clipped by the scrolling table wrapper; an
                absolutely positioned child of a non-positioned scroller escapes it and
                widens the page (measured 2026-09-21 at 390px: 409 wide). */}
            <TableHeaderCell className="relative">
              <span className="sr-only">{copy.revoke}</span>
            </TableHeaderCell>
          </tr>
        </TableHead>
        <TableBody>
          {rows.map((row) => (
            <tr key={row.id}>
              <TableCell className="max-w-[16rem] truncate">{row.email}</TableCell>
              <TableCell>{row.roleLabel}</TableCell>
              <TableCell className="text-muted-foreground">
                {row.expired ? <Pill tone="warning">{copy.expiredPill}</Pill> : row.statusLabel}
              </TableCell>
              <TableCell className="text-right">
                <button
                  type="button"
                  onClick={() => revokeRow(row.id)}
                  disabled={busyId !== null}
                  aria-label={row.revokeLabel}
                  className="text-muted-foreground hover:text-foreground text-xs underline underline-offset-[3px] enabled:cursor-pointer disabled:cursor-default disabled:opacity-60"
                >
                  {busyId === row.id ? copy.revoking : copy.revoke}
                </button>
              </TableCell>
            </tr>
          ))}
        </TableBody>
      </Table>
      {failed ? (
        <p role="alert" className="text-destructive mt-2 text-xs">
          {copy.revokeFailed}
        </p>
      ) : null}
    </div>
  )
}
