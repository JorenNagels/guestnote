import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EMPTY_FORM } from '../../lib/task-form.ts'
import { WithMessages } from './intl.test-util.tsx'

const createTaskAction = vi.fn()
vi.mock('../../app/pro/(app)/weddings/[id]/tasks/actions.ts', () => ({
  createTaskAction: (...a: unknown[]) => createTaskAction(...a),
}))

const { QuickAdd } = await import('./quick-add.tsx')

const onMore = vi.fn()
const show = (initialTitle?: string) =>
  render(
    <WithMessages>
      <QuickAdd weddingId="w1" onMore={onMore} {...(initialTitle ? { initialTitle } : {})} />
    </WithMessages>,
  )
const line = () => screen.getByRole('textbox', { name: 'Taak toevoegen' })

beforeEach(() => {
  vi.clearAllMocks()
  createTaskAction.mockResolvedValue({ ok: true, taskId: 't1' })
})

describe('QuickAdd', () => {
  it('creates on Enter with the title and the defaults of the full form', async () => {
    const user = userEvent.setup()
    show()
    await user.type(line(), '  Book the DJ {Enter}')
    await waitFor(() => expect(createTaskAction).toHaveBeenCalledTimes(1))
    expect(createTaskAction).toHaveBeenCalledWith('w1', { ...EMPTY_FORM, title: 'Book the DJ' })
  })

  it('sends the chip as days before the main day, and keeps it for the next one', async () => {
    const user = userEvent.setup()
    show()
    await user.click(screen.getByRole('radio', { name: '30 dagen voor de trouwdag' }))
    await user.type(line(), 'Menu tasting{Enter}')
    await user.type(line(), 'Seating plan{Enter}')
    await waitFor(() => expect(createTaskAction).toHaveBeenCalledTimes(2))
    const offset = { dueKind: 'offset', offsetDays: '30', offsetDirection: 'before' }
    expect(createTaskAction).toHaveBeenNthCalledWith(1, 'w1', {
      ...EMPTY_FORM,
      ...offset,
      title: 'Menu tasting',
    })
    expect(createTaskAction).toHaveBeenNthCalledWith(2, 'w1', {
      ...EMPTY_FORM,
      ...offset,
      title: 'Seating plan',
    })
  })

  it('clears the line and puts focus back on it, even when submitted by the button', async () => {
    const user = userEvent.setup()
    show()
    await user.type(line(), 'Book the DJ')
    // The button, and not Enter, so the focus is somewhere else when the line is submitted.
    await user.click(screen.getByRole('button', { name: 'Toevoegen' }))
    expect(line()).toHaveValue('')
    expect(line()).toHaveFocus()
  })

  it('takes a second entry while the first is still saving', async () => {
    const user = userEvent.setup()
    let resolveFirst: (v: unknown) => void = () => {}
    createTaskAction.mockImplementationOnce(() => new Promise((r) => (resolveFirst = r)))
    show()
    await user.type(line(), 'First{Enter}')
    expect(line()).toHaveValue('')
    await user.type(line(), 'Second{Enter}')
    expect(createTaskAction).toHaveBeenCalledTimes(2)
    expect(createTaskAction).toHaveBeenLastCalledWith('w1', { ...EMPTY_FORM, title: 'Second' })
    // Said while the first is still out, so the wait below is for it to go and not vacuous.
    expect(screen.getByText('Toevoegen…')).toBeInTheDocument()
    resolveFirst({ ok: true, taskId: 't1' })
    await waitFor(() => expect(screen.queryByText('Toevoegen…')).toBeNull())
    expect(line()).toHaveValue('')
  })

  it('does nothing on an empty line', async () => {
    const user = userEvent.setup()
    show()
    await user.type(line(), '   {Enter}')
    // The disabled "Toevoegen" button already stops the browser's implicit submit on Enter, so
    // the Enter above cannot see `submit`'s own guard go missing (measured: it survived that
    // mutation). A submit event straight at the form, as a script or an old browser can send,
    // is what reaches it.
    fireEvent.submit(screen.getByRole('form', { name: 'Taak toevoegen' }))
    expect(createTaskAction).not.toHaveBeenCalled()
  })

  it('shows a refusal under the line and gives the text back', async () => {
    const user = userEvent.setup()
    createTaskAction.mockResolvedValue({ ok: false, error: 'notFound' })
    show()
    await user.type(line(), 'Book the DJ{Enter}')
    expect(await screen.findByRole('alert')).toHaveTextContent('Deze taak bestaat niet meer.')
    expect(line()).toHaveValue('Book the DJ')
    expect(line()).toHaveAttribute('aria-invalid', 'true')
  })

  it('names the refused title instead of overwriting what was typed since', async () => {
    const user = userEvent.setup()
    let refuse: (v: unknown) => void = () => {}
    createTaskAction.mockImplementationOnce(() => new Promise((r) => (refuse = r)))
    show()
    await user.type(line(), 'Book the DJ{Enter}')
    await user.type(line(), 'Flowers')
    refuse({ ok: false, error: 'notFound' })
    expect(await screen.findByRole('alert')).toHaveTextContent('Niet toegevoegd: Book the DJ.')
    expect(line()).toHaveValue('Flowers')
  })

  it('hands the typed title and the chip to the full form', async () => {
    const user = userEvent.setup()
    show()
    await user.click(screen.getByRole('radio', { name: '7 dagen voor de trouwdag' }))
    await user.type(line(), 'Final payment')
    await user.click(screen.getByRole('button', { name: 'Meer opties…' }))
    expect(onMore).toHaveBeenCalledWith({
      ...EMPTY_FORM,
      title: 'Final payment',
      dueKind: 'offset',
      offsetDays: '7',
      offsetDirection: 'before',
    })
    expect(createTaskAction).not.toHaveBeenCalled()
  })

  it('starts with what was carried back from a cancelled full form', () => {
    show('Book the DJ')
    expect(line()).toHaveValue('Book the DJ')
  })
})
