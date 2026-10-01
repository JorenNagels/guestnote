'use client'

import type { WeddingVendorRow } from '@guestnote/db'
import { InlineError } from '@guestnote/ui/inline-error'
import { useId, useState, useTransition } from 'react'
import {
  createVendorLinkAction,
  emailVendorLinkAction,
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
  /** Spec 0009 A4. `{name}` template, filled with the vendor's name. */
  emailButton: string
  emailing: string
  /** The disabled button's one-line reason. */
  emailNoAddress: string
  /** `{email}` template. */
  emailSent: string
  /** `{email}` template. Says the link exists and to copy it, because it does. */
  emailFailed: string
}

/**
 * Create, copy once, revoke. Spec 0003, S10.
 *
 * The plain token exists ONLY in `created` state, held in memory for this mount and never
 * written anywhere -- reloading the sheet loses it, same as the server: `vendor_links` stores
 * only the hash (`createVendorLinkAction`). "Create" reads "replace" (the repo revokes any
 * link already live for this vendor in the same transaction, see `vendor-links.ts`), so this
 * never needs to reconcile two live links.
 *
 * Spec 0009 A4: "Email the link to {name}" sits beside Create and does the same thing, then mails
 * the link to the vendor's address -- which the server reads itself; `vendorEmail` here only
 * decides whether the button is enabled and is never sent. It lands in the same `created` state,
 * so the token can still be copied, with one line saying where the mail went or that it did not.
 * Only beside Create, not beside a live link's Revoke: emailing mints a new link, and doing that
 * from a screen showing a live one would quietly replace a link the planner may have handed out.
 */
export function VendorLinkControls({
  weddingId,
  vendorLinkId,
  activeLink,
  vendorName,
  vendorEmail,
  labels,
}: {
  weddingId: string
  vendorLinkId: string
  activeLink: WeddingVendorRow['activeLink']
  vendorName: string
  vendorEmail: string | null
  labels: ManageLinkLabels
}) {
  const [created, setCreated] = useState<{
    token: string
    expiresAt: string
    /** Set only when the link came from the Email button. */
    mail?: { sentTo: string; mailed: boolean }
  } | null>(null)
  const [copied, setCopied] = useState(false)
  const [confirmingRevoke, setConfirmingRevoke] = useState(false)
  const [revoked, setRevoked] = useState(false)
  const [pending, startTransition] = useTransition()
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState<'create' | 'email' | null>(null)
  const [noAddress, setNoAddress] = useState(false)
  const reasonId = useId()
  const canEmail = (vendorEmail ?? '').trim() !== '' && !noAddress

  const create = () => {
    setFailed(false)
    setBusy('create')
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

  const email = () => {
    setFailed(false)
    setBusy('email')
    startTransition(async () => {
      try {
        const r = await emailVendorLinkAction(weddingId, vendorLinkId)
        if (r.ok) {
          setCreated({
            token: r.token,
            expiresAt: r.expiresAt,
            mail: { sentTo: r.sentTo, mailed: r.mailed },
          })
          setCopied(false)
        } else if (r.error === 'noEmail') {
          // The address was removed since this sheet rendered: say why, not "try again".
          setNoAddress(true)
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
          {created.mail?.mailed && (
            <p className="text-sm" role="status">
              {labels.emailSent.replace('{email}', created.mail.sentTo)}
            </p>
          )}
          {created.mail && !created.mail.mailed && (
            <InlineError>{labels.emailFailed.replace('{email}', created.mail.sentTo)}</InlineError>
          )}
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
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <SmallButton tone="primary" disabled={pending} onClick={create}>
              {pending && busy === 'create' ? labels.creating : labels.createButton}
            </SmallButton>
            <SmallButton
              disabled={pending || !canEmail}
              aria-describedby={canEmail ? undefined : reasonId}
              onClick={email}
            >
              {pending && busy === 'email'
                ? labels.emailing
                : labels.emailButton.replace('{name}', vendorName)}
            </SmallButton>
          </div>
          {!canEmail && (
            <p id={reasonId} className="text-muted-foreground text-xs">
              {labels.emailNoAddress}
            </p>
          )}
        </div>
      )}

      {revoked && !created && (
        <p className="text-muted-foreground mt-2 text-xs">{labels.revoked}</p>
      )}
      {failed && <InlineError>{labels.error}</InlineError>}
    </div>
  )
}
