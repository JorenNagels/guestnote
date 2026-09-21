import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Badge } from './badge.tsx'

describe('Badge', () => {
  it('renders its content, zero included', () => {
    render(<Badge>0</Badge>)
    expect(screen.getByText('0')).toBeInTheDocument()
  })

  it('takes the semantic pair for each tone, so text is never on an unverified ground', () => {
    const { container, rerender } = render(<Badge>1</Badge>)
    expect(container.firstElementChild).toHaveClass('bg-muted', 'text-muted-foreground')
    rerender(<Badge tone="accent">1</Badge>)
    expect(container.firstElementChild).toHaveClass('bg-accent', 'text-accent-foreground')
    rerender(<Badge tone="primary">1</Badge>)
    expect(container.firstElementChild).toHaveClass('bg-primary', 'text-primary-foreground')
  })

  it('passes native attributes through, for an aria-label on a bare number', () => {
    render(<Badge aria-label="3 overdue">3</Badge>)
    expect(screen.getByLabelText('3 overdue')).toHaveTextContent('3')
  })

  it('appends a caller className instead of replacing the base classes', () => {
    const { container } = render(<Badge className="ml-1">1</Badge>)
    const root = container.firstElementChild
    expect(root).toHaveClass('ml-1')
    expect(root?.className.split(' ').length).toBeGreaterThan(1)
  })
})
