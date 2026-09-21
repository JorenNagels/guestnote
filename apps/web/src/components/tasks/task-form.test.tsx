import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EMPTY_FORM, type TaskFormValues } from './form.ts'
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
  props: { weddingDate?: string | null; initial?: TaskFormValues; taskId?: string } = {},
) =>
  render(
    <WithMessages>
      <TaskForm
        weddingId="w1"
        taskId={props.taskId}
        weddingDate={props.weddingDate === undefined ? '2027-06-12' : props.weddingDate}
        initial={props.initial ?? EMPTY_FORM}
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
    fireEvent.click(screen.getByRole('radio', { name: 'Telt af van de trouwdag' }))
    type('Aantal dagen', '14')
    // 2027-06-12 minus 14 days.
    expect(screen.getByText('Valt op 29 mei 2027')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: 'Na de trouwdag' }))
    expect(screen.getByText(/Valt op 26 jun/)).toBeInTheDocument()
  })

  it('says there is no date to resolve when the wedding has none', () => {
    form({ weddingDate: null })
    fireEvent.click(screen.getByRole('radio', { name: 'Telt af van de trouwdag' }))
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
})
