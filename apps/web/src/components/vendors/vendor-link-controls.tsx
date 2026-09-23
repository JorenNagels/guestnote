'use client'

import type { WeddingVendorRow } from '@guestnote/db'
import { InlineError } from '@guestnote/ui/inline-error'
import { useState, useTransition } from 'react'
import {
  createVendorLinkAction,
  revokeVendorLinkAction,
} from '../../app/pro/(app)/weddings/[id]/vendors/actions.ts'
import { SmallButton } from './controls.tsx'

/**
 * Spec 0003, S10: create/copy/revoke a vendor's signed link. Read by `VendorLinkControls` alone, and
 * kept as its own type (not folded into `WeddingLabels`' flat shape) so `app.vendorLink`'s catalogue
 * stays S10's file -- `catalogue.ts` merges one slice's JSON per key, and `WeddingLabels`
 * already reads `app.vendors`.
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

/**
 * Create, copy once, revoke. Spec 0003, S10.
 *
 * The plain token exists ONLY in `created` state, held in memory for this mount and never
 * written anywhere -- reloading the sheet loses it, same as the server: `vendor_links` stores
 * only the hash (`createVendorLinkAction`). "Create" reads "replace" (the repo revokes any
 * link already live for this vendor in the same transaction, see `vendor-links.ts`), so this
 * never needs to reconcile two live links.
 */
export function VendorLinkControls({
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
