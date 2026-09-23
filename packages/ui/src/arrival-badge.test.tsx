import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ArrivalBadge } from './arrival-badge.tsx'

describe('ArrivalBadge', () => {
  it('renders a checkmark by default', () => {
    const { container } = render(<ArrivalBadge />)
    expect(container.querySelector('svg')).not.toBeNull()
  })

  it('lets a caller swap in a different icon', () => {
    const { container } = render(<ArrivalBadge icon={<span data-testid="custom-icon" />} />)
    expect(container.querySelector('[data-testid="custom-icon"]')).not.toBeNull()
    // The default checkmark path is gone, not merely covered.
    expect(container.querySelector('svg')).toBeNull()
  })

  it('appends a caller className instead of replacing the base classes', () => {
    const { container } = render(<ArrivalBadge className="mb-4" />)
    const root = container.firstElementChild
    expect(root).toHaveClass('mb-4')
    expect(root?.className.split(' ').length).toBeGreaterThan(1)
  })
})
