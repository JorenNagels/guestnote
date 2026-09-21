import { render, screen } from '@testing-library/react'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * **This file runs in New York, on purpose.**
 *
 * The UTC pin in the page under test only matters WEST of Greenwich, and this machine is on
 * Europe/Brussels -- a positive offset, where UTC midnight can never render as the previous
 * day. Measured 2026-08-21: with the default timezone, deleting `timeZone: 'UTC'` from the
 * page left every assertion here green, so the test that exists to guard the pin could not
 * see it break.
 *
 * Restored afterwards so a shared worker cannot inherit it. Vitest isolates per file today,
 * so nothing observes the leak -- but the day someone adds `--no-isolate` for speed, the
 * leak direction is the bad one: it would leave the process in UTC, a non-negative offset,
 * which makes exactly this file's mutation undetectable again.
 *
 * `delete` and not an assignment, because `TZ` is UNSET on this machine: assigning it back
 * writes the literal string `"undefined"`, which Node resolves to GMT+00:00 rather than to
 * the system zone. Verified 2026-08-21 -- the naive restore left the process in UTC.
 */
const REAL_TZ = process.env.TZ
process.env.TZ = 'America/New_York'
afterAll(() => {
  if (REAL_TZ === undefined) delete process.env.TZ
  else process.env.TZ = REAL_TZ
})

/**
 * The wedding overview, and specifically the branch that is a security property.
 *
 * `getWeddingDetail` returns `null` for no such wedding, a wedding in another organisation, a
 * wedding in this organisation that a `member` is not assigned to, and a `couple` or outside
 * `editor` -- and this page must render them identically. research/07 section 3's permission
 * table ends "neither -> 404 (not 403 -- don't confirm the wedding exists)", because telling
 * somebody a wedding exists but is not theirs is itself the leak. Which of them it was is
 * asserted at the repository layer in `packages/db/test/s1-weddings.test.ts`; what is asserted
 * here is that this page cannot tell them apart.
 *
 * ## What is mocked
 *
 * The seams that leave the process -- `@guestnote/db` and `lib/principal.ts` -- plus
 * `next-intl/server` and `notFound`. `WeddingHeader` and `WeddingTabs` are async Server
 * Components, which jsdom cannot render as children, so they are replaced by stubs; the header
 * keeps its real `formatCivilDate` because the UTC pin below is a correctness property and a
 * mocked date would let it rot. The header and the strip have their own tests.
 */
const getWeddingDetail = vi.fn()
const getWeddingTaskCounts = vi.fn()
const listWeddingEvents = vi.fn()
const currentMemberships = vi.fn()
const currentOrgId = vi.fn()
const notFound = vi.fn(() => {
  // The real one throws to unwind the render, and the page relies on that: the lines after
  // it assume a non-null wedding. A mock that merely records the call would let a `return`
  // go missing without a single test noticing.
  throw new Error('NEXT_NOT_FOUND')
})

vi.mock('@guestnote/db', () => ({
  getWeddingDetail: (...a: unknown[]) => getWeddingDetail(...a),
  getWeddingTaskCounts: (...a: unknown[]) => getWeddingTaskCounts(...a),
  listWeddingEvents: (...a: unknown[]) => listWeddingEvents(...a),
}))
vi.mock('../../../../../lib/db.ts', () => ({ getDb: () => ({}) }))
vi.mock('../../../../../lib/principal.ts', () => ({
  currentMemberships: () => currentMemberships(),
  currentOrgId: () => currentOrgId(),
}))
vi.mock('next/navigation', () => ({ notFound: () => notFound() }))
vi.mock('../../../../../components/wedding/wedding-header.tsx', async (orig) => ({
  ...(await orig<typeof import('../../../../../components/wedding/wedding-header.tsx')>()),
  WeddingHeader: ({ wedding }: { wedding: { coupleDisplayName: string } }) => (
    <h1>{wedding.coupleDisplayName}</h1>
  ),
}))
vi.mock('../../../../../components/wedding/wedding-tabs.tsx', () => ({
  WeddingTabs: ({ current }: { current: string }) => <nav data-current={current} />,
}))
vi.mock('next-intl/server', () => ({
  getLocale: async () => 'nl',
  getTranslations: async () => (key: string, values?: Record<string, unknown>) =>
    ({
      'stats.daysToGo': 'Dagen te gaan',
      'stats.daysSince': 'Dagen geleden',
      'stats.today': 'Vandaag',
      'stats.noDate': 'Nog geen datum',
      'stats.lateNone': 'Niets te laat',
      'stats.guestsUnknown': 'Nog niet ingevuld',
      'stats.noTasks': 'Nog geen taken',
      'events.title': 'Volgende momenten',
      'events.empty': 'Nog geen momenten',
      'events.noTime': 'Tijdstip nog open',
      'notes.title': 'Interne notities',
    })[key] ?? (values ? `${key} ${JSON.stringify(values)}` : key),
}))

const WeddingPage = (await import('./page.tsx')).default

const MEMBERSHIPS = { userId: 'u1', orgs: [{ orgId: 'org-a', role: 'owner' }], weddings: [] }

const WEDDING = {
  id: 'w1',
  slug: 'els-en-jan',
  status: 'live',
  coupleDisplayName: 'Els & Jan',
  weddingDate: '2027-06-12',
  color: null,
  venue: null,
  headcount: null,
  notes: null,
}
const WID = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b'
const COUNTS = { total: 0, open: 0, done: 0, overdue: 0 }

beforeEach(() => {
  vi.clearAllMocks()
  // Only `Date` is faked: React's scheduler keeps its timers (CLAUDE.md, the fake-timer trap).
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2027-06-01T10:00:00Z'))
  currentMemberships.mockResolvedValue(MEMBERSHIPS)
  currentOrgId.mockResolvedValue('org-a')
  getWeddingDetail.mockResolvedValue(WEDDING)
  getWeddingTaskCounts.mockResolvedValue(COUNTS)
  listWeddingEvents.mockResolvedValue([])
})
afterEach(() => vi.useRealTimers())

const renderPage = async (id = WID) =>
  render(await WeddingPage({ params: Promise.resolve({ id }) }))

describe('a wedding the principal can see', () => {
  it('names it, and points the strip at the overview', async () => {
    const { container } = await renderPage()
    expect(screen.getByRole('heading', { name: 'Els & Jan' })).toBeInTheDocument()
    expect(container.querySelector('nav')?.getAttribute('data-current')).toBe('overview')
  })

  it('counts the days to go, on the civil date', async () => {
    await renderPage()
    expect(screen.getByText('Dagen te gaan').nextElementSibling?.textContent).toContain('11')
  })

  /**
   * `weddings.wedding_date` is a `date`, and the schema says why: a wedding date is a local
   * civil date, the same date to the couple whether they are in Brussels or Bali. So it is
   * formatted in UTC, which looks wrong and is not -- Drizzle hands back `YYYY-MM-DD`,
   * `new Date()` reads that as UTC midnight, and formatting in a zone west of Greenwich
   * would render the day BEFORE. This asserts the day number, which is the only thing that
   * discriminates the bug.
   */
  it('formats the date as the civil date the couple wrote down', async () => {
    getWeddingDetail.mockResolvedValue({ ...WEDDING, weddingDate: '2027-07-01' })
    await renderPage()
    expect(screen.getByText(/1 juli 2027/)).toBeInTheDocument()
  })

  it('says so plainly when there is no date yet, with no countdown figure', async () => {
    getWeddingDetail.mockResolvedValue({ ...WEDDING, weddingDate: null })
    await renderPage()
    expect(screen.getByText('Nog geen datum')).toBeInTheDocument()
    expect(screen.getByText('Dagen te gaan').nextElementSibling?.textContent).toContain('–')
  })

  it('switches to days ago once the day has passed, and says "today" on the day', async () => {
    getWeddingDetail.mockResolvedValue({ ...WEDDING, weddingDate: '2027-05-30' })
    await renderPage()
    expect(screen.getByText('Dagen geleden').nextElementSibling?.textContent).toContain('2')
  })

  it('says today on the day itself', async () => {
    getWeddingDetail.mockResolvedValue({ ...WEDDING, weddingDate: '2027-06-01' })
    await renderPage()
    expect(screen.getByText('Dagen te gaan').nextElementSibling?.textContent).toContain('Vandaag')
  })

  it('shows task figures, and says which are late', async () => {
    getWeddingTaskCounts.mockResolvedValue({ total: 8, open: 5, done: 3, overdue: 2 })
    await renderPage()
    expect(screen.getByText('stats.openTasks').nextElementSibling?.textContent).toContain('5')
    expect(screen.getByText(/stats\.lateSome \{"count":2\}/)).toBeInTheDocument()
    expect(screen.getByText('3/8')).toBeInTheDocument()
    expect(screen.getByText(/stats\.donePercent \{"percent":38\}/)).toBeInTheDocument()
  })

  it('says nothing is late when nothing is, and that there are no tasks when there are none', async () => {
    await renderPage()
    expect(screen.getByText('Niets te laat')).toBeInTheDocument()
    expect(screen.getByText('Nog geen taken')).toBeInTheDocument()
  })

  it('shows the guest count, or a dash when it is not known', async () => {
    getWeddingDetail.mockResolvedValue({ ...WEDDING, headcount: 120 })
    const { unmount } = await renderPage()
    expect(screen.getByText('120')).toBeInTheDocument()
    unmount()

    getWeddingDetail.mockResolvedValue({ ...WEDDING, headcount: null })
    await renderPage()
    expect(screen.getByText('Nog niet ingevuld')).toBeInTheDocument()
  })

  it('shows the internal notes only when there are some', async () => {
    const { unmount } = await renderPage()
    expect(screen.queryByText('Interne notities')).not.toBeInTheDocument()
    unmount()

    getWeddingDetail.mockResolvedValue({ ...WEDDING, notes: 'Gluten-vrije taart' })
    await renderPage()
    expect(screen.getByText('Interne notities')).toBeInTheDocument()
    expect(screen.getByText('Gluten-vrije taart')).toBeInTheDocument()
  })
})

describe('the next events', () => {
  const event = (n: number, startsOn: string, startsAt: string | null = '15:30') => ({
    id: `e${n}`,
    label: `Moment ${n}`,
    startsOn,
    startsAt,
    venue: null,
    position: n,
  })

  it('says there are none', async () => {
    await renderPage()
    expect(screen.getByText('Nog geen momenten')).toBeInTheDocument()
  })

  it('leaves out events that are already over, and keeps today', async () => {
    listWeddingEvents.mockResolvedValue([
      event(1, '2027-05-31'),
      event(2, '2027-06-01'),
      event(3, '2027-06-12', null),
    ])
    await renderPage()
    expect(screen.queryByText('Moment 1')).not.toBeInTheDocument()
    expect(screen.getByText('Moment 2')).toBeInTheDocument()
    expect(screen.getByText('Moment 3')).toBeInTheDocument()
    expect(screen.getByText(/Tijdstip nog open/)).toBeInTheDocument()
  })

  it('shows five and counts the rest', async () => {
    listWeddingEvents.mockResolvedValue(
      Array.from({ length: 7 }, (_, i) =>
        event(i + 1, `2027-06-${String(i + 10).padStart(2, '0')}`),
      ),
    )
    await renderPage()
    expect(screen.getByText('Moment 5')).toBeInTheDocument()
    expect(screen.queryByText('Moment 6')).not.toBeInTheDocument()
    expect(screen.getByText(/events\.more \{"count":2\}/)).toBeInTheDocument()
  })
})

describe('a wedding the principal cannot see', () => {
  it('is a 404 and never a 403, whatever the reason', async () => {
    // One assertion for all the reasons on purpose: the page receives `null` and has no
    // way to tell them apart, which is the property.
    getWeddingDetail.mockResolvedValue(null)
    await expect(renderPage()).rejects.toThrow('NEXT_NOT_FOUND')
    expect(notFound).toHaveBeenCalled()
    // And it reads nothing else about the wedding it has just refused to show.
    expect(getWeddingTaskCounts).not.toHaveBeenCalled()
    expect(listWeddingEvents).not.toHaveBeenCalled()
  })

  it('does not leak the wedding id it was asked about', async () => {
    getWeddingDetail.mockResolvedValue(null)
    await expect(renderPage('secret-wedding-id')).rejects.toThrow()
    expect(document.body.textContent).not.toContain('secret-wedding-id')
  })

  it('is a 404 for an id that is not a uuid, without asking the database', async () => {
    await expect(renderPage('not-a-uuid')).rejects.toThrow('NEXT_NOT_FOUND')
    expect(getWeddingDetail).not.toHaveBeenCalled()
  })

  /**
   * A signed-in user with no organisation is a real reachable state, not an error -- the
   * OTP flow creates an account on first verification, so anyone who can receive mail has a
   * session. They must not reach a wedding page, and must not be told a different story
   * from someone who simply asked for the wrong id.
   */
  it('is the same 404 for a user with no organisation at all', async () => {
    currentOrgId.mockResolvedValue(null)
    await expect(renderPage()).rejects.toThrow('NEXT_NOT_FOUND')
    // And it never reaches the database, so no query runs for a principal that cannot exist.
    expect(getWeddingDetail).not.toHaveBeenCalled()
  })
})
