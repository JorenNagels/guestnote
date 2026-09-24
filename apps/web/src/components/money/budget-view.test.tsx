import type { BudgetLine, BudgetPayment } from '@guestnote/db'
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BudgetView } from './budget-view.tsx'
import { renderWithCopy } from './test-support.tsx'

const saveBudgetLine = vi.fn()
const removeBudgetLine = vi.fn()

vi.mock('../../app/pro/(app)/weddings/[id]/budget/actions.ts', () => ({
  saveBudgetLine: (...a: unknown[]) => saveBudgetLine(...a),
  removeBudgetLine: (...a: unknown[]) => removeBudgetLine(...a),
}))

const W = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b'

const line = (over: Partial<BudgetLine> & Pick<BudgetLine, 'id' | 'label'>): BudgetLine => ({
  category: 'Venue',
  estimateCents: 100_000,
  actualCents: null,
  weddingVendorId: null,
  vendorName: null,
  ...over,
})

function view(
  lines: BudgetLine[],
  payments: BudgetPayment[] = [],
  vendors = [] as { id: string; name: string }[],
) {
  return renderWithCopy(
    <BudgetView weddingId={W} locale="en" lines={lines} payments={payments} vendors={vendors} />,
  )
}

beforeEach(() => {
  saveBudgetLine.mockReset().mockResolvedValue({ ok: true })
  removeBudgetLine.mockReset().mockResolvedValue({ ok: true })
})
afterEach(cleanup)

describe('BudgetView', () => {
  it('empty: one card and one button, and the button opens the new-line sheet', () => {
    view([])
    expect(screen.getByRole('heading', { name: 'No budget lines yet' })).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Add the first line' }))
    expect(screen.getByRole('dialog', { name: 'New budget line' })).toBeTruthy()
  })

  it('one line: the totals equal the line', () => {
    view([line({ id: 'a', label: 'Castle', estimateCents: 500_000, actualCents: 450_000 })])
    const totals = screen.getAllByRole('term').map((dt) => dt.parentElement?.textContent ?? '')
    expect(totals[0]).toContain('€5,000.00')
    expect(totals[1]).toContain('€4,500.00')
    expect(totals[2]).toContain('€500.00')
  })

  it('many: sums across categories and says over, in words, when spending passes the allocation', () => {
    view([
      line({ id: 'a', label: 'Castle', estimateCents: 500_000, actualCents: 520_000 }),
      line({
        id: 'b',
        label: 'Roses',
        category: 'Flowers',
        estimateCents: 100_000,
        actualCents: 60_000,
      }),
    ])
    const table = screen.getByRole('table', { name: 'Budget by category' })
    // Categories keep the order they were entered in.
    const names = within(table)
      .getAllByRole('button', { name: /^Show or hide/ })
      .map((b) => b.getAttribute('aria-label'))
    expect(names).toEqual(['Show or hide the lines of Venue', 'Show or hide the lines of Flowers'])
    expect(within(table).getByText(/€200\.00 over/)).toBeTruthy()
    expect(within(table).getByText(/€400\.00 left/)).toBeTruthy()
    expect(screen.getAllByText('€6,000.00').length).toBeGreaterThan(0)
    // Remaining is 6,000 - 5,800, and stays positive.
    expect(screen.queryByText(/over budget/)).toBeNull()
  })

  it('shows a negative remaining with the words "over budget", not colour alone', () => {
    view([line({ id: 'a', label: 'Castle', estimateCents: 100_000, actualCents: 130_000 })])
    expect(screen.getByText('€300.00 over budget')).toBeTruthy()
  })

  it('a category opens onto its lines, with vendor and the difference from the estimate', () => {
    view([
      line({
        id: 'a',
        label: 'Castle',
        estimateCents: 100_000,
        actualCents: 130_000,
        vendorName: 'Kasteel Ooidonk',
      }),
    ])
    expect(screen.queryByText('Castle')).toBeNull()
    const toggle = screen.getByRole('button', { name: 'Show or hide the lines of Venue' })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText('Castle')).toBeTruthy()
    expect(screen.getByText(/Kasteel Ooidonk/)).toBeTruthy()
    expect(screen.getByText(/€300\.00 above the estimate/)).toBeTruthy()
  })

  it('paid is counted only from payments that were paid', () => {
    view(
      [line({ id: 'a', label: 'Castle', estimateCents: 100_000, actualCents: 100_000 })],
      [
        { budgetLineId: 'a', amountCents: 25_000, paidAt: new Date('2027-01-01T12:00:00Z') },
        { budgetLineId: 'a', amountCents: 75_000, paidAt: null },
      ],
    )
    expect(screen.getAllByText('€250.00 paid').length).toBeGreaterThan(0)
    expect(screen.getByText('25% of the spent amount is paid')).toBeTruthy()
  })

  it('saves a new line with the typed text, untouched, for the server to parse', async () => {
    view([line({ id: 'a', label: 'Castle' })])
    fireEvent.click(screen.getByRole('button', { name: 'Add a line' }))
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'Music' } })
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'DJ' } })
    fireEvent.change(screen.getByLabelText('Allocated amount (€)'), {
      target: { value: '1.234,50' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(saveBudgetLine).toHaveBeenCalledTimes(1))
    expect(saveBudgetLine).toHaveBeenCalledWith(W, null, {
      category: 'Music',
      label: 'DJ',
      estimate: '1.234,50',
      actual: '',
      weddingVendorId: '',
    })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('a refused save keeps the sheet and the draft and says which field', async () => {
    saveBudgetLine.mockResolvedValue({ ok: false, error: 'estimate' })
    view([line({ id: 'a', label: 'Castle' })])
    fireEvent.click(screen.getByRole('button', { name: 'Add a line' }))
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'DJ' } })
    fireEvent.change(screen.getByLabelText('Allocated amount (€)'), { target: { value: '-4' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Enter an amount')
    expect((screen.getByLabelText('Description') as HTMLInputElement).value).toBe('DJ')
    expect(screen.getByLabelText('Allocated amount (€)').getAttribute('aria-invalid')).toBe('true')
  })

  it('editing starts from the saved amounts, and delete asks once before it acts', async () => {
    view([line({ id: 'a', label: 'Castle', estimateCents: 123_450, actualCents: 5 })])
    fireEvent.click(screen.getByRole('button', { name: 'Show or hide the lines of Venue' }))
    fireEvent.click(screen.getByRole('button', { name: 'Edit Castle' }))
    expect((screen.getByLabelText('Allocated amount (€)') as HTMLInputElement).value).toBe(
      '1234.50',
    )
    expect((screen.getByLabelText('Spent amount (€)') as HTMLInputElement).value).toBe('0.05')

    fireEvent.click(screen.getByRole('button', { name: 'Delete line' }))
    expect(removeBudgetLine).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Yes, delete' }))
    await waitFor(() => expect(removeBudgetLine).toHaveBeenCalledWith(W, 'a'))
  })

  it('the vendor picker says so when the wedding has no vendors yet', () => {
    view([line({ id: 'a', label: 'Castle' })])
    fireEvent.click(screen.getByRole('button', { name: 'Add a line' }))
    expect(screen.getByText(/No vendors on this wedding yet/)).toBeTruthy()
  })

  it('offers the wedding vendors by name', () => {
    view([line({ id: 'a', label: 'Castle' })], [], [{ id: 'v1', name: 'Kasteel Ooidonk' }])
    fireEvent.click(screen.getByRole('button', { name: 'Add a line' }))
    expect(screen.getByRole('option', { name: 'Kasteel Ooidonk' })).toBeTruthy()
    expect(screen.queryByText(/No vendors on this wedding yet/)).toBeNull()
  })
})
