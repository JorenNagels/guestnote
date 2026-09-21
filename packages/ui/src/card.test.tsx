import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Card } from './card.tsx'

describe('Card', () => {
  it('is a plain div by default', () => {
    const { container } = render(<Card>x</Card>)
    expect(container.firstElementChild?.tagName).toBe('DIV')
  })

  it('renders the element it is told to, so a labelled region is a landmark', () => {
    render(
      <Card as="section" aria-label="Budget">
        x
      </Card>,
    )
    expect(screen.getByRole('region', { name: 'Budget' })).toBeInTheDocument()
  })

  it('can be an aside', () => {
    render(<Card as="aside">note</Card>)
    expect(screen.getByRole('complementary')).toHaveTextContent('note')
  })

  it('pads by default and clips instead when the content runs to the edge', () => {
    const { container, rerender } = render(<Card>x</Card>)
    expect(container.firstElementChild).toHaveClass('px-4', 'py-3.5')
    expect(container.firstElementChild).not.toHaveClass('overflow-hidden')
    rerender(<Card padding="none">x</Card>)
    expect(container.firstElementChild).toHaveClass('overflow-hidden')
    expect(container.firstElementChild).not.toHaveClass('px-4')
  })

  it('appends a caller className instead of replacing the base classes', () => {
    const { container } = render(<Card className="mb-4">x</Card>)
    const root = container.firstElementChild
    expect(root).toHaveClass('mb-4')
    expect(root?.className.split(' ').length).toBeGreaterThan(1)
  })
})
