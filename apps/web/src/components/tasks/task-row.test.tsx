import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { task } from './fixture.ts'
import { WithMessages } from './intl.test-util.tsx'

const setTaskDoneAction = vi.fn()
vi.mock('../../app/pro/(app)/weddings/[id]/tasks/actions.ts', () => ({
  setTaskDoneAction: (...a: unknown[]) => setTaskDoneAction(...a),
}))

// `scroll` is a prop the real Link keeps to itself: it decides what the router does on a click,
// and jsdom has no router and no scrolling to observe. The stub prints it, so what is asserted
// is that the row asks for the right thing; that Next honours `scroll={false}` is Next's.
vi.mock('next/link', () => ({
  default: ({
    href,
    scroll,
    children,
    className,
  }: {
    href: string
    scroll?: boolean
    children: React.ReactNode
    className?: string
  }) => (
    <a href={href} data-scroll={String(scroll)} className={className}>
      {children}
    </a>
  ),
}))

const { TaskRowView } = await import('./task-row.tsx')

const TODAY = '2027-03-10'
const view = (over: Parameters<typeof task>[0] = {}) =>
  render(
    <WithMessages>
      <ul>
        <TaskRowView task={task(over)} today={TODAY} />
      </ul>
    </WithMessages>,
  )

beforeEach(() => {
  vi.clearAllMocks()
  setTaskDoneAction.mockResolvedValue({ ok: true })
})

describe('TaskRowView', () => {
  it('links the title to the task and names its owner', () => {
    view({ id: 't1', weddingId: 'w1' })
    expect(screen.getByRole('link', { name: /Book the DJ/ })).toHaveAttribute(
      'href',
      '/weddings/w1/tasks/t1',
    )
    expect(screen.getByText('Planner')).toBeInTheDocument()
  })

  it('keeps the scroll for the checklist panel link, and scrolls to the top for the task page', () => {
    view({ id: 't1', weddingId: 'w1' })
    expect(screen.getByRole('link', { name: /Book the DJ/ })).toHaveAttribute('data-scroll', 'true')

    render(
      <WithMessages>
        <ul>
          <TaskRowView
            task={task({ id: 't2', title: 'Order flowers', weddingId: 'w1' })}
            today={TODAY}
            href="/weddings/w1/tasks?task=t2"
          />
        </ul>
      </WithMessages>,
    )
    const panel = screen.getByRole('link', { name: /Order flowers/ })
    expect(panel).toHaveAttribute('href', '/weddings/w1/tasks?task=t2')
    expect(panel).toHaveAttribute('data-scroll', 'false')
  })

  it('shows an overdue date with the words, not only a colour', () => {
    view({ dueDate: '2027-03-07' })
    expect(screen.getByText('3 dagen te laat')).toBeInTheDocument()
    expect(screen.getByText('7 mrt 2027')).toBeInTheDocument()
  })

  // The date is read as UTC midnight; in New York (the Intl wrapper) an unpinned format
  // renders the previous evening, 6 March.
  it('renders the civil date, not the day before', () => {
    view({ dueDate: '2027-03-07' })
    expect(screen.getByText('7 mrt 2027')).toBeInTheDocument()
    expect(screen.queryByText('6 mrt 2027')).toBeNull()
  })

  it('says internal in words', () => {
    view({ visibility: 'internal' })
    expect(screen.getByText('Alleen intern')).toBeInTheDocument()
  })

  it('says why an offset task has no date', () => {
    view({ dueOffsetDays: -14, dueDate: null })
    expect(screen.getByText('Geen huwelijksdatum')).toBeInTheDocument()
  })

  it('shows a done task ticked, struck through, with no relative label', () => {
    view({ status: 'done', dueDate: '2027-03-07' })
    expect(screen.getByRole('checkbox')).toBeChecked()
    expect(screen.getByText('Book the DJ')).toHaveClass('line-through')
    expect(screen.queryByText(/te laat/)).toBeNull()
  })

  it('draws the unread dot, with words, only when the couple did something unseen (spec 0008)', () => {
    const { unmount } = view({ coupleUnread: true })
    expect(screen.getByTestId('couple-unread')).toHaveTextContent('Nieuw van het koppel')
    unmount()
    view({ coupleUnread: false })
    expect(screen.queryByTestId('couple-unread')).toBeNull()
  })

  it('marks an in-progress task', () => {
    view({ status: 'in_progress' })
    expect(screen.getByText('Bezig')).toBeInTheDocument()
  })

  it('completes an open task and reopens a done one', async () => {
    const { unmount } = view({ id: 't1', weddingId: 'w1' })
    fireEvent.click(screen.getByRole('checkbox', { name: /Markeer als afgerond: Book the DJ/ }))
    await waitFor(() => expect(setTaskDoneAction).toHaveBeenCalledWith('w1', 't1', true))
    unmount()

    view({ id: 't1', weddingId: 'w1', status: 'done' })
    fireEvent.click(screen.getByRole('checkbox', { name: /Heropen: Book the DJ/ }))
    await waitFor(() => expect(setTaskDoneAction).toHaveBeenLastCalledWith('w1', 't1', false))
  })

  it('says so when the write fails', async () => {
    setTaskDoneAction.mockResolvedValue({ ok: false, error: 'notFound' })
    view()
    fireEvent.click(screen.getByRole('checkbox'))
    expect(await screen.findByRole('alert')).toHaveTextContent('Dat is niet gelukt')
  })
})
