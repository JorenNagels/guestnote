import type { BudgetLine, BudgetPayment } from '@guestnote/db'
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TOAST_LABELS } from '../toast/fixtures.ts'
import { ToastProvider } from '../toast/toast-provider.tsx'
import { BudgetView } from './budget-view.tsx'
import { renderWithCopy } from './test-support.tsx'

const saveBudgetLine = vi.fn()
const removeBudgetLine = vi.fn()
const restoreLine = vi.fn()

vi.mock('../../app/pro/(app)/weddings/[id]/budget/actions.ts', () => ({
  saveBudgetLine: (...a: unknown[]) => saveBudgetLine(...a),
  removeBudgetLine: (...a: unknown[]) => removeBudgetLine(...a),
  restoreLine: (...a: unknown[]) => restoreLine(...a),
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

/**
 * With the toast provider as the layout mounts it, above the view, so a toast raised by the line
 * sheet outlives the sheet. Only for the delete cases: the provider's `status` region is always
 * in the DOM, and the inline-amount cases assert there is no other one.
 */
function viewWithToasts(lines: BudgetLine[]) {
  renderWithCopy(
    <ToastProvider labels={TOAST_LABELS}>
      <BudgetView weddingId={W} locale="en" lines={lines} payments={[]} vendors={[]} />
    </ToastProvider>,
  )
  return () => within(screen.getByTestId('toast')).getByRole('status')
}

beforeEach(() => {
  saveBudgetLine.mockReset().mockResolvedValue({ ok: true })
  removeBudgetLine.mockReset().mockResolvedValue({ ok: true })
  restoreLine.mockReset().mockResolvedValue({ ok: true })
})
afterEach(cleanup)

describe('BudgetView', () => {
  /**
   * Spec 0009 A1: the tab strip has one Geld tab for both money pages, so the page itself says
   * which one it is, before anything else on it. Literal paths, and `aria-current` on Budget
   * alone -- pass `current="payments"` in `budget-view.tsx` and this fails.
   */
  it('opens with the Budget | Payments switch, Budget current', () => {
    view([])
    const nav = screen.getByRole('navigation', { name: 'Money' })
    const links = within(nav)
      .getAllByRole('link')
      .map((a) => [a.textContent, a.getAttribute('href'), a.getAttribute('aria-current')])
    expect(links).toEqual([
      ['Budget', `/weddings/${W}/budget`, 'page'],
      ['Payments', `/weddings/${W}/payments`, null],
    ])
    const title = screen.getByRole('heading', { name: 'Budget', level: 2 })
    expect(nav.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

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

  /**
   * Spec 0009 B3: every category starts open, so the lines are on show without a click, and the
   * category's own toggle still closes it and says so in `aria-expanded`.
   */
  it('every category starts open on its lines, with vendor and the difference from the estimate', () => {
    view([
      line({
        id: 'a',
        label: 'Castle',
        estimateCents: 100_000,
        actualCents: 130_000,
        vendorName: 'Kasteel Ooidonk',
      }),
      line({ id: 'b', label: 'Roses', category: 'Flowers' }),
    ])
    expect(screen.getByText('Castle')).toBeTruthy()
    expect(screen.getByText('Roses')).toBeTruthy()
    expect(screen.getByText(/Kasteel Ooidonk/)).toBeTruthy()
    expect(screen.getByText(/€300\.00 above the estimate/)).toBeTruthy()
    const toggle = screen.getByRole('button', { name: 'Show or hide the lines of Venue' })
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByText('Castle')).toBeNull()
    expect(screen.getByText('Roses')).toBeTruthy()
  })

  it('one control above the table closes every category, then opens them all again', () => {
    view([
      line({ id: 'a', label: 'Castle' }),
      line({ id: 'b', label: 'Roses', category: 'Flowers' }),
    ])
    const toggles = () =>
      screen
        .getAllByRole('button', { name: /^Show or hide/ })
        .map((b) => b.getAttribute('aria-expanded'))
    fireEvent.click(screen.getByRole('button', { name: 'Collapse all' }))
    expect(toggles()).toEqual(['false', 'false'])
    expect(screen.queryByText('Castle')).toBeNull()
    expect(screen.queryByText('Roses')).toBeNull()
    // The label says what the next click will do: with anything still shut, that is opening.
    fireEvent.click(screen.getByRole('button', { name: 'Show or hide the lines of Flowers' }))
    expect(screen.queryByRole('button', { name: 'Collapse all' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Expand all' }))
    expect(toggles()).toEqual(['true', 'true'])
    expect(screen.getByText('Castle')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Collapse all' })).toBeTruthy()
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

  it('editing starts from the saved amounts', () => {
    view([line({ id: 'a', label: 'Castle', estimateCents: 123_450, actualCents: 5 })])
    fireEvent.click(screen.getByRole('button', { name: 'Edit Castle' }))
    expect((screen.getByLabelText('Allocated amount (€)') as HTMLInputElement).value).toBe(
      '1234.50',
    )
    expect((screen.getByLabelText('Spent amount (€)') as HTMLInputElement).value).toBe('0.05')
  })

  /**
   * Spec 0009 C4: no "are you sure". One click deletes, the sheet closes, and the toast -- which
   * lives above the sheet -- names the line and offers Undo, which calls the restore with the
   * same wedding and line.
   */
  it('deletes at once, closes the sheet, and offers Undo by name', async () => {
    const toast = viewWithToasts([line({ id: 'a', label: 'Castle' })])
    fireEvent.click(screen.getByRole('button', { name: 'Edit Castle' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete line' }))
    await waitFor(() => expect(removeBudgetLine).toHaveBeenCalledWith(W, 'a'))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(toast()).toHaveTextContent('“Castle” deleted, with its payments.')

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(restoreLine).toHaveBeenCalledWith(W, 'a'))
    await waitFor(() => expect(toast()).toHaveTextContent('Restored.'))
  })

  it('says so when the line cannot come back', async () => {
    restoreLine.mockResolvedValue({ ok: false, error: 'notFound' })
    const toast = viewWithToasts([line({ id: 'a', label: 'Castle' })])
    fireEvent.click(screen.getByRole('button', { name: 'Edit Castle' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete line' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(toast()).toHaveTextContent('This can no longer be restored.'))
  })

  it('keeps the sheet open, and raises no toast, when the delete is refused', async () => {
    removeBudgetLine.mockResolvedValue({ ok: false, error: 'notFound' })
    const toast = viewWithToasts([line({ id: 'a', label: 'Castle' })])
    fireEvent.click(screen.getByRole('button', { name: 'Edit Castle' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete line' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(toast()).toBeEmptyDOMElement()
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

  describe('amounts edited where they stand (spec 0009 B3)', () => {
    const castle = () =>
      line({
        id: 'a',
        label: 'Castle',
        category: 'Venue',
        estimateCents: 123_450,
        actualCents: 100_000,
        weddingVendorId: 'v1',
        vendorName: 'Kasteel Ooidonk',
      })
    const describedBy = (el: HTMLElement) =>
      document.getElementById(el.getAttribute('aria-describedby') ?? '')?.textContent

    it('the amount is a button naming the line, and becomes an input holding the value to type', () => {
      view([castle()])
      const button = screen.getByRole('button', { name: 'Change the allocated amount of Castle' })
      // The amount stays readable to a screen reader, as the button's description.
      expect(describedBy(button)).toBe('€1,234.50')
      fireEvent.click(button)
      const input = screen.getByLabelText('Allocated amount of Castle') as HTMLInputElement
      expect(input.value).toBe('1234.50')
      expect(document.activeElement).toBe(input)
      expect(screen.queryByRole('dialog')).toBeNull()
    })

    it('Enter saves the whole line, the other fields unchanged, and puts the button back', async () => {
      view([castle()])
      fireEvent.click(screen.getByRole('button', { name: 'Change the allocated amount of Castle' }))
      const input = screen.getByLabelText('Allocated amount of Castle')
      fireEvent.change(input, { target: { value: '1.500,00' } })
      fireEvent.keyDown(input, { key: 'Enter' })
      await waitFor(() => expect(saveBudgetLine).toHaveBeenCalledTimes(1))
      expect(saveBudgetLine).toHaveBeenCalledWith(W, 'a', {
        category: 'Venue',
        label: 'Castle',
        estimate: '1.500,00',
        actual: '1000.00',
        weddingVendorId: 'v1',
      })
      const button = await screen.findByRole('button', {
        name: 'Change the allocated amount of Castle',
      })
      expect(document.activeElement).toBe(button)
    })

    it('a line with no spent amount and no vendor sends both back empty, not as zero or a stray id', async () => {
      view([line({ id: 'b', label: 'Flowers', category: 'Decor', estimateCents: 50_000 })])
      fireEvent.click(
        screen.getByRole('button', { name: 'Change the allocated amount of Flowers' }),
      )
      const input = screen.getByLabelText('Allocated amount of Flowers')
      fireEvent.change(input, { target: { value: '600' } })
      fireEvent.keyDown(input, { key: 'Enter' })
      await waitFor(() => expect(saveBudgetLine).toHaveBeenCalledTimes(1))
      expect(saveBudgetLine).toHaveBeenCalledWith(W, 'b', {
        category: 'Decor',
        label: 'Flowers',
        estimate: '600',
        actual: '',
        weddingVendorId: '',
      })
    })

    it('leaving for another control keeps focus there, saved or unchanged', async () => {
      view([castle()])
      const spent = screen.getByRole('button', { name: 'Change the spent amount of Castle' })

      // Unchanged: the planner clicked the amount, then moved on without typing.
      fireEvent.click(screen.getByRole('button', { name: 'Change the allocated amount of Castle' }))
      act(() => spent.focus())
      expect(screen.queryByLabelText('Allocated amount of Castle')).toBeNull()
      expect(document.activeElement).toBe(spent)

      // Changed: the blur saves, and the save's return must not pull focus back to this amount.
      fireEvent.click(screen.getByRole('button', { name: 'Change the allocated amount of Castle' }))
      fireEvent.change(screen.getByLabelText('Allocated amount of Castle'), {
        target: { value: '1300' },
      })
      await act(async () => spent.focus())
      await waitFor(() => expect(saveBudgetLine).toHaveBeenCalledTimes(1))
      await waitFor(() => expect(screen.queryByLabelText('Allocated amount of Castle')).toBeNull())
      expect(document.activeElement).toBe(spent)
    })

    it('says it is saving while the action runs, and leaving then is not a second save', async () => {
      let finish: (v: { ok: true }) => void = () => {}
      saveBudgetLine.mockReturnValue(
        new Promise((r) => {
          finish = r
        }),
      )
      view([castle()])
      fireEvent.click(screen.getByRole('button', { name: 'Change the spent amount of Castle' }))
      const input = screen.getByLabelText('Spent amount of Castle')
      fireEvent.change(input, { target: { value: '900' } })
      fireEvent.keyDown(input, { key: 'Enter' })
      expect((await screen.findByRole('status')).textContent).toBe('Saving…')
      expect(input.getAttribute('aria-busy')).toBe('true')
      // The planner clicks elsewhere mid-save: the input is still there, and its blur is not a
      // second write of the same draft.
      fireEvent.blur(input)
      expect(saveBudgetLine).toHaveBeenCalledTimes(1)
      await act(async () => finish({ ok: true }))
      expect(screen.queryByRole('status')).toBeNull()
      expect(screen.queryByLabelText('Spent amount of Castle')).toBeNull()
    })

    it('Escape puts the amount back without saving', () => {
      view([castle()])
      fireEvent.click(screen.getByRole('button', { name: 'Change the allocated amount of Castle' }))
      const input = screen.getByLabelText('Allocated amount of Castle')
      fireEvent.change(input, { target: { value: '9' } })
      // A browser may fire blur as the focused input is removed; jsdom does not, and a blur on a
      // detached node never reaches React. One outer `act` holds the re-render back, so the blur
      // lands while the input is still mounted -- the case the `settled` ref exists for.
      act(() => {
        fireEvent.keyDown(input, { key: 'Escape' })
        fireEvent.blur(input)
      })
      expect(screen.queryByLabelText('Allocated amount of Castle')).toBeNull()
      expect(saveBudgetLine).not.toHaveBeenCalled()
      expect(document.activeElement).toBe(
        screen.getByRole('button', { name: 'Change the allocated amount of Castle' }),
      )
    })

    it('leaving the field saves it', async () => {
      view([castle()])
      fireEvent.click(screen.getByRole('button', { name: 'Change the spent amount of Castle' }))
      const input = screen.getByLabelText('Spent amount of Castle')
      fireEvent.change(input, { target: { value: '1100' } })
      fireEvent.blur(input)
      await waitFor(() => expect(saveBudgetLine).toHaveBeenCalledTimes(1))
      expect(saveBudgetLine.mock.calls[0]?.[2]).toMatchObject({
        estimate: '1234.50',
        actual: '1100',
      })
      await waitFor(() => expect(screen.queryByLabelText('Spent amount of Castle')).toBeNull())
    })

    it('leaving an unchanged field writes nothing', () => {
      view([castle()])
      fireEvent.click(screen.getByRole('button', { name: 'Change the spent amount of Castle' }))
      fireEvent.blur(screen.getByLabelText('Spent amount of Castle'))
      expect(screen.queryByLabelText('Spent amount of Castle')).toBeNull()
      expect(saveBudgetLine).not.toHaveBeenCalled()
    })

    it('spent may be emptied: no final amount yet', async () => {
      view([castle()])
      fireEvent.click(screen.getByRole('button', { name: 'Change the spent amount of Castle' }))
      const input = screen.getByLabelText('Spent amount of Castle')
      fireEvent.change(input, { target: { value: '' } })
      fireEvent.keyDown(input, { key: 'Enter' })
      await waitFor(() => expect(saveBudgetLine).toHaveBeenCalledTimes(1))
      expect(saveBudgetLine.mock.calls[0]?.[2]).toMatchObject({ estimate: '1234.50', actual: '' })
    })

    it('an empty spent amount opens as an empty input, and is described as not yet known', () => {
      view([line({ id: 'a', label: 'Castle' })])
      const button = screen.getByRole('button', { name: 'Change the spent amount of Castle' })
      expect(describedBy(button)).toContain('No final amount yet')
      fireEvent.click(button)
      expect((screen.getByLabelText('Spent amount of Castle') as HTMLInputElement).value).toBe('')
    })

    it('a refused value keeps the input and the draft, and says why under it', async () => {
      saveBudgetLine.mockResolvedValue({ ok: false, error: 'estimate' })
      view([castle()])
      fireEvent.click(screen.getByRole('button', { name: 'Change the allocated amount of Castle' }))
      const input = screen.getByLabelText('Allocated amount of Castle') as HTMLInputElement
      fireEvent.change(input, { target: { value: '-4' } })
      fireEvent.keyDown(input, { key: 'Enter' })
      const alert = await screen.findByRole('alert')
      expect(alert.textContent).toContain('Enter an amount')
      expect(screen.getByLabelText('Allocated amount of Castle')).toBe(input)
      expect(input.value).toBe('-4')
      expect(input.getAttribute('aria-invalid')).toBe('true')
      expect(input.getAttribute('aria-describedby')).toBe(alert.id)
      // Still open for the fix: the next Enter is a second try, not swallowed.
      fireEvent.change(input, { target: { value: '4' } })
      fireEvent.keyDown(input, { key: 'Enter' })
      await waitFor(() => expect(saveBudgetLine).toHaveBeenCalledTimes(2))
    })
  })
})
