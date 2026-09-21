import type { PaymentLineOption, PaymentRow } from '@guestnote/db'
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PaymentsView } from './payments-view.tsx'
import { renderWithCopy } from './test-support.tsx'

const savePayment = vi.fn()
const removePayment = vi.fn()
const markPaymentPaid = vi.fn()

vi.mock('../../app/pro/(app)/weddings/[id]/payments/actions.ts', () => ({
  savePayment: (...a: unknown[]) => savePayment(...a),
  removePayment: (...a: unknown[]) => removePayment(...a),
  markPaymentPaid: (...a: unknown[]) => markPaymentPaid(...a),
}))

const W = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b'
const TODAY = '2027-06-10'
const wedding = { coupleDisplayName: 'Emma and Lucas', timezone: 'Europe/Brussels', locale: 'en' }
const lines: PaymentLineOption[] = [{ id: 'l1', label: 'Castle', category: 'Venue' }]

const pay = (over: Partial<PaymentRow> & Pick<PaymentRow, 'id' | 'dueOn'>): PaymentRow => ({
  budgetLineId: 'l1',
  lineLabel: 'Castle',
  category: 'Venue',
  vendorName: null,
  amountCents: 100_000,
  paidAt: null,
  ...over,
})

function view(payments: PaymentRow[], l = lines) {
  return renderWithCopy(
    <PaymentsView weddingId={W} wedding={wedding} today={TODAY} payments={payments} lines={l} />,
  )
}

beforeEach(() => {
  savePayment.mockReset().mockResolvedValue({ ok: true })
  removePayment.mockReset().mockResolvedValue({ ok: true })
  markPaymentPaid.mockReset().mockResolvedValue({ ok: true })
})
afterEach(cleanup)

describe('PaymentsView', () => {
  it('no budget lines: says to make one first and links to the budget', () => {
    view([], [])
    expect(screen.getByRole('heading', { name: 'A budget line first' })).toBeTruthy()
    const link = screen.getByRole('link', { name: 'Go to the budget' })
    expect(link.getAttribute('href')).toBe(`/weddings/${W}/budget`)
    expect(screen.queryByRole('button', { name: 'Add a payment' })).toBeNull()
  })

  it('lines but no payments: one button, which opens the sheet on the first line to pick', () => {
    view([])
    expect(screen.getByRole('heading', { name: 'No payments yet' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Add the first payment' }))
    expect(screen.getByRole('dialog', { name: 'New payment' })).toBeTruthy()
    expect((screen.getByLabelText('Due date') as HTMLInputElement).value).toBe(TODAY)
  })

  it('says overdue in words and only for unpaid rows before today', () => {
    view([
      pay({ id: 'late', dueOn: '2027-06-07', vendorName: 'Kasteel Ooidonk' }),
      pay({ id: 'today', dueOn: TODAY, lineLabel: 'Today line' }),
      pay({ id: 'soon', dueOn: '2027-06-11', lineLabel: 'Soon line' }),
      pay({
        id: 'done',
        dueOn: '2027-01-01',
        lineLabel: 'Done line',
        paidAt: new Date('2027-01-02T12:00:00Z'),
      }),
    ])
    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1)
    const text = (i: number) => rows[i]?.textContent ?? ''
    expect(text(0)).toContain('Kasteel Ooidonk')
    expect(text(0)).toContain('Overdue')
    expect(text(0)).toContain('3 days late')
    expect(text(1)).toContain('To pay')
    expect(text(1)).toContain('Today')
    expect(text(1)).not.toContain('Overdue')
    expect(text(2)).toContain('In 1 day')
    expect(text(3)).toContain('Paid')
    expect(text(3)).toContain('Paid on 2 Jan 2027')
    expect(text(3)).not.toContain('Overdue')
  })

  it('totals: paid, outstanding including the late part, and past due with a count', () => {
    view([
      pay({ id: 'a', dueOn: '2027-06-01', amountCents: 20_000 }),
      pay({ id: 'b', dueOn: '2027-07-01', amountCents: 30_000 }),
      pay({
        id: 'c',
        dueOn: '2027-01-01',
        amountCents: 50_000,
        paidAt: new Date('2027-01-02T12:00:00Z'),
      }),
    ])
    const cards = screen.getAllByRole('term').map((dt) => dt.parentElement?.textContent ?? '')
    expect(cards[0]).toContain('Paid')
    expect(cards[0]).toContain('€500.00')
    expect(cards[1]).toContain('Outstanding')
    expect(cards[1]).toContain('€500.00')
    expect(cards[2]).toContain('Past due')
    expect(cards[2]).toContain('€200.00')
    expect(cards[2]).toContain('1 payment late')
  })

  it('mark paid asks the server, and a paid row offers the reverse', async () => {
    view([
      pay({ id: 'open', dueOn: '2027-07-01', lineLabel: 'Open one' }),
      pay({
        id: 'done',
        dueOn: '2027-01-01',
        lineLabel: 'Done one',
        paidAt: new Date('2027-01-02T12:00:00Z'),
      }),
    ])
    fireEvent.click(screen.getByRole('button', { name: 'Mark Open one, 1 Jul 2027 as paid' }))
    await waitFor(() => expect(markPaymentPaid).toHaveBeenCalledWith(W, 'open', true))
    fireEvent.click(screen.getByRole('button', { name: 'Mark Done one, 1 Jan 2027 as unpaid' }))
    await waitFor(() => expect(markPaymentPaid).toHaveBeenCalledWith(W, 'done', false))
  })

  it('a refused quick toggle says so on the page', async () => {
    markPaymentPaid.mockResolvedValue({ ok: false, error: 'notFound' })
    view([pay({ id: 'open', dueOn: '2027-07-01', lineLabel: 'Open one' })])
    fireEvent.click(screen.getByRole('button', { name: 'Mark Open one, 1 Jul 2027 as paid' }))
    expect((await screen.findByRole('alert')).textContent).toContain('no longer exists')
  })

  it('saves with the typed text, and keeps the sheet with the field named when refused', async () => {
    savePayment.mockResolvedValue({ ok: false, error: 'amount' })
    view([pay({ id: 'a', dueOn: '2027-07-01' })])
    fireEvent.click(screen.getByRole('button', { name: 'Add a payment' }))
    fireEvent.change(screen.getByLabelText('Budget line'), { target: { value: 'l1' } })
    fireEvent.change(screen.getByLabelText('Amount (€)'), { target: { value: 'x' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(savePayment).toHaveBeenCalledWith(W, null, {
        budgetLineId: 'l1',
        dueOn: TODAY,
        amount: 'x',
        paidOn: '',
      }),
    )
    expect((await screen.findByRole('alert')).textContent).toContain('Enter an amount')
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByLabelText('Amount (€)').getAttribute('aria-invalid')).toBe('true')
  })

  it('editing starts from the saved amount and paid-on date in the wedding zone', () => {
    view([
      pay({
        id: 'a',
        dueOn: '2027-07-01',
        amountCents: 250_075,
        paidAt: new Date('2027-01-02T12:00:00Z'),
      }),
    ])
    fireEvent.click(screen.getByRole('button', { name: 'Edit payment to Castle, 1 Jul 2027' }))
    expect((screen.getByLabelText('Amount (€)') as HTMLInputElement).value).toBe('2500.75')
    expect((screen.getByLabelText('Paid on') as HTMLInputElement).value).toBe('2027-01-02')
  })

  it('delete asks once before it acts', async () => {
    view([pay({ id: 'a', dueOn: '2027-07-01' })])
    fireEvent.click(screen.getByRole('button', { name: 'Edit payment to Castle, 1 Jul 2027' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete payment' }))
    expect(removePayment).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Yes, delete' }))
    await waitFor(() => expect(removePayment).toHaveBeenCalledWith(W, 'a'))
  })
})
