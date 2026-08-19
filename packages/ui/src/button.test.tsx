import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Button, LinkButton } from './button.tsx'

/**
 * These assert the button's CONTRACT, not its Tailwind classes.
 *
 * Asserting on class strings would be a test of the stylesheet that fails on every visual
 * tweak and passes through every behavioural regression -- the exact inversion of what is
 * wanted. What is worth pinning is the small set of promises the component makes to the
 * rest of the app: that busy blocks a second submit, that the accessible name survives the
 * busy swap, and that `type` stays "button" so a form is never submitted by accident.
 *
 * ## One class does get asserted, and the exception is argued
 *
 * `cursor-pointer`, below. It is not a visual tweak: it is the only thing telling a pointer
 * user that the primary action is pressable, and it is held by a utility class *because*
 * Tailwind v4 removed the `button { cursor: pointer }` that used to make it free. That is a
 * regression which already happened once, silently, on a framework upgrade -- and no
 * behavioural assertion anywhere can see it. A test that can only be broken by deleting the
 * class is exactly right for that shape of defect.
 */
describe('Button', () => {
  it('defaults to type="button" so it cannot submit a form by accident', () => {
    render(<Button>Send</Button>)
    expect(screen.getByRole('button', { name: 'Send' })).toHaveAttribute('type', 'button')
  })

  it('lets a caller opt into being a submit button', () => {
    render(<Button type="submit">Send</Button>)
    expect(screen.getByRole('button', { name: 'Send' })).toHaveAttribute('type', 'submit')
  })

  describe('when busy', () => {
    it('disables itself, so the second tap on a slow connection cannot double-send', async () => {
      const onClick = vi.fn()
      render(
        <Button busy busyLabel="Sending…" onClick={onClick}>
          Send
        </Button>,
      )

      const button = screen.getByRole('button')
      expect(button).toBeDisabled()

      await userEvent.click(button)
      expect(onClick).not.toHaveBeenCalled()
    })

    it('announces itself as busy to assistive technology', () => {
      render(<Button busy>Send</Button>)
      expect(screen.getByRole('button')).toHaveAttribute('aria-busy', 'true')
    })

    it('swaps the label rather than hiding it, and keeps an accessible name', () => {
      render(
        <Button busy busyLabel="Sending…">
          Send
        </Button>,
      )

      const button = screen.getByRole('button')
      expect(button).toHaveAccessibleName('Sending…')
      // Anchored: `toHaveTextContent` is a SUBSTRING match, and 'Sending…' contains 'Send'.
      expect(button).not.toHaveTextContent(/^Send$/)
    })

    it('falls back to an ellipsis when no busyLabel is given', () => {
      render(<Button busy>Send</Button>)
      expect(screen.getByRole('button')).toHaveTextContent('…')
    })

    it('drops the icon, so the row cannot show a stale affordance mid-request', () => {
      render(
        <Button busy busyLabel="Sending…" icon={<svg aria-hidden="true" data-testid="icon" />}>
          Send
        </Button>,
      )
      expect(screen.queryByTestId('icon')).not.toBeInTheDocument()
    })
  })

  it('stays disabled when disabled even if not busy', () => {
    render(<Button disabled>Send</Button>)
    expect(screen.getByRole('button')).toBeDisabled()
    expect(screen.getByRole('button')).not.toHaveAttribute('aria-busy')
  })

  it('renders its icon alongside the label when idle', () => {
    render(<Button icon={<svg aria-hidden="true" data-testid="icon" />}>Send</Button>)
    expect(screen.getByTestId('icon')).toBeInTheDocument()
    expect(screen.getByRole('button')).toHaveAccessibleName('Send')
  })

  it('appends a caller className instead of replacing the base classes', () => {
    render(<Button className="mt-4">Send</Button>)
    const button = screen.getByRole('button')
    expect(button).toHaveClass('mt-4')
    expect(button.className.split(' ').length).toBeGreaterThan(1)
  })
})

describe('LinkButton', () => {
  it('is a button, not an anchor -- it performs an action and has no href', () => {
    render(<LinkButton>Use a different address</LinkButton>)
    const button = screen.getByRole('button', { name: 'Use a different address' })
    expect(button).toHaveAttribute('type', 'button')
    expect(button).not.toHaveAttribute('href')
  })

  it('fires its handler on click', async () => {
    const onClick = vi.fn()
    render(<LinkButton onClick={onClick}>Send a new code</LinkButton>)
    await userEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledOnce()
  })
})

describe('the pointer affordance', () => {
  // See the note at the top of this file for why these two assert a class at all.
  it('shows a pointer cursor, which Tailwind v4 no longer gives a button for free', () => {
    render(<Button>Send</Button>)
    expect(screen.getByRole('button', { name: 'Send' }).className).toContain(
      'enabled:cursor-pointer',
    )
  })

  it('keeps the pointer scoped to enabled, so a busy button still reads as barred', () => {
    render(<Button busy>Send</Button>)
    const button = screen.getByRole('button')
    // Both classes present, mutually exclusive by selector rather than by source order.
    expect(button.className).toContain('enabled:cursor-pointer')
    expect(button.className).toContain('disabled:cursor-not-allowed')
  })

  it('gives LinkButton the same affordance', () => {
    render(<LinkButton>Resend</LinkButton>)
    expect(screen.getByRole('button', { name: 'Resend' }).className).toContain(
      'enabled:cursor-pointer',
    )
  })

  it('leaves a disabled LinkButton a default cursor, not a barred one', () => {
    // The resend countdown is this state's main user, and it becomes available on its own.
    // A barred cursor would promise "never".
    render(<LinkButton disabled>Resend in 30</LinkButton>)
    const button = screen.getByRole('button')
    expect(button.className).toContain('disabled:cursor-default')
    expect(button.className).not.toContain('disabled:cursor-not-allowed')
  })
})
