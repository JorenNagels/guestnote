import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

/**
 * The strip's current tab, read from the URL segment below the wedding layout. It matters because
 * the layout is not re-rendered on a tab switch: a `current` from the server would stay on the
 * first tab opened.
 */
let segment: string | null = null
vi.mock('next/navigation', () => ({ useSelectedLayoutSegment: () => segment }))

const { WeddingTabsNav, tabForSegment } = await import('./wedding-tabs-nav.tsx')

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
}

describe('tabForSegment', () => {
  it.each([
    [null, 'overview'],
    ['tasks', 'tasks'],
    ['run-sheet', 'runSheet'],
    ['settings', 'settings'],
    ['something-new', 'overview'],
  ])('%s is the %s tab', (seg, tab) => {
    expect(tabForSegment(seg)).toBe(tab)
  })
})

describe('WeddingTabsNav', () => {
  it('marks the tab under the current segment, and moves with it', () => {
    segment = 'budget'
    const { rerender } = render(<WeddingTabsNav weddingId="w1" labels={LABELS} navLabel="Tabs" />)
    expect(screen.getByRole('link', { name: 'Budget' })).toHaveAttribute('aria-current', 'page')

    segment = 'run-sheet'
    rerender(<WeddingTabsNav weddingId="w1" labels={LABELS} navLabel="Tabs" />)
    expect(screen.getByRole('link', { name: 'Draaiboek' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Budget' })).not.toHaveAttribute('aria-current')
  })
})
