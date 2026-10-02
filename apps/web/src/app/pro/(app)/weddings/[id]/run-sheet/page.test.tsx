import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The run-sheet page's two choices of its own (spec 0009 A2, A3): which language the main day is
 * named in, and which studio the printed header names. Everything else it does is hand the repo's
 * rows to `RunSheetView`, which has its own tests.
 *
 * ## What is mocked
 *
 * The seams that leave the process -- `@guestnote/db` and `lib/principal.ts` -- plus
 * `next-intl/server` and `notFound`, as `../page.test.tsx` does. The view is stubbed and the
 * page's returned element is read directly: its props ARE the page's output, and a rendered
 * view would only be asserting the view again.
 *
 * `getTranslations` answers by the locale it is ASKED for, so a page that named the main day in
 * the planner's screen language (`getLocale`, pinned to `nl` below) instead of the wedding's
 * would read `Trouwdag` where `Jour du mariage` is expected.
 */
const getWedding = vi.fn()
const listWeddingEvents = vi.fn()
const getRunSheet = vi.fn()
const currentMemberships = vi.fn()
const currentOrgId = vi.fn()
const currentOrgs = vi.fn()
const notFound = vi.fn(() => {
  throw new Error('NEXT_NOT_FOUND')
})

vi.mock('@guestnote/db', async (orig) => ({
  ...(await orig<typeof import('@guestnote/db')>()),
  getWedding: (...a: unknown[]) => getWedding(...a),
  listWeddingEvents: (...a: unknown[]) => listWeddingEvents(...a),
  getRunSheet: (...a: unknown[]) => getRunSheet(...a),
}))
vi.mock('../../../../../../lib/db.ts', () => ({ getDb: () => ({}) }))
vi.mock('../../../../../../lib/principal.ts', () => ({
  currentMemberships: () => currentMemberships(),
  currentOrgId: () => currentOrgId(),
  currentOrgs: () => currentOrgs(),
}))
vi.mock('next/navigation', () => ({ notFound: () => notFound() }))
vi.mock('../../../../../../components/run-sheet/run-sheet-view.tsx', () => ({
  RunSheetView: () => null,
}))

const MAIN_DAY: Record<string, string> = {
  nl: 'Trouwdag',
  en: 'Wedding day',
  fr: 'Jour du mariage',
}
vi.mock('next-intl/server', () => ({
  getLocale: async () => 'nl',
  getTranslations:
    async ({ locale, namespace }: { locale: string; namespace: string }) =>
    (key: string) =>
      namespace === 'app.runSheet.event' && key === 'mainDay'
        ? (MAIN_DAY[locale] ?? `no messages for ${locale}`)
        : key,
}))

const RunSheetPage = (await import('./page.tsx')).default

const WID = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b'
const MEMBERSHIPS = { userId: 'u1', orgs: [{ orgId: 'org-b', role: 'owner' }], weddings: [] }

type ViewProps = {
  mainDay: { label: string; date: string | null }
  studioName: string
  locale: string
  selectedEventId: string | null
  items: { id: string; eventId: string }[]
}

async function renderPage(query: { event?: string | string[] } = {}): Promise<ViewProps> {
  const el = await RunSheetPage({
    params: Promise.resolve({ id: WID }),
    searchParams: Promise.resolve(query),
  })
  return el.props as ViewProps
}

beforeEach(() => {
  vi.clearAllMocks()
  currentMemberships.mockResolvedValue(MEMBERSHIPS)
  currentOrgId.mockResolvedValue('org-b')
  // The org the request is in is the SECOND one: `orgs[0]` would name the wrong studio.
  currentOrgs.mockResolvedValue([
    { id: 'org-a', name: 'Atelier Een', slug: 'een' },
    { id: 'org-b', name: 'Studio Twee', slug: 'twee' },
  ])
  getWedding.mockResolvedValue({
    id: WID,
    coupleDisplayName: 'Els & Jan',
    weddingDate: '2026-10-03',
    color: null,
  })
  listWeddingEvents.mockResolvedValue([])
  getRunSheet.mockResolvedValue({ locale: 'nl', items: [], vendors: [], owners: [] })
})

describe('the run-sheet page', () => {
  it("names the main day in the wedding's language, not the screen's", async () => {
    getRunSheet.mockResolvedValue({ locale: 'fr', items: [], vendors: [], owners: [] })
    const props = await renderPage()
    expect(props.locale).toBe('nl')
    expect(props.mainDay).toEqual({ label: 'Jour du mariage', date: '2026-10-03' })
  })

  it('falls back to Dutch for a locale the app does not ship', async () => {
    // `locale_default` is free text; asking next-intl for `de` would find no messages at all.
    getRunSheet.mockResolvedValue({ locale: 'de', items: [], vendors: [], owners: [] })
    expect((await renderPage()).mainDay.label).toBe('Trouwdag')
  })

  it("hands the view the selected event's items only, the first event when none is asked for", async () => {
    // `getRunSheet` reads every event of the wedding in one round trip; the page cuts it.
    listWeddingEvents.mockResolvedValue([{ id: 'e1' }, { id: 'e2' }])
    getRunSheet.mockResolvedValue({
      locale: 'nl',
      items: [
        { id: 'a', eventId: 'e1' },
        { id: 'b', eventId: 'e2' },
        { id: 'c', eventId: 'e1' },
      ],
      vendors: [],
      owners: [],
    })
    const second = await renderPage({ event: 'e2' })
    expect(second.selectedEventId).toBe('e2')
    expect(second.items.map((i) => i.id)).toEqual(['b'])

    const first = await renderPage()
    expect(first.selectedEventId).toBe('e1')
    expect(first.items.map((i) => i.id)).toEqual(['a', 'c'])
  })

  it('names the studio the request is in, not the first one the user belongs to', async () => {
    expect((await renderPage()).studioName).toBe('Studio Twee')
  })
})
