import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TOAST_LABELS } from './fixtures.ts'
import { type ShowToast, ToastProvider, type UndoResult, useToast } from './toast-provider.tsx'

/**
 * What the provider adds to the card: one toast at a time, and what an Undo's answer says. The
 * card's own clock and focus rules are `packages/ui/src/toast.test.tsx`'s.
 *
 * Real timers: nothing here waits for the eight seconds, and `act` around the clicks flushes the
 * awaited undo.
 */

function Raiser({ toasts }: { toasts: ShowToast[] }) {
  const toast = useToast()
  return (
    <>
      {toasts.map((t, i) => (
        <button key={t.message} type="button" onClick={() => toast.show(t)}>
          {`raise ${i}`}
        </button>
      ))}
    </>
  )
}

const view = (toasts: ShowToast[]) =>
  render(
    <ToastProvider labels={TOAST_LABELS}>
      <Raiser toasts={toasts} />
    </ToastProvider>,
  )

const status = () => screen.getByRole('status')

const undoOnce = async () => {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
  })
}

describe('ToastProvider', () => {
  it('shows what it is given, with Undo when there is an undo', () => {
    view([{ message: '“Castle” deleted', undo: async () => 'restored' }, { message: 'Plain' }])
    fireEvent.click(screen.getByRole('button', { name: 'raise 0' }))
    expect(status()).toHaveTextContent('“Castle” deleted')
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'raise 1' }))
    expect(status()).toHaveTextContent(/^Plain$/)
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull()
  })

  it('says Restored, without Undo, when the undo worked', async () => {
    const undo = vi.fn(async (): Promise<UndoResult> => 'restored')
    view([{ message: 'Gone', undo }])
    fireEvent.click(screen.getByRole('button', { name: 'raise 0' }))
    await undoOnce()
    expect(undo).toHaveBeenCalledTimes(1)
    expect(status()).toHaveTextContent('Restored.')
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull()
  })

  it('says so when there is nothing left to restore', async () => {
    view([{ message: 'Gone', undo: async () => 'gone' }])
    fireEvent.click(screen.getByRole('button', { name: 'raise 0' }))
    await undoOnce()
    expect(status()).toHaveTextContent('This can no longer be restored.')
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull()
  })

  it("shows the caller's own refusal", async () => {
    view([{ message: 'Gone', undo: async () => ({ message: 'Already on the wedding.' }) }])
    fireEvent.click(screen.getByRole('button', { name: 'raise 0' }))
    await undoOnce()
    expect(status()).toHaveTextContent('Already on the wedding.')
  })

  it('keeps Undo for another go when the request itself failed', async () => {
    const undo = vi
      .fn<() => Promise<UndoResult>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce('restored')
    view([{ message: 'Gone', undo }])
    fireEvent.click(screen.getByRole('button', { name: 'raise 0' }))
    await undoOnce()
    expect(status()).toHaveTextContent('Undo did not work. Try again.')
    await undoOnce()
    expect(undo).toHaveBeenCalledTimes(2)
    expect(status()).toHaveTextContent('Restored.')
  })

  it('does not let a replaced toast overwrite the newer one with its late answer', async () => {
    let finish: (r: UndoResult) => void = () => {}
    const slow = () =>
      new Promise<UndoResult>((resolve) => {
        finish = resolve
      })
    view([{ message: 'First', undo: slow }, { message: 'Second' }])
    fireEvent.click(screen.getByRole('button', { name: 'raise 0' }))
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    fireEvent.click(screen.getByRole('button', { name: 'raise 1' }))
    await act(async () => finish('restored'))
    expect(status()).toHaveTextContent(/^Second$/)
  })

  // A second click while the first restore is in flight would send a second restore, and its
  // "gone" answer would overwrite the first one's "Restored.".
  it('disables Undo while the restore is in flight', async () => {
    let finish: (r: UndoResult) => void = () => {}
    const undo = vi.fn(
      () =>
        new Promise<UndoResult>((resolve) => {
          finish = resolve
        }),
    )
    view([{ message: 'Gone', undo }])
    fireEvent.click(screen.getByRole('button', { name: 'raise 0' }))
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(undo).toHaveBeenCalledTimes(1)
    await act(async () => finish('restored'))
    expect(status()).toHaveTextContent('Restored.')
  })

  it('closes on Dismiss', () => {
    view([{ message: 'Gone', undo: async () => 'restored' }])
    fireEvent.click(screen.getByRole('button', { name: 'raise 0' }))
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(status()).toBeEmptyDOMElement()
  })
})
