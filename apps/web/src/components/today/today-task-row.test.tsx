import type { AssignedTaskRow } from '@guestnote/db'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { task } from '../tasks/fixture.ts'
import { WithMessages } from '../tasks/intl.test-util.tsx'

const setTaskDoneAction = vi.fn()
vi.mock('../../app/pro/(app)/weddings/[id]/tasks/actions.ts', () => ({
  setTaskDoneAction: (...a: unknown[]) => setTaskDoneAction(...a),
}))

const { TodayTaskRow } = await import('./today-task-row.tsx')

const TODAY = '2026-09-21'
const view = (over: Partial<AssignedTaskRow> = {}) =>
  render(
    <WithMessages>
      <ul>
        <TodayTaskRow
          task={{ ...task(), weddingName: 'Emma & Joren', weddingDate: '2027-07-31', ...over }}
          today={TODAY}
        />
      </ul>
    </WithMessages>,
  )

beforeEach(() => {
  vi.clearAllMocks()
  setTaskDoneAction.mockResolvedValue({ ok: true })
})

describe('TodayTaskRow', () => {
  it('links the title to the task and the wedding name to the wedding', () => {
    view({ id: 't1', weddingId: 'w1', title: 'Book the DJ' })
    expect(screen.getByRole('link', { name: 'Book the DJ' })).toHaveAttribute(
      'href',
      '/weddings/w1/tasks/t1',
    )
    expect(screen.getByRole('link', { name: 'Emma & Joren' })).toHaveAttribute(
      'href',
      '/weddings/w1',
    )
  })

  it('says an overdue date in words as well as colour', () => {
    view({ dueDate: '2026-09-18' })
    expect(screen.getByText('3 dagen te laat')).toBeInTheDocument()
    expect(screen.getByText('18 sep 2026')).toBeInTheDocument()
  })

  it('says "Vandaag" for a task due today', () => {
    view({ dueDate: TODAY })
    expect(screen.getByText('Vandaag')).toBeInTheDocument()
  })

  // The wrapper's zone is New York: unpinned, a UTC-midnight civil date renders the evening before.
  it('renders the civil date, not the day before', () => {
    view({ dueDate: '2026-09-25' })
    expect(screen.getByText('25 sep 2026')).toBeInTheDocument()
    expect(screen.queryByText('24 sep 2026')).toBeNull()
  })

  it('marks an internal task in words and leaves a shared one bare', () => {
    view({ visibility: 'internal' })
    expect(screen.getByText('Alleen intern')).toBeInTheDocument()
    expect(screen.queryByText('Gedeeld met koppel')).toBeNull()
  })

  it('does not tag a shared task', () => {
    view({ visibility: 'shared' })
    expect(screen.queryByText('Alleen intern')).toBeNull()
    expect(screen.queryByText('Gedeeld met koppel')).toBeNull()
  })

  it('ticks through the same action the checklist uses', async () => {
    view({ id: 't1', weddingId: 'w1', title: 'Book the DJ' })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Markeer als afgerond: Book the DJ' }))
    await waitFor(() => expect(setTaskDoneAction).toHaveBeenCalledWith('w1', 't1', true))
  })

  it('shows an inline error and no crash when the tick fails', async () => {
    setTaskDoneAction.mockResolvedValue({ ok: false, error: 'notFound' })
    view({ title: 'Book the DJ' })
    fireEvent.click(screen.getByRole('checkbox'))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })
})
