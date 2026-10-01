import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { countLabel, type PortalTask, PortalTasks, type PortalTasksCopy } from './portal-tasks.tsx'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

const COPY: PortalTasksCopy = {
  done: 'DONE',
  markDone: 'TICK {title}',
  tickFailed: 'TICK-FAILED',
  comments: { none: 'COMMENT', one: '1 C', other: '{n} C' },
  thread: {
    empty: 'EMPTY',
    placeholder: 'WRITE',
    send: 'SEND',
    sending: 'SENDING',
    remove: 'DELETE',
    failed: 'FAILED',
    tooLong: 'LONG',
    couple: 'COUPLE',
  },
}
const TASK: PortalTask = {
  id: 't1',
  title: 'Kies de taart',
  notes: null,
  due: null,
  done: false,
  ours: true,
  commentCount: 0,
}
const actions = () => ({
  tick: vi.fn().mockResolvedValue(true),
  thread: vi.fn().mockResolvedValue([]),
  comment: vi.fn().mockResolvedValue(true),
  remove: vi.fn().mockResolvedValue(true),
})

describe('PortalTasks (spec 0008)', () => {
  it('gives a checkbox to the couple own tasks only', () => {
    render(
      <PortalTasks
        groups={[
          { label: 'G', tasks: [TASK, { ...TASK, id: 't2', title: 'Planner', ours: false }] },
        ]}
        copy={COPY}
        readOnly={false}
        actions={actions()}
      />,
    )
    expect(screen.getAllByRole('checkbox')).toHaveLength(1)
    expect(screen.getByRole('checkbox', { name: 'TICK Kies de taart' })).toBeInTheDocument()
  })

  it('reverts a tick the server refused, and says so', async () => {
    const a = actions()
    a.tick.mockResolvedValue(false)
    const user = userEvent.setup()
    render(
      <PortalTasks
        groups={[{ label: 'G', tasks: [TASK] }]}
        copy={COPY}
        readOnly={false}
        actions={a}
      />,
    )
    await user.click(screen.getByRole('checkbox'))
    expect(a.tick).toHaveBeenCalledWith('t1', true)
    expect(await screen.findByText('TICK-FAILED')).toBeInTheDocument()
    expect(screen.getByRole('checkbox')).not.toBeChecked()
  })

  it('on an archived wedding there is nothing to tick', () => {
    render(
      <PortalTasks
        groups={[{ label: 'G', tasks: [TASK] }]}
        copy={COPY}
        readOnly
        actions={actions()}
      />,
    )
    expect(screen.queryByRole('checkbox')).toBeNull()
  })

  it('counts comments as none, one, or n', () => {
    expect([0, 1, 7].map((n) => countLabel(COPY.comments, n))).toEqual(['COMMENT', '1 C', '7 C'])
  })
})
