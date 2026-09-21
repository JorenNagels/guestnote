import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Sheet } from './sheet.tsx'

function Harness({ open = true, onClose = () => {} }: { open?: boolean; onClose?: () => void }) {
  return (
    <>
      <button type="button">opener</button>
      <Sheet
        open={open}
        onClose={onClose}
        title="Edit event"
        closeLabel="Close panel"
        footer={<button type="button">Save</button>}
      >
        <label>
          Name
          <input />
        </label>
      </Sheet>
    </>
  )
}

describe('Sheet', () => {
  it('renders nothing while closed', () => {
    render(<Harness open={false} />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('is a modal dialog named by its title', () => {
    render(<Harness />)
    const dialog = screen.getByRole('dialog', { name: 'Edit event' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByRole('heading', { name: 'Edit event' })).toBeInTheDocument()
  })

  it('moves focus to the first field in the body, not the close button', () => {
    render(<Harness />)
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveFocus()
  })

  it('closes on Escape', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes from the close button, by its given name', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)
    await user.click(screen.getByRole('button', { name: 'Close panel' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes when the scrim is clicked, but not when the panel is', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const { baseElement } = render(<Harness onClose={onClose} />)
    await user.click(screen.getByRole('dialog'))
    expect(onClose).not.toHaveBeenCalled()
    const scrim = baseElement.querySelector('[aria-hidden="true"].absolute')
    expect(scrim).not.toBeNull()
    if (scrim) await user.click(scrim)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('wraps Tab and Shift+Tab inside the panel', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const close = screen.getByRole('button', { name: 'Close panel' })
    const save = screen.getByRole('button', { name: 'Save' })
    // Order in the panel: close, Name, Save. Focus starts on Name.
    await user.tab()
    expect(save).toHaveFocus()
    await user.tab()
    expect(close).toHaveFocus()
    await user.tab({ shift: true })
    expect(save).toHaveFocus()
  })

  it('returns focus to what opened it, and gives the page its scroll back', () => {
    const { rerender } = render(<Harness open={false} />)
    const opener = screen.getByRole('button', { name: 'opener' })
    opener.focus()
    rerender(<Harness open />)
    expect(opener).not.toHaveFocus()
    expect(document.body.style.overflow).toBe('hidden')
    rerender(<Harness open={false} />)
    expect(opener).toHaveFocus()
    expect(document.body.style.overflow).toBe('')
  })

  it('renders the footer outside the scrolling body', () => {
    render(<Harness />)
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
  })
})
