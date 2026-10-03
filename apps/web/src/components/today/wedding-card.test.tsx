import type { WeddingSummary } from '@guestnote/db'
import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next-intl/server', () => ({
  getLocale: async () => 'nl',
  getTranslations: async () => (key: string) => key,
  getFormatter: async () => ({
    dateTime: (d: Date, o: Intl.DateTimeFormatOptions) => d.toLocaleDateString('nl', o),
  }),
}))

const { WeddingCard } = await import('./wedding-card.tsx')

const WEDDING: WeddingSummary = {
  id: 'w1',
  slug: 'els-en-jan',
  status: 'live',
  coupleDisplayName: 'Els & Jan',
  weddingDate: '2027-06-12',
  color: null,
  venue: null,
}

// `Date` only, so nothing else about the clock is faked (CLAUDE.md, the fake-timer trap).
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2027-06-01T10:00:00Z'))
})
afterEach(() => vi.useRealTimers())

const renderCard = async (over: Partial<WeddingSummary> = {}) =>
  render(await WeddingCard({ wedding: { ...WEDDING, ...over }, load: undefined }))

describe('WeddingCard', () => {
  it('says the countdown in words, and it is the link text a screen reader hears', async () => {
    await renderCard()
    expect(screen.getByRole('link')).toHaveAccessibleName(/Over 11 dagen/)
  })

  it('names the day itself', async () => {
    await renderCard({ weddingDate: '2027-06-01' })
    expect(screen.getByText('Vandaag')).toBeInTheDocument()
  })

  it('draws a dash, hidden from assistive technology, when there is no date', async () => {
    await renderCard({ weddingDate: null })
    expect(screen.getByText('–')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getByRole('link')).not.toHaveAccessibleName(/dagen|Vandaag/)
  })
})
