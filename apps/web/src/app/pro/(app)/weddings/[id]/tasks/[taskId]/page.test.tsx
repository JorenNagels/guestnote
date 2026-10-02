import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The task page's one decision of its own since spec 0009 B1 moved its loading into
 * `loadTaskThread`: a task the loader does not find is a 404, not an empty page. The panel on the
 * checklist answers the same `null` with "no panel" (`../page.test.tsx`); this page has nothing
 * else to show, so it must not render a detail for no task.
 *
 * Mocked as `../page.test.tsx` mocks: the seams that leave the process, `notFound`, and the client
 * components, stubbed to print what they were handed.
 */
const getWedding = vi.fn()
const listWeddingEvents = vi.fn()
const loadTaskThread = vi.fn()
const notFound = vi.fn(() => {
  throw new Error('NEXT_NOT_FOUND')
})

vi.mock('@guestnote/db', async (orig) => ({
  ...(await orig<typeof import('@guestnote/db')>()),
  getWedding: (...a: unknown[]) => getWedding(...a),
  listWeddingEvents: (...a: unknown[]) => listWeddingEvents(...a),
}))
vi.mock('../../../../../../../lib/db.ts', () => ({ getDb: () => ({}) }))
vi.mock('../../../../../../../lib/principal.ts', () => ({
  currentMemberships: async () => ({ userId: 'u1', orgs: [], weddings: [] }),
  currentOrgId: async () => 'org-a',
}))
vi.mock('../../../../../../../lib/task-thread.ts', () => ({
  loadTaskThread: (...a: unknown[]) => loadTaskThread(...a),
}))
vi.mock('next/navigation', () => ({ notFound: () => notFound() }))
vi.mock('../../../../../../../components/tasks/provider.tsx', () => ({
  TasksIntl: ({ children }: { children: React.ReactNode }) => children,
}))
vi.mock('../../../../../../../components/tasks/task-detail.tsx', () => ({
  TaskDetail: ({ task }: { task: { title: string } }) => <h1>{task.title}</h1>,
}))
vi.mock('../../../../../../../components/tasks/comments.tsx', () => ({
  Comments: () => null,
}))

const TaskPage = (await import('./page.tsx')).default

const WID = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b'
const TID = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a60'

const page = () => TaskPage({ params: Promise.resolve({ id: WID, taskId: TID }) })

beforeEach(() => {
  vi.clearAllMocks()
  getWedding.mockResolvedValue({ id: WID, weddingDate: '2027-06-12' })
  listWeddingEvents.mockResolvedValue([])
  loadTaskThread.mockResolvedValue({
    task: { id: TID, title: 'Book the DJ', visibility: 'shared' },
    comments: [],
    coupleUserIds: [],
  })
})

describe('the task page', () => {
  it('renders the task the loader finds, asked for by this request', async () => {
    render(await page())
    expect(loadTaskThread).toHaveBeenCalledWith(expect.anything(), TID)
    expect(screen.getByRole('heading', { name: 'Book the DJ' })).toBeInTheDocument()
    expect(notFound).not.toHaveBeenCalled()
  })

  it('is a 404 when the loader finds no task', async () => {
    loadTaskThread.mockResolvedValue(null)
    await expect(page()).rejects.toThrow('NEXT_NOT_FOUND')
    expect(notFound).toHaveBeenCalledTimes(1)
  })
})
