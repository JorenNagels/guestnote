import { render, screen } from '@testing-library/react'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

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
 * `getWedding` returns `null` for three different situations -- no such wedding, a wedding
 * in another organisation, and a wedding in this organisation that a `member` is not
 * assigned to -- and this page must render them identically. research/07 section 3's
 * permission table ends "neither -> 404 (not 403 -- don't confirm the wedding exists)",
 * because telling somebody a wedding exists but is not theirs is itself the leak. Which of
 * the three it was is asserted at the repository layer in `packages/db/test/repos.test.ts`;
 * what is asserted here is that this page cannot tell them apart.
 *
 * ## What is mocked
 *
 * The two seams that leave the process -- `@guestnote/db` and `lib/principal.ts` -- plus
 * `next-intl/server` and `notFound`. The component itself is not mocked: it renders, so the
 * date formatting is real. That matters more than it looks, because the UTC pin below is a
 * correctness property and a mocked render would let it rot.
 */
const getWedding = vi.fn()
const currentMemberships = vi.fn()
const currentOrgId = vi.fn()
const notFound = vi.fn(() => {
  // The real one throws to unwind the render, and the page relies on that: the lines after
  // it assume a non-null wedding. A mock that merely records the call would let a `return`
  // go missing without a single test noticing.
  throw new Error('NEXT_NOT_FOUND')
})

vi.mock('@guestnote/db', () => ({ getWedding: (...a: unknown[]) => getWedding(...a) }))
vi.mock('../../../../../lib/db.ts', () => ({ getDb: () => ({}) }))
vi.mock('../../../../../lib/principal.ts', () => ({
  currentMemberships: () => currentMemberships(),
  currentOrgId: () => currentOrgId(),
}))
vi.mock('next/navigation', () => ({ notFound: () => notFound() }))
vi.mock('next-intl/server', () => ({
  getLocale: async () => 'nl',
  getTranslations: async () => (key: string) =>
    ({
      'nav.weddingSection': 'Deze bruiloft',
      'wedding.date': 'Datum',
      'wedding.status': 'Status',
      'weddings.dateUnknown': 'Datum nog niet vastgelegd',
      'weddings.status.live': 'Live',
      'weddings.status.draft': 'Concept',
    })[key] ?? key,
}))

const WeddingPage = (await import('./page.tsx')).default

const MEMBERSHIPS = { userId: 'u1', orgs: [{ orgId: 'org-a', role: 'owner' }], weddings: [] }

beforeEach(() => {
  vi.clearAllMocks()
  currentMemberships.mockResolvedValue(MEMBERSHIPS)
  currentOrgId.mockResolvedValue('org-a')
})

const renderPage = async (id = 'w1') =>
  render(await WeddingPage({ params: Promise.resolve({ id }) }))

describe('a wedding the principal can see', () => {
  it('names it and shows its status', async () => {
    getWedding.mockResolvedValue({
      id: 'w1',
      slug: 'els-en-jan',
      status: 'live',
      coupleDisplayName: 'Els & Jan',
      weddingDate: '2027-06-12',
    })
    await renderPage()

    expect(screen.getByRole('heading', { name: 'Els & Jan' })).toBeInTheDocument()
    expect(screen.getByText('Live')).toBeInTheDocument()
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
    getWedding.mockResolvedValue({
      id: 'w1',
      slug: 'a',
      status: 'draft',
      coupleDisplayName: 'A',
      weddingDate: '2027-01-01',
    })
    await renderPage()
    expect(screen.getByText(/1 januari 2027/)).toBeInTheDocument()
  })

  it('says so plainly when there is no date yet', async () => {
    getWedding.mockResolvedValue({
      id: 'w1',
      slug: 'a',
      status: 'draft',
      coupleDisplayName: 'A',
      weddingDate: null,
    })
    await renderPage()
    expect(screen.getByText('Datum nog niet vastgelegd')).toBeInTheDocument()
  })
})

describe('a wedding the principal cannot see', () => {
  it('is a 404 and never a 403, whatever the reason', async () => {
    // One assertion for all three reasons on purpose: the page receives `null` and has no
    // way to tell them apart, which is the property.
    getWedding.mockResolvedValue(null)
    await expect(renderPage()).rejects.toThrow('NEXT_NOT_FOUND')
    expect(notFound).toHaveBeenCalled()
  })

  it('does not leak the wedding id it was asked about', async () => {
    getWedding.mockResolvedValue(null)
    await expect(renderPage('secret-wedding-id')).rejects.toThrow()
    expect(document.body.textContent).not.toContain('secret-wedding-id')
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
    expect(getWedding).not.toHaveBeenCalled()
  })
})
