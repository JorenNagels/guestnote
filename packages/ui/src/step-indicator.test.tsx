import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { StepIndicator } from './step-indicator.tsx'

/**
 * The pips are decorative -- what matters for the contract is that the current step's
 * label is the thing a screen reader actually meets, and that the pips themselves stay
 * out of its way.
 */
describe('StepIndicator', () => {
  it("announces the current step's label", () => {
    render(<StepIndicator steps={['Public', 'Verifying', 'Private']} current={1} />)
    expect(screen.getByText('Verifying')).toBeInTheDocument()
  })

  it('hides the pips from assistive technology', () => {
    const { container } = render(
      <StepIndicator steps={['Public', 'Verifying', 'Private']} current={0} />,
    )
    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull()
  })

  it('appends a caller className instead of replacing the base classes', () => {
    const { container } = render(
      <StepIndicator steps={['Public', 'Verifying']} current={0} className="mb-6" />,
    )
    const root = container.firstElementChild
    expect(root).toHaveClass('mb-6')
    expect(root?.className.split(' ').length).toBeGreaterThan(1)
  })
})
