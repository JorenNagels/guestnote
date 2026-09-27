import { quote } from '@guestnote/billing'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PricingCard } from './pricing-card.tsx'

/**
 * The public price (spec 0006, "Pricing is public"). Every expected figure is computed with
 * `quote()` here rather than written as `€49`: the claim under test is that the card shows what
 * the Billing screen would charge, so a change to `PRICING` must move both or neither. Checked by
 * mutation -- a card that formats its own arithmetic, or skips the cycle, fails below.
 */
const LABELS = {
  name: 'Studio',
  cycle: 'Billing',
  monthly: 'Monthly',
  yearly: 'Yearly',
  yearlyNote: '2 months free',
  perMonth: 'per month',
  perYear: 'per year',
  seats: 'Planners',
  seatsHelp: 'help',
  fewer: 'One fewer',
  more: 'One more',
  base: 'Studio, you included',
  total: 'Total',
  exclVat: 'excl. VAT',
}
const EXTRA = { 0: '', 1: '1 extra planner', 2: '2 extra planners', 3: '3 extra planners' }

const eur = (cents: number) =>
  new Intl.NumberFormat('en', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100)

const total = () => screen.getByTestId('price-total').textContent

describe('PricingCard', () => {
  it('shows one planner, monthly, excl. VAT, before anything is touched', () => {
    render(<PricingCard locale="en" labels={LABELS} extraLabels={EXTRA} maxSeats={3} />)
    expect(total()).toBe(eur(quote(1, 'monthly').subtotalCents))
    expect(screen.queryByText('1 extra planner')).toBeNull()
  })

  it('adds a seat at the seat price and names the extra planner', () => {
    render(<PricingCard locale="en" labels={LABELS} extraLabels={EXTRA} maxSeats={3} />)
    fireEvent.click(screen.getByRole('button', { name: 'One more' }))
    expect(total()).toBe(eur(quote(2, 'monthly').subtotalCents))
    expect(screen.getByText('1 extra planner')).toBeInTheDocument()
  })

  it('switches to the yearly price', () => {
    render(<PricingCard locale="en" labels={LABELS} extraLabels={EXTRA} maxSeats={3} />)
    fireEvent.click(screen.getByLabelText(/Yearly/))
    expect(total()).toBe(eur(quote(1, 'yearly').subtotalCents))
    expect(total()).not.toBe(eur(quote(1, 'monthly').subtotalCents))
  })

  it('never goes below one planner or above the cap', () => {
    render(<PricingCard locale="en" labels={LABELS} extraLabels={EXTRA} maxSeats={2} />)
    expect(screen.getByRole('button', { name: 'One fewer' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'One more' }))
    expect(screen.getByRole('button', { name: 'One more' })).toBeDisabled()
  })
})
