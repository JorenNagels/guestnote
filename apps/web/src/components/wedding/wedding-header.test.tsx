import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next-intl/server', () => ({
  getLocale: async () => 'nl',
  getTranslations: async () => (key: string) =>
    ({
      noDate: 'Nog geen datum',
      noVenue: 'Nog geen locatie',
      live: 'Live',
      draft: 'Concept',
      archived: 'Gearchiveerd',
    })[key] ?? key,
}))

const { WeddingHeader } = await import('./wedding-header.tsx')

type Wedding = {
  coupleDisplayName: string
  weddingDate: string | null
  venue: string | null
  color: string | null
  status: string
}

const WEDDING: Wedding = {
  coupleDisplayName: 'Els & Jan',
  weddingDate: '2027-06-12',
  venue: 'Kasteel van Gaasbeek',
  color: '#A94F4A',
  status: 'live',
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2027-06-01T10:00:00Z'))
})
afterEach(() => vi.useRealTimers())

const renderHeader = async (over: Partial<Wedding> = {}, eyebrow?: string) =>
  render(await WeddingHeader({ wedding: { ...WEDDING, ...over }, ...(eyebrow ? { eyebrow } : {}) }))

describe('WeddingHeader', () => {
  it('shows the couple, the stage, the date with its countdown, and the venue', async () => {
    await renderHeader()
    expect(screen.getByRole('heading', { name: 'Els & Jan' })).toBeInTheDocument()
    expect(screen.getByText('Live')).toBeInTheDocument()
    expect(screen.getByText(/12 juni 2027/)).toBeInTheDocument()
    expect(screen.getByText('T-11')).toBeInTheDocument()
    expect(screen.getByText('Kasteel van Gaasbeek')).toBeInTheDocument()
  })

  it('paints the dot in the wedding colour, and hides it from assistive technology', async () => {
    await renderHeader()
    const dot = screen.getByTestId('wedding-dot')
    expect(dot).toHaveStyle({ backgroundColor: '#A94F4A' })
    expect(dot).toHaveAttribute('aria-hidden', 'true')
  })

  it('has a neutral dot when there is no colour', async () => {
    await renderHeader({ color: null })
    expect(screen.getByTestId('wedding-dot').getAttribute('style')).toBeNull()
  })

  it('says so when there is no date or no venue, and shows no countdown', async () => {
    await renderHeader({ weddingDate: null, venue: null })
    expect(screen.getByText('Nog geen datum')).toBeInTheDocument()
    expect(screen.getByText('Nog geen locatie')).toBeInTheDocument()
    expect(screen.queryByText(/^T[-+]/)).not.toBeInTheDocument()
  })

  it('shows no countdown for an archived wedding, and counts past days as T+n otherwise', async () => {
    const { unmount } = await renderHeader({ status: 'archived' })
    expect(screen.queryByText(/^T[-+]/)).not.toBeInTheDocument()
    unmount()
    await renderHeader({ weddingDate: '2027-05-30' })
    expect(screen.getByText('T+2')).toBeInTheDocument()
  })

  it('carries an eyebrow when a screen passes one', async () => {
    await renderHeader({}, 'Instellingen')
    expect(screen.getByText('Instellingen')).toBeInTheDocument()
  })
})
