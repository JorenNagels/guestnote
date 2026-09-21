import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Pill, type PillTone } from './pill.tsx'

const TONES: PillTone[] = ['success', 'neutral', 'warning', 'info', 'accent', 'danger']

describe('Pill', () => {
  it('says the state in words', () => {
    render(<Pill tone="danger">Overdue</Pill>)
    expect(screen.getByText('Overdue')).toBeInTheDocument()
  })

  it('hides the dot from assistive technology, so the word is the whole state', () => {
    const { container } = render(<Pill tone="success">Paid</Pill>)
    const dot = container.querySelector('[aria-hidden="true"]')
    expect(dot).not.toBeNull()
    expect(dot).toBeEmptyDOMElement()
    expect(container.textContent).toBe('Paid')
  })

  it('draws every tone from the status tokens and no two tones the same', () => {
    const seen = new Set<string>()
    for (const tone of TONES) {
      const { container, unmount } = render(<Pill tone={tone}>x</Pill>)
      const root = container.firstElementChild
      expect(root?.className).toMatch(/bg-st-[a-z]+-bg/)
      expect(root?.className).toMatch(/text-st-[a-z]+-fg/)
      expect(root?.querySelector('span')?.className).toMatch(/bg-st-[a-z]+-dot/)
      seen.add(root?.className ?? '')
      unmount()
    }
    expect(seen.size).toBe(TONES.length)
  })

  it('is the quiet tone when none is given', () => {
    const { container } = render(<Pill>Unpaid</Pill>)
    expect(container.firstElementChild?.className).toContain('bg-st-declined-bg')
  })

  it('appends a caller className instead of replacing the base classes', () => {
    const { container } = render(<Pill className="ml-2">x</Pill>)
    const root = container.firstElementChild
    expect(root).toHaveClass('ml-2')
    expect(root?.className.split(' ').length).toBeGreaterThan(1)
  })
})
