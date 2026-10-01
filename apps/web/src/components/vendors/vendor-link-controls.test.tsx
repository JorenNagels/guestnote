import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import linkCopy from '../../../messages/app/vendorLink.en.json'
import { manageLinkLabels } from './labels.ts'
import { VendorLinkControls } from './vendor-link-controls.tsx'

/**
 * Spec 0009 A4: "Email the link to {name}" beside Create. What the planner must be able to tell
 * from the sheet: whether the button can work for this vendor and, if not, why; where the mail
 * went; and, when it did not go, that the link exists anyway and can be copied.
 *
 * Labels come from the real English catalogue through the real `manageLinkLabels`, so a key
 * missing from the catalogue fails here rather than rendering its own name.
 */
const emailVendorLinkAction = vi.fn()
const createVendorLinkAction = vi.fn()
vi.mock('../../app/pro/(app)/weddings/[id]/vendors/actions.ts', () => ({
  emailVendorLinkAction: (...a: unknown[]) => emailVendorLinkAction(...a),
  createVendorLinkAction: (...a: unknown[]) => createVendorLinkAction(...a),
  revokeVendorLinkAction: vi.fn(),
}))

const lookup = (catalogue: Record<string, unknown>) => {
  const get = (key: string) =>
    key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], catalogue)
  const t = (key: string) => String(get(key))
  t.raw = get
  return t
}

const labels = manageLinkLabels(lookup(linkCopy))

function controls(
  over: { vendorEmail?: string | null; activeLink?: { id: string; expiresAt: Date } | null } = {},
) {
  render(
    <VendorLinkControls
      weddingId="w1"
      vendorLinkId="wv1"
      activeLink={over.activeLink ?? null}
      vendorName="Traiteur A"
      vendorEmail={over.vendorEmail === undefined ? 'info@traiteur.be' : over.vendorEmail}
      labels={labels}
    />,
  )
}

const emailButton = () => screen.getByRole('button', { name: 'Email the link to Traiteur A' })

/** Click, then let the transition's awaited action settle. */
async function click(el: HTMLElement) {
  await act(async () => {
    fireEvent.click(el)
  })
}

const LINK = { ok: true, token: 'tok_abc', expiresAt: '2026-11-01T10:00:00.000Z' } as const

beforeEach(() => {
  vi.clearAllMocks()
})

describe('the email button', () => {
  it('is enabled beside Create when the vendor has an address, and gives no reason', () => {
    controls()
    expect(emailButton()).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Create link' })).toBeInTheDocument()
    expect(screen.queryByText(labels.emailNoAddress)).not.toBeInTheDocument()
  })

  it.each([null, '', '   '])('is disabled with its reason when the address is %j', (address) => {
    controls({ vendorEmail: address })
    expect(emailButton()).toBeDisabled()
    // The reason is the button's description, so a screen reader hears why it is dimmed.
    expect(emailButton()).toHaveAccessibleDescription(labels.emailNoAddress)
  })

  it('is not offered beside a live link, where emailing would replace it unasked', () => {
    controls({ activeLink: { id: 'l1', expiresAt: new Date('2026-11-01T00:00:00Z') } })
    expect(screen.queryByRole('button', { name: /Email the link/ })).not.toBeInTheDocument()
  })

  it('sends only the ids -- the address is never passed to the server', async () => {
    emailVendorLinkAction.mockResolvedValue({ ...LINK, sentTo: 'info@traiteur.be', mailed: true })
    controls()
    await click(emailButton())
    expect(emailVendorLinkAction).toHaveBeenCalledWith('w1', 'wv1')
    expect(createVendorLinkAction).not.toHaveBeenCalled()
  })
})

describe('after sending', () => {
  it('says where it went, and still shows the link to copy', async () => {
    emailVendorLinkAction.mockResolvedValue({ ...LINK, sentTo: 'info@traiteur.be', mailed: true })
    controls()
    await click(emailButton())
    expect(screen.getByRole('status')).toHaveTextContent('Sent to info@traiteur.be.')
    expect(screen.getByText(/\/vendor\/tok_abc$/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('says the mail did not go but the link exists, and shows the link to copy', async () => {
    emailVendorLinkAction.mockResolvedValue({ ...LINK, sentTo: 'info@traiteur.be', mailed: false })
    controls()
    await click(emailButton())
    expect(screen.getByRole('alert')).toHaveTextContent(
      'The link was created, but the email to info@traiteur.be was not sent.',
    )
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.getByText(/\/vendor\/tok_abc$/)).toBeInTheDocument()
  })

  it('a plain Create says nothing about mail', async () => {
    createVendorLinkAction.mockResolvedValue(LINK)
    controls()
    await click(screen.getByRole('button', { name: 'Create link' }))
    expect(screen.getByText(/\/vendor\/tok_abc$/)).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('a refusal shows the generic error and no link', async () => {
    emailVendorLinkAction.mockResolvedValue({ ok: false, error: 'forbidden' })
    controls()
    await click(emailButton())
    expect(screen.getByRole('alert')).toHaveTextContent(labels.error)
    expect(screen.queryByText(/\/vendor\//)).not.toBeInTheDocument()
  })

  it('an address removed since the sheet opened disables the button and says why', async () => {
    emailVendorLinkAction.mockResolvedValue({ ok: false, error: 'noEmail' })
    controls()
    await click(emailButton())
    expect(emailButton()).toBeDisabled()
    expect(emailButton()).toHaveAccessibleDescription(labels.emailNoAddress)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
