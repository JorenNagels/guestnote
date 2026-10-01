import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The portal layout's decisions (spec 0008): who gets a 404, what a draft wedding shows instead
 * of its pages, the archived banner, and a navigation of enabled modules only. `currentCouple` is
 * mocked -- the database half is `packages/db/test/couple-*.test.ts`.
 */
const currentCouple = vi.fn()
vi.mock('../../../../../lib/couple.ts', () => ({
  currentCouple: (id: string) => currentCouple(id),
}))
vi.mock('../../../(app)/actions.ts', () => ({ signOut: vi.fn() }))
// An async server component, which a DOM render cannot await; it only supplies copy.
vi.mock('../../../../../components/couple/portal/intl.tsx', () => ({
  CoupleIntl: ({ children }: { children: React.ReactNode }) => children,
}))
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
  usePathname: () => '/w/w1',
}))
vi.mock('next-intl/server', () => ({
  getLocale: async () => 'nl',
  getTranslations: async () =>
    Object.assign(
      (key: string, v?: Record<string, string>) =>
        v ? `${key} ${Object.values(v).join(' ')}` : key,
      {
        raw: (key: string) => key,
      },
    ),
}))

const { default: Layout } = await import('./layout.tsx')

const HOME = {
  weddingId: 'w1',
  coupleDisplayName: 'Anna & Tom',
  weddingDate: '2027-06-14',
  venue: null,
  status: 'live',
  localeDefault: 'nl',
  timezone: 'Europe/Brussels',
  modules: ['tasks', 'moodboards', 'run_sheet', 'vendors', 'budget'],
  studioName: 'Studio Wit',
  contact: { name: 'Ilse', email: 'ilse@wit.be' },
  coupleUserIds: ['u1'],
}

const draw = async (home: Partial<typeof HOME> = {}) => {
  currentCouple.mockResolvedValue({ principal: {}, home: { ...HOME, ...home } })
  render(await Layout({ params: Promise.resolve({ id: 'w1' }), children: <p>CHILD</p> }))
}

beforeEach(() => vi.clearAllMocks())

describe('the portal layout', () => {
  it('is a 404 for anyone who is not a couple of this wedding', async () => {
    currentCouple.mockResolvedValue(null)
    await expect(Layout({ params: Promise.resolve({ id: 'w1' }), children: null })).rejects.toThrow(
      'NEXT_NOT_FOUND',
    )
  })

  it('renders the page, the planner contact, and no banner on a live wedding', async () => {
    await draw()
    expect(screen.getByText('CHILD')).toBeInTheDocument()
    expect(screen.getByText('contact Ilse ilse@wit.be')).toBeInTheDocument()
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('shows a draft wedding as not open yet, and never renders the page', async () => {
    await draw({ status: 'draft' })
    expect(screen.getByText('draft Studio Wit')).toBeInTheDocument()
    expect(screen.queryByText('CHILD')).toBeNull()
    expect(screen.queryByRole('navigation')).toBeNull()
  })

  it('says an archived wedding is closed, and still renders the page', async () => {
    await draw({ status: 'archived' })
    expect(screen.getByRole('status')).toHaveTextContent('archived')
    expect(screen.getByText('CHILD')).toBeInTheDocument()
  })

  it('lists only the modules the planner switched on', async () => {
    await draw({ modules: ['tasks', 'budget'] })
    const links = screen.getAllByRole('link').map((a) => a.getAttribute('href'))
    expect(links).toEqual(['/w/w1', '/w/w1/planning', '/w/w1/budget'])
  })
})
