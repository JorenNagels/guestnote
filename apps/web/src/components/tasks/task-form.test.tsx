import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EMPTY_FORM, type TaskFormValues } from '../../lib/task-form.ts'
import { WithMessages } from './intl.test-util.tsx'

const createTaskAction = vi.fn()
const updateTaskAction = vi.fn()
vi.mock('../../app/pro/(app)/weddings/[id]/tasks/actions.ts', () => ({
  createTaskAction: (...a: unknown[]) => createTaskAction(...a),
  updateTaskAction: (...a: unknown[]) => updateTaskAction(...a),
}))

const { TaskForm } = await import('./task-form.tsx')

const onDone = vi.fn()
const onCancel = vi.fn()
const form = (
  props: {
    weddingDate?: string | null
    initial?: TaskFormValues
    taskId?: string
    events?: { id: string; label: string; startsOn: string }[]
  } = {},
) =>
  render(
    <WithMessages>
      <TaskForm
        weddingId="w1"
        taskId={props.taskId}
        weddingDate={props.weddingDate === undefined ? '2027-06-12' : props.weddingDate}
        initial={props.initial ?? EMPTY_FORM}
        events={props.events ?? []}
        onDone={onDone}
        onCancel={onCancel}
      />
    </WithMessages>,
  )
const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } })

beforeEach(() => {
  vi.clearAllMocks()
  createTaskAction.mockResolvedValue({ ok: true, taskId: 't1' })
  updateTaskAction.mockResolvedValue({ ok: true })
})

describe('TaskForm', () => {
  it('creates a task with what was typed and then closes', async () => {
    form()
    type('Taak', 'Book the DJ')
    fireEvent.click(screen.getByRole('radio', { name: 'Alleen intern' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Koppel' }))
    fireEvent.click(screen.getByRole('button', { name: 'Taak bewaren' }))

    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(createTaskAction).toHaveBeenCalledWith('w1', {
      ...EMPTY_FORM,
      title: 'Book the DJ',
      visibility: 'internal',
      assigneeRole: 'couple',
    })
    expect(updateTaskAction).not.toHaveBeenCalled()
  })

  it('keeps the input and shows the error when the action refuses', async () => {
    createTaskAction.mockResolvedValue({ ok: false, error: 'title' })
    form()
    type('Taak', 'x')
    fireEvent.click(screen.getByRole('button', { name: 'Taak bewaren' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Geef de taak een titel')
    expect(screen.getByLabelText('Taak')).toHaveValue('x')
    expect(onDone).not.toHaveBeenCalled()
  })

  it('previews the resolved date next to an offset', () => {
    form()
    fireEvent.click(screen.getByRole('radio', { name: 'Telt af van een dag' }))
    type('Aantal dagen', '14')
    // 2027-06-12 minus 14 days.
    expect(screen.getByText('Valt op 29 mei 2027')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: 'Erna' }))
    expect(screen.getByText(/Valt op 26 jun/)).toBeInTheDocument()
  })

  it('says there is no date to resolve when the wedding has none', () => {
    form({ weddingDate: null })
    fireEvent.click(screen.getByRole('radio', { name: 'Telt af van een dag' }))
    type('Aantal dagen', '14')
    expect(screen.getByText(/Geen huwelijksdatum: de datum verschijnt/)).toBeInTheDocument()
  })

  it('offers a date field only for a fixed date', () => {
    form()
    expect(screen.queryByLabelText('Datum')).toBeNull()
    fireEvent.click(screen.getByRole('radio', { name: 'Vaste datum' }))
    expect(screen.getByLabelText('Datum')).toBeInTheDocument()
  })

  it('updates instead of creating when it has a task id', async () => {
    form({ taskId: 't9', initial: { ...EMPTY_FORM, title: 'Old' } })
    expect(screen.getByLabelText('Taak')).toHaveValue('Old')
    type('Taak', 'New')
    fireEvent.click(screen.getByRole('button', { name: 'Taak bewaren' }))
    await waitFor(() =>
      expect(updateTaskAction).toHaveBeenCalledWith('w1', 't9', { ...EMPTY_FORM, title: 'New' }),
    )
    expect(createTaskAction).not.toHaveBeenCalled()
  })

  it('cancels without calling anything', () => {
    form()
    fireEvent.click(screen.getByRole('button', { name: 'Annuleren' }))
    expect(onCancel).toHaveBeenCalled()
    expect(createTaskAction).not.toHaveBeenCalled()
  })

  describe('counting from another day (spec 0004)', () => {
    const civil = { id: 'e1', label: 'Burgerlijk', startsOn: '2027-06-01' }
    const offset = { ...EMPTY_FORM, title: 'Papers', dueKind: 'offset', offsetDays: '14' } as const

    it('offers the main day and each event, and previews the date from the chosen one', () => {
      form({ initial: offset, events: [civil] })
      const select = screen.getByLabelText('Telt vanaf') as HTMLSelectElement
      expect(Array.from(select.options).map((o) => o.value)).toEqual(['', 'e1'])
      // 14 days before 12 June is 29 May; before 1 June it is 18 May.
      expect(screen.getByText(/29 mei 2027/)).toBeTruthy()
      fireEvent.change(select, { target: { value: 'e1' } })
      expect(screen.getByText(/18 mei 2027/)).toBeTruthy()
    })

    it('sends the chosen event with the rest of the form', async () => {
      form({ initial: offset, events: [civil] })
      fireEvent.change(screen.getByLabelText('Telt vanaf'), { target: { value: 'e1' } })
      fireEvent.click(screen.getByRole('button', { name: 'Taak bewaren' }))
      await waitFor(() => expect(onDone).toHaveBeenCalled())
      expect(createTaskAction).toHaveBeenCalledWith('w1', { ...offset, anchorEventId: 'e1' })
    })

    it('says where to add days when the wedding has no events', () => {
      form({ initial: offset })
      expect(screen.getByText(/Voeg momenten toe in de instellingen/)).toBeTruthy()
    })

    it('shows the removed-event error from the action and keeps the form', async () => {
      createTaskAction.mockResolvedValue({ ok: false, error: 'anchorGone' })
      form({ initial: offset, events: [civil] })
      fireEvent.click(screen.getByRole('button', { name: 'Taak bewaren' }))
      expect(await screen.findByText(/Dat moment bestaat niet meer/)).toBeTruthy()
      expect(onDone).not.toHaveBeenCalled()
    })
  })
})
