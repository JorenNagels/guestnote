import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { WeddingTabsView } from './wedding-tabs.tsx'

const LABELS = {
  overview: 'Overzicht',
  tasks: 'Checklist',
  budget: 'Budget',
  payments: 'Betalingen',
  vendors: 'Leveranciers',
  runSheet: 'Draaiboek',
  files: 'Bestanden',
  moodboard: 'Moodboard',
  settings: 'Instellingen',
} as const

const renderTabs = (current: Parameters<typeof WeddingTabsView>[0]['current']) =>
  render(<WeddingTabsView weddingId="w1" current={current} labels={LABELS} navLabel="Onderdelen" />)

describe('WeddingTabsView', () => {
  it('links every screen of the wedding at the path the browser shows', () => {
    renderTabs('overview')
    const nav = screen.getByRole('navigation', { name: 'Onderdelen' })
    const hrefs = Object.fromEntries(
      [...nav.querySelectorAll('a')].map((a) => [a.textContent, a.getAttribute('href')]),
    )
    expect(hrefs).toEqual({
      Overzicht: '/weddings/w1',
      Checklist: '/weddings/w1/tasks',
      Budget: '/weddings/w1/budget',
      Betalingen: '/weddings/w1/payments',
      Leveranciers: '/weddings/w1/vendors',
      Draaiboek: '/weddings/w1/run-sheet',
      Bestanden: '/weddings/w1/files',
      Moodboard: '/weddings/w1/moodboard',
      Instellingen: '/weddings/w1/settings',
    })
  })

  it('marks exactly the current screen', () => {
    renderTabs('budget')
    const current = screen.getAllByRole('link').filter((a) => a.hasAttribute('aria-current'))
    expect(current.map((a) => a.textContent)).toEqual(['Budget'])
    expect(current[0]?.getAttribute('aria-current')).toBe('page')
  })
})
