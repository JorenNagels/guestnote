import type { WeddingVendorRow } from '@guestnote/db'
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import linkCopy from '../../../messages/app/vendorLink.en.json'
import copy from '../../../messages/app/vendors.en.json'
import { weddingLabels } from './labels.ts'
import { WeddingVendorsView } from './wedding-vendors-view.tsx'

vi.mock('../../app/pro/(app)/weddings/[id]/vendors/actions.ts', () => ({
  addVendorToWedding: vi.fn(),
  createVendorOnWedding: vi.fn(),
  setWeddingVendorStatus: vi.fn(),
  saveWeddingVendor: vi.fn(),
  removeVendorFromWedding: vi.fn(),
  createVendorLinkAction: vi.fn(),
  revokeVendorLinkAction: vi.fn(),
}))

/**
 * The outstanding column, added 2026-09-24 from the prototype's last vendor column. The sum
 * itself is the repo's (`money-repos.test.ts` proves which payments count); what is asserted
 * here is how the row SAYS it: the wedding's own money format, the count in words, and a dash
 * rather than a zero when nothing is open.
 *
 * Labels come from the real English catalogue through the real `weddingLabels`, so a key that
 * is missing from the catalogue fails here rather than rendering its own name.
 */
const lookup = (catalogue: Record<string, unknown>) => {
  const get = (key: string) =>
    key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], catalogue)
  const t = (key: string) => String(get(key))
  t.raw = get
  return t
}

const vendor = (over: Partial<WeddingVendorRow>): WeddingVendorRow => ({
  id: 'wv1',
  vendorId: 'v1',
  name: 'Traiteur A',
  category: 'Catering',
  email: null,
  phone: null,
  status: 'booked',
  notes: null,
  activeLink: null,
  outstandingCents: 0,
  openPayments: 0,
  ...over,
})

function view(linked: WeddingVendorRow[], locale = 'nl') {
  render(
    <WeddingVendorsView
      weddingId="w1"
      linked={linked}
      directory={[]}
      canCreate={false}
      locale={locale}
      labels={weddingLabels(lookup(copy), lookup(linkCopy))}
    />,
  )
  return (name: string) => screen.getByText(name).closest('tr') as HTMLElement
}

describe('the outstanding column', () => {
  it('has a header', () => {
    view([vendor({})])
    expect(screen.getByRole('columnheader', { name: 'Outstanding' })).toBeInTheDocument()
  })

  it("writes the amount in the wedding's own format, with the count in words", () => {
    const row = view([
      vendor({ outstandingCents: 604_000, openPayments: 2 }),
      vendor({
        id: 'wv2',
        vendorId: 'v2',
        name: 'DJ B',
        outstandingCents: 50_050,
        openPayments: 1,
      }),
    ])
    // nl-BE: a dot between thousands and a comma before cents. `\s?` for the NBSP Intl may put
    // after the sign.
    expect(within(row('Traiteur A')).getByText(/€\s?6\.040,00/)).toBeInTheDocument()
    expect(within(row('Traiteur A')).getByText('2 payments')).toBeInTheDocument()
    expect(within(row('DJ B')).getByText('1 payment')).toBeInTheDocument()
  })

  it('follows the wedding locale, not a fixed one', () => {
    const row = view([vendor({ outstandingCents: 604_000, openPayments: 2 })], 'en')
    expect(within(row('Traiteur A')).getByText('€6,040.00')).toBeInTheDocument()
  })

  it('shows a dash, not a zero amount, when nothing is open', () => {
    const row = view([vendor({})])
    expect(within(row('Traiteur A')).getByText('–')).toBeInTheDocument()
    expect(within(row('Traiteur A')).queryByText(/€/)).not.toBeInTheDocument()
  })
})
