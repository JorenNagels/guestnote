import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The checklist page's `?task=` branch (spec 0009 B1): which task the panel gets, and that an id
 * the caller cannot have is no panel rather than a 404 or a 500.
 *
 * What is mocked: the seams that leave the process (`@guestnote/db`, `lib/principal.ts`,
 * `lib/task-thread.ts`), `next-intl/server` and `notFound`. `Checklist` and `TaskPanel` are client
 * components with their own tests; here they are stubs that print what the page handed them.
 * `loadTaskThread` is mocked as a whole -- its own scoping is `lib/task-thread.test.ts`'s and the
 * repo's -- so this file asserts only that the page asks it, with this request's id.
 */
const getWedding = vi.fn()
const listTasks = vi.fn()
const listWeddingEvents = vi.fn()
const listTaskAssignees = vi.fn()
const loadTaskThread = vi.fn()
const notFound = vi.fn(() => {
  throw new Error('NEXT_NOT_FOUND')
})

vi.mock('@guestnote/db', async (orig) => ({
  ...(await orig<typeof import('@guestnote/db')>()),
  getWedding: (...a: unknown[]) => getWedding(...a),
  listTasks: (...a: unknown[]) => listTasks(...a),
  listWeddingEvents: (...a: unknown[]) => listWeddingEvents(...a),
  listTaskAssignees: (...a: unknown[]) => listTaskAssignees(...a),
}))
vi.mock('../../../../../../lib/db.ts', () => ({ getDb: () => ({}) }))
vi.mock('../../../../../../lib/principal.ts', () => ({
  currentMemberships: async () => ({ userId: 'u1', orgs: [], weddings: [] }),
  currentOrgId: async () => 'org-a',
}))
vi.mock('../../../../../../lib/task-thread.ts', () => ({
  loadTaskThread: (...a: unknown[]) => loadTaskThread(...a),
}))
vi.mock('next/navigation', () => ({ notFound: () => notFound() }))
vi.mock('next-intl/server', () => ({ getTranslations: async () => (key: string) => key }))
vi.mock('../../../../../../components/tasks/provider.tsx', () => ({
  TasksIntl: ({ children }: { children: React.ReactNode }) => children,
}))
vi.mock('../../../../../../components/tasks/checklist.tsx', () => ({
  Checklist: ({
    tasks,
    staff,
    viewerId,
  }: {
    tasks: { id: string; coupleUnread: boolean }[]
    staff: { name: string }[]
    viewerId: string
  }) => (
    <ul data-testid="list" data-viewer={viewerId} data-staff={staff.map((s) => s.name).join(',')}>
      {tasks.map((t) => (
        <li key={t.id} data-testid="row" data-unread={String(t.coupleUnread)} />
      ))}
    </ul>
  ),
}))
vi.mock('../../../../../../components/tasks/task-panel.tsx', () => ({
  TaskPanel: ({ task, closeHref }: { task: { title: string }; closeHref: string }) => (
    <div role="dialog" aria-label={task.title} data-close={closeHref} />
  ),
}))

const ChecklistPage = (await import('./page.tsx')).default

const WID = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b'
const TID = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a60'
const TASK = { id: TID, title: 'Book the DJ', coupleUnread: true }

const renderPage = async (query: Record<string, string>) =>
  render(
    await ChecklistPage({
      params: Promise.resolve({ id: WID }),
      searchParams: Promise.resolve(query),
    }),
  )

beforeEach(() => {
  vi.clearAllMocks()
  getWedding.mockResolvedValue({ id: WID, weddingDate: '2027-06-12' })
  listTasks.mockResolvedValue([TASK, { id: 'other', coupleUnread: true }])
  listWeddingEvents.mockResolvedValue([])
  listTaskAssignees.mockResolvedValue([
    { id: 'u1', name: 'Anna' },
    { id: 'u2', name: 'Ben' },
  ])
  loadTaskThread.mockResolvedValue({ task: TASK, comments: [], coupleUserIds: [] })
})

describe('the checklist page with ?task=', () => {
  it('opens the panel on that task, and closing it keeps the filter', async () => {
    await renderPage({ filter: 'open', task: TID })
    expect(loadTaskThread).toHaveBeenCalledWith(expect.anything(), TID)
    expect(screen.getByRole('dialog', { name: 'Book the DJ' })).toHaveAttribute(
      'data-close',
      `/weddings/${WID}/tasks?filter=open`,
    )
  })

  it('clears the open task’s unread dot in the list, and only that one', async () => {
    await renderPage({ task: TID })
    expect(screen.getAllByTestId('row').map((r) => r.dataset.unread)).toEqual(['false', 'true'])
  })

  it('shows no panel for a task the loader does not find, and still the list', async () => {
    loadTaskThread.mockResolvedValue(null)
    await renderPage({ task: TID })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getAllByTestId('row')).toHaveLength(2)
    expect(notFound).not.toHaveBeenCalled()
  })

  it('does not look for a task when the URL names none', async () => {
    await renderPage({})
    expect(loadTaskThread).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getAllByTestId('row').map((r) => r.dataset.unread)).toEqual(['true', 'true'])
  })
})

describe('the team behind the checklist (spec 0009 C1)', () => {
  it('hands the checklist the signed-in user and who a task can be given to', async () => {
    await renderPage({ filter: 'mine' })
    const list = screen.getByTestId('list')
    expect(list).toHaveAttribute('data-viewer', 'u1')
    expect(list).toHaveAttribute('data-staff', 'Anna,Ben')
  })
})
