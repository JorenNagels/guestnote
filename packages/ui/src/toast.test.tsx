import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Toast, type ToastItem } from './toast.tsx'

/**
 * The toast's contract (spec 0009 C4): a polite region that exists before its message, buttons
 * outside that region, no focus taken on arrival, and a clock that stops while someone is there.
 *
 * Fake timers are narrowed to `setTimeout`/`clearTimeout` and driven with `fireEvent` + `act`,
 * never `waitFor`: CLAUDE.md's fake-timer trap -- Testing Library only advances fake timers it
 * recognises as Jest's, so a `findBy*` here would poll a clock nothing moves.
 */

const item = (over: Partial<ToastItem> = {}): ToastItem => ({
  id: 1,
  message: '“Castle” deleted',
  action: { label: 'Undo', onClick: () => {} },
  ...over,
})

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
})
afterEach(() => {
  vi.useRealTimers()
})

describe('Toast', () => {
  it('keeps the polite status region mounted with nothing to say', () => {
    const { rerender } = render(<Toast toast={null} dismissLabel="Dismiss" onDismiss={() => {}} />)
    const region = screen.getByRole('status')
    expect(region).toHaveAttribute('aria-live', 'polite')
    expect(region).toBeEmptyDOMElement()
    expect(screen.queryByRole('button')).toBeNull()

    rerender(<Toast toast={item()} dismissLabel="Dismiss" onDismiss={() => {}} />)
    // The same node, now with text: a region inserted with its message is often not announced.
    expect(screen.getByRole('status')).toBe(region)
    expect(region).toHaveTextContent('“Castle” deleted')
  })

  it('reads the message alone: the buttons are outside the region', () => {
    render(<Toast toast={item()} dismissLabel="Dismiss" onDismiss={() => {}} />)
    expect(screen.getByRole('status')).toHaveTextContent(/^“Castle” deleted$/)
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeInTheDocument()
  })

  it('does not take focus when it arrives', () => {
    const page = (toast: ToastItem | null) => (
      <>
        <button type="button">Delete line</button>
        <Toast toast={toast} dismissLabel="Dismiss" onDismiss={() => {}} />
      </>
    )
    const { rerender } = render(page(null))
    const opener = screen.getByRole('button', { name: 'Delete line' })
    opener.focus()
    rerender(page(item()))
    expect(document.activeElement).toBe(opener)
  })

  it('runs the action and the dismiss on click', () => {
    const onClick = vi.fn()
    const onDismiss = vi.fn()
    render(
      <Toast
        toast={item({ action: { label: 'Undo', onClick } })}
        dismissLabel="Dismiss"
        onDismiss={onDismiss}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(onDismiss).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('dismisses itself after 8 seconds, and not before', () => {
    const onDismiss = vi.fn()
    render(<Toast toast={item()} dismissLabel="Dismiss" onDismiss={onDismiss} />)
    act(() => vi.advanceTimersByTime(7999))
    expect(onDismiss).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(1))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('restarts the clock for a new toast', () => {
    const onDismiss = vi.fn()
    const { rerender } = render(
      <Toast toast={item()} dismissLabel="Dismiss" onDismiss={onDismiss} />,
    )
    act(() => vi.advanceTimersByTime(6000))
    rerender(<Toast toast={item({ id: 2 })} dismissLabel="Dismiss" onDismiss={onDismiss} />)
    act(() => vi.advanceTimersByTime(6000))
    expect(onDismiss).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(2000))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('pauses while hovered, and gives a full 8 seconds after', () => {
    const onDismiss = vi.fn()
    render(<Toast toast={item()} dismissLabel="Dismiss" onDismiss={onDismiss} />)
    fireEvent.mouseEnter(screen.getByTestId('toast'))
    act(() => vi.advanceTimersByTime(20_000))
    expect(onDismiss).not.toHaveBeenCalled()
    fireEvent.mouseLeave(screen.getByTestId('toast'))
    act(() => vi.advanceTimersByTime(7999))
    expect(onDismiss).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(1))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('pauses while focus is inside it', () => {
    const onDismiss = vi.fn()
    render(<Toast toast={item()} dismissLabel="Dismiss" onDismiss={onDismiss} />)
    act(() => screen.getByRole('button', { name: 'Undo' }).focus())
    act(() => vi.advanceTimersByTime(20_000))
    expect(onDismiss).not.toHaveBeenCalled()
  })

  it('pauses while its action is busy', () => {
    const onDismiss = vi.fn()
    render(
      <Toast
        toast={item({ action: { label: 'Undo', onClick: () => {}, busy: true } })}
        dismissLabel="Dismiss"
        onDismiss={onDismiss}
      />,
    )
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled()
    act(() => vi.advanceTimersByTime(20_000))
    expect(onDismiss).not.toHaveBeenCalled()
  })

  it('keeps focus in the card when the focused action goes away', () => {
    const { rerender } = render(
      <Toast toast={item()} dismissLabel="Dismiss" onDismiss={() => {}} />,
    )
    act(() => screen.getByRole('button', { name: 'Undo' }).focus())
    rerender(
      <Toast toast={{ id: 2, message: 'Restored.' }} dismissLabel="Dismiss" onDismiss={() => {}} />,
    )
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Dismiss' }))
  })
})
