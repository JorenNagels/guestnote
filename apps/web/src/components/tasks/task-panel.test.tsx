import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { task } from './fixture.ts'
import { WithMessages } from './intl.test-util.tsx'

const replace = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }))
vi.mock('../../app/pro/(app)/weddings/[id]/tasks/actions.ts', () => ({
  createTaskAction: vi.fn(),
  updateTaskAction: vi.fn(),
  setTaskDoneAction: vi.fn(),
  setTaskVisibilityAction: vi.fn(),
  addCommentAction: vi.fn(),
}))

const { TaskPanel } = await import('./task-panel.tsx')

const CLOSE = '/weddings/w1/tasks?filter=open'
const show = () =>
  render(
    <WithMessages>
      <TaskPanel
        task={task({ title: 'Book the DJ', notes: 'Ask for the playlist' })}
        comments={[]}
        coupleUserIds={[]}
        weddingDate="2027-06-12"
        events={[]}
        staff={[]}
        viewerId="018f0000-0000-7000-8000-0000000000d1"
        today="2027-03-10"
        closeHref={CLOSE}
      />
    </WithMessages>,
  )

beforeEach(() => vi.clearAllMocks())

describe('TaskPanel', () => {
  it('shows the task page content in a dialog, without the link back to the list', () => {
    show()
    const dialog = screen.getByRole('dialog', { name: 'Taak' })
    expect(within(dialog).getByRole('heading', { name: 'Book the DJ' })).toBeInTheDocument()
    expect(within(dialog).getByText('Ask for the playlist')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Bewerken' })).toBeInTheDocument()
    expect(within(dialog).getByRole('heading', { name: 'Reacties' })).toBeInTheDocument()
    expect(within(dialog).queryByRole('link', { name: 'Terug naar de checklist' })).toBeNull()
  })

  it('closes at once and replaces the URL with the list as it was', () => {
    show()
    fireEvent.click(screen.getByRole('button', { name: 'Sluiten' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(replace).toHaveBeenCalledWith(CLOSE, { scroll: false })
  })

  // `task-detail.tsx`'s `currentAssignee`: a person who has left the wedding is no longer in
  // `staff`, so without it Edit would open with nobody (or the viewer) chosen, and Save would
  // quietly hand the task to someone else.
  it('opens Edit with an assignee who has left the wedding still chosen, by name', () => {
    const GONE = '018f0000-0000-7000-8000-0000000000d9'
    render(
      <WithMessages>
        <TaskPanel
          task={task({ assigneeUserId: GONE, assigneeName: 'Cas', assigneeRole: 'planner' })}
          comments={[]}
          coupleUserIds={[]}
          weddingDate="2027-06-12"
          events={[]}
          staff={[{ id: '018f0000-0000-7000-8000-0000000000d2', name: 'Els' }]}
          viewerId="018f0000-0000-7000-8000-0000000000d1"
          today="2027-03-10"
          closeHref={CLOSE}
        />
      </WithMessages>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Bewerken' }))
    expect(screen.getByRole('radio', { name: 'Cas' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Els' })).not.toBeChecked()
  })

  it('closes on Escape', () => {
    show()
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(replace).toHaveBeenCalledWith(CLOSE, { scroll: false })
  })
})
