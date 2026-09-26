import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { BillingScreen, type BillingScreenLabels } from './billing-screen.tsx'

/**
 * The Billing screen from fixtures: the no-op provider can reach neither the paid state nor the
 * success banner, so these are the only place either is rendered (spec 0005, "Billing").
 */
const LABELS: BillingScreenLabels = {
  title: 'Billing',
  status: 'STATUS',
  success: null,
  plan: {
    title: 'Studio plan',
    pill: 'Trial',
    cycleLabel: 'Billing cycle',
    monthly: 'Monthly',
    yearly: 'Yearly · 2 months free',
    base: 'Studio',
    baseDetail: 'Includes you, Ilse',
    extra: '2 more planners',
    extraDetail: 'Jan, Els',
    pending: null,
    perMonth: '/ month',
    perYear: '/ year',
    total: 'Total',
    vat: 'VAT {amount}.',
    vatNone: 'No VAT.',
    checkout: 'Continue to checkout',
    checkoutBusy: 'Opening…',
    secure: 'SECURE',
    portal: 'Payment method and invoices ↗',
    portalBusy: 'Opening…',
    errors: { unavailable: 'E-UNAVAILABLE', failed: 'E-FAILED', forbidden: 'E-FORBIDDEN' },
  },
  details: {
    title: 'Invoice details',
    name: 'Billed to',
    email: 'Billing email',
    vat: 'VAT number',
    vatHelp: 'e.g. BE0123456789',
    save: 'Save',
    saving: 'Saving…',
    saved: 'Saved',
    errors: { tooLong: 'LONG', invalidEmail: 'BAD-EMAIL', invalidVat: 'BAD-VAT', failed: 'FAIL' },
  },
  invoices: {
    title: 'Invoices',
    empty: 'Nothing yet.',
    date: 'Date',
    number: 'Number',
    amount: 'Amount',
    pdf: 'PDF',
  },
  notes: { title: 'How billing works', seats: 'N1', change: 'N2', readOnly: 'N3' },
}

function renderScreen(over: Partial<Parameters<typeof BillingScreen>[0]> = {}) {
  const checkout = vi.fn(async () => ({ ok: false, reason: 'unavailable' }) as const)
  const portal = vi.fn(async () => ({ ok: false, reason: 'unavailable' }) as const)
  render(
    <BillingScreen
      labels={LABELS}
      tone="neutral"
      paid={false}
      seats={3}
      vatNumber={null}
      cycle="monthly"
      moneyLocale="en-GB"
      details={{ billingName: '', billingEmail: '', vatNumber: '' }}
      invoices={[]}
      actions={{ checkout, portal, saveDetails: vi.fn(async () => ({})) }}
      {...over}
    />,
  )
  return { checkout, portal }
}

describe('BillingScreen, trialling', () => {
  it('prices the live seats: 49 + 2 x 19 = 87 a month, VAT on top', () => {
    renderScreen()
    expect(screen.getByTestId('plan-total')).toHaveTextContent('€87.00')
    expect(screen.getByText('VAT €18.27.')).toBeInTheDocument()
    expect(screen.getByText('2 more planners')).toBeInTheDocument()
  })

  it('makes a year ten months when the toggle says yearly', () => {
    renderScreen()
    fireEvent.click(screen.getByRole('button', { name: 'Yearly · 2 months free' }))
    expect(screen.getByRole('button', { name: 'Yearly · 2 months free' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByTestId('plan-total')).toHaveTextContent('€870.00')
    expect(screen.getByTestId('plan-total')).toHaveTextContent('/ year')
  })

  it('drops the VAT line to "no VAT" with a VAT number', () => {
    renderScreen({ vatNumber: 'BE0123456789' })
    expect(screen.getByText('No VAT.')).toBeInTheDocument()
  })

  it('says checkout is unavailable inline instead of pretending, with the chosen cycle', async () => {
    const { checkout } = renderScreen()
    fireEvent.click(screen.getByRole('button', { name: 'Yearly · 2 months free' }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Continue to checkout' }))
    })
    expect(checkout).toHaveBeenCalledWith('yearly')
    expect(screen.getByRole('alert')).toHaveTextContent('E-UNAVAILABLE')
    expect(screen.getByText('SECURE')).toBeInTheDocument()
  })

  it('shows the empty invoices sentence and no success banner', () => {
    renderScreen()
    expect(screen.getByText('Nothing yet.')).toBeInTheDocument()
    expect(screen.queryByRole('status')).toBeNull()
  })
})

describe('BillingScreen, paid (fixtures)', () => {
  it('shows the success banner, the portal button instead of checkout, and invoice rows', async () => {
    const { portal } = renderScreen({
      paid: true,
      tone: 'success',
      labels: { ...LABELS, success: 'Payment received.', plan: { ...LABELS.plan, pill: 'Active' } },
      invoices: [
        {
          id: 'i1',
          date: '1 May 2027',
          number: 'GN-2027-0001',
          amount: '€105.27',
          pdfUrl: 'https://pay.example/i1.pdf',
        },
      ],
    })
    expect(screen.getByRole('status')).toHaveTextContent('Payment received.')
    expect(screen.getByText('Active')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Continue to checkout' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Monthly' })).toBeNull()
    const row = screen.getByRole('row', { name: /GN-2027-0001/ })
    expect(within(row).getByRole('link', { name: 'PDF' })).toHaveAttribute(
      'href',
      'https://pay.example/i1.pdf',
    )
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Payment method and invoices ↗' }))
    })
    expect(portal).toHaveBeenCalled()
  })
})

describe('BillingScreen, invoice details', () => {
  it('keeps typing across fields (the updater must not read the event late)', () => {
    renderScreen()
    const vat = screen.getByRole('textbox', { name: 'VAT number' })
    fireEvent.change(vat, { target: { value: 'BE0123456789' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Billed to' }), {
      target: { value: 'Studio Wit BV' },
    })
    expect(vat).toHaveValue('BE0123456789')
    expect(screen.getByRole('textbox', { name: 'Billed to' })).toHaveValue('Studio Wit BV')
  })
})
