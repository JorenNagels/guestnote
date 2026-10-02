import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Today's page, for the part spec 0009 C2 added to it: which window of payments it asks for, and
 * which "nothing" sentence it shows. The lists themselves have their own tests
 * (`components/today/*`); here they are stubs that say what they were handed, because what this
 * file decides is the wiring, not the rows.
 */
const listWeddings = vi.fn()
const listAssignedTasks = vi.fn()
const listDuePayments = vi.fn()
const currentMemberships = vi.fn()
const currentOrgId = vi.fn()

vi.mock('@guestnote/db', () => ({
  listWeddings: (...a: unknown[]) => listWeddings(...a),
  listAssignedTasks: (...a: unknown[]) => listAssignedTasks(...a),
  listDuePayments: (...a: unknown[]) => listDuePayments(...a),
  principalForOrg: () => ({ kind: 'orgStaff' }),
}))
const DB = { db: true }
vi.mock('../../../lib/db.ts', () => ({ getDb: () => DB }))
vi.mock('../../../lib/principal.ts', () => ({
  currentMemberships: () => currentMemberships(),
  currentOrgId: () => currentOrgId(),
}))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('next-intl/server', () => ({
  getFormatter: async () => ({ dateTime: () => 'vrijdag 2 oktober 2026' }),
  getTranslations: async () => (key: string) => key,
}))
vi.mock('../../../components/tasks/provider.tsx', () => ({
  TasksIntl: ({ children }: { children: React.ReactNode }) => children,
}))
vi.mock('../../../components/today/task-list.tsx', () => ({
  TaskList: ({ title }: { title: string }) => <section>{title}</section>,
}))
vi.mock('../../../components/today/wedding-card.tsx', () => ({
  WeddingCard: () => <span>card</span>,
}))
vi.mock('../../../components/today/payment-list.tsx', () => ({
  PaymentList: ({ payments }: { payments: { id: string }[] }) => (
    <p data-testid="payments">{payments.map((p) => p.id).join(',')}</p>
  ),
}))

const TodayPage = (await import('./page.tsx')).default

const MEMBERSHIPS = { userId: 'u1', orgs: [{ orgId: 'org-a', role: 'owner' }], weddings: [] }
const WEDDING = {
  id: 'w1',
  slug: 'els-en-jan',
  status: 'live',
  coupleDisplayName: 'Els & Jan',
  weddingDate: '2027-06-12',
  color: null,
}
const task = (dueDate: string) => ({
  id: `t-${dueDate}`,
  weddingId: 'w1',
  title: 'Book the DJ',
  status: 'open',
  dueDate,
  weddingName: 'Els & Jan',
  weddingDate: '2027-06-12',
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  // 23:30 UTC on 1 October is already 2 October in Brussels: "today" must be the Brussels day.
  vi.setSystemTime(new Date('2026-10-01T23:30:00Z'))
  currentMemberships.mockResolvedValue(MEMBERSHIPS)
  currentOrgId.mockResolvedValue('org-a')
  listWeddings.mockResolvedValue([WEDDING])
  listAssignedTasks.mockResolvedValue([])
  listDuePayments.mockResolvedValue([])
})
afterEach(() => vi.useRealTimers())

const renderPage = async () => render(await TodayPage())

describe('Today, with payments due (spec 0009 C2)', () => {
  it('asks for payments through the end of the same week the task list reaches', async () => {
    await renderPage()
    expect(listDuePayments).toHaveBeenCalledWith(DB, MEMBERSHIPS, 'org-a', '2026-10-09')
  })

  it('hands the payments to the list, and keeps the all-clear sentence for when nothing is due', async () => {
    const { unmount } = await renderPage()
    expect(screen.getByRole('status')).toHaveTextContent('allClear')
    unmount()

    listDuePayments.mockResolvedValue([{ id: 'p1' }])
    await renderPage()
    expect(screen.getByTestId('payments')).toHaveTextContent('p1')
    // A payment is due, so "nothing open this week" would be false: the sentence speaks for
    // the tasks alone, and the three empty task lists still do not appear.
    expect(screen.getByRole('status')).toHaveTextContent('tasksClear')
    expect(screen.queryByText('sections.needsYou')).toBeNull()
  })

  it('shows the task lists and no sentence when a task is due, payments or not', async () => {
    listAssignedTasks.mockResolvedValue([task('2026-10-02')])
    listDuePayments.mockResolvedValue([{ id: 'p1' }])
    await renderPage()
    expect(screen.getByText('sections.needsYou')).toBeInTheDocument()
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.getByTestId('payments')).toHaveTextContent('p1')
  })
})
