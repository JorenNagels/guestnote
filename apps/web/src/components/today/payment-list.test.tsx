import type { DuePaymentRow } from '@guestnote/db'
import { render, screen, within } from '@testing-library/react'
import { createTranslator } from 'next-intl'
import { describe, expect, it, vi } from 'vitest'
import nl from '../../../messages/app/today.nl.json'

// The real Dutch catalogue through next-intl's own translator, so the ICU plurals below are the
// shipped ones and not a stub's idea of them.
vi.mock('next-intl/server', () => ({
  getLocale: async () => 'nl',
  getTranslations: async () =>
    createTranslator({ locale: 'nl', messages: { app: { today: nl } }, namespace: 'app.today' }),
}))

const { PaymentList } = await import('./payment-list.tsx')

const TODAY = '2026-10-02'

const row = (over: Partial<DuePaymentRow> = {}): DuePaymentRow => ({
  id: 'p1',
  weddingId: 'w1',
  weddingName: 'Els & Jan',
  weddingColor: '#A94F4A',
  lineLabel: 'Dinner',
  vendorName: 'Traiteur A',
  dueOn: TODAY,
  amountCents: 504_000,
  ...over,
})

const renderList = async (payments: DuePaymentRow[]) =>
  render(<div data-testid="host">{await PaymentList({ payments, today: TODAY })}</div>)

// `Intl` puts a no-break space between `€` and the amount; the test reads text as a person would.
const text = (el: Element) => el.textContent?.replace(/ /g, ' ') ?? ''

describe('PaymentList', () => {
  it('renders nothing at all, heading included, when nothing is due', async () => {
    await renderList([])
    expect(screen.getByTestId('host')).toBeEmptyDOMElement()
  })

  it('heads the list with its count and links each row to its own wedding payments', async () => {
    await renderList([row(), row({ id: 'p2', weddingId: 'w2', weddingName: 'An & Bo' })])
    const section = screen.getByRole('region', { name: 'Betalingen' })
    expect(within(section).getByText('2 betalingen')).toBeInTheDocument()
    const links = within(section).getAllByRole('link')
    expect(links.map((l) => l.getAttribute('href'))).toEqual([
      '/weddings/w1/payments',
      '/weddings/w2/payments',
    ])
  })

  it('names the couple, the vendor as payee, and the amount', async () => {
    await renderList([row()])
    const link = screen.getByRole('link')
    expect(within(link).getByText('Els & Jan')).toBeInTheDocument()
    expect(within(link).getByText('Traiteur A')).toBeInTheDocument()
    expect(text(link)).toContain('€ 5.040,00')
  })

  it('falls back to the line as payee when the line names no vendor', async () => {
    await renderList([row({ vendorName: null })])
    expect(within(screen.getByRole('link')).getByText('Dinner')).toBeInTheDocument()
  })

  it('says a late payment is late in words, not by colour alone', async () => {
    await renderList([row({ dueOn: '2026-09-29' })])
    const when = screen.getByText('3 dagen te laat')
    expect(when).toHaveAttribute('datetime', '2026-09-29')
    expect(when).toHaveClass('text-destructive')
  })

  it('says one day late in the singular', async () => {
    await renderList([row({ dueOn: '2026-10-01' })])
    expect(screen.getByText('1 dag te laat')).toBeInTheDocument()
  })

  it('says due today, and due in so many days, without the late colour', async () => {
    await renderList([row(), row({ id: 'p2', dueOn: '2026-10-06' })])
    expect(screen.getByText('Vandaag te betalen')).not.toHaveClass('text-destructive')
    expect(screen.getByText('Over 4 dagen')).not.toHaveClass('text-destructive')
  })

  it("paints the wedding's dot and hides it from assistive technology", async () => {
    await renderList([row()])
    const dot = screen.getByTestId('wedding-dot')
    expect(dot).toHaveStyle({ backgroundColor: '#A94F4A' })
    expect(dot).toHaveAttribute('aria-hidden', 'true')
  })
})
