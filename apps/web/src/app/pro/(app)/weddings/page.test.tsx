import { render, screen, within } from '@testing-library/react'
import { createTranslator } from 'next-intl'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import nl from '../../../../../messages/nl.json'

/**
 * The weddings list's views and search (spec 0009 C3): the links, their counts and
 * `aria-current`, the search box echoing `?q=`, and the two empty states.
 *
 * What is mocked: the seams that leave the process (`@guestnote/db`, `lib/principal.ts`), the
 * clock (`todayCivil`, pinned so "upcoming" and "past" do not drift with the date the suite runs),
 * and `next-intl/server`, which is handed the real Dutch catalogue so the copy is the copy that
 * ships. Which row lands in which view, and in what order, is `lib/wedding-list.test.ts`'s job;
 * this file only checks that the page wires the URL through it and renders the result.
 */
const listWeddings = vi.fn()

vi.mock('@guestnote/db', async (orig) => ({
  ...(await orig<typeof import('@guestnote/db')>()),
  listWeddings: (...a: unknown[]) => listWeddings(...a),
}))
vi.mock('../../../../lib/db.ts', () => ({ getDb: () => ({}) }))
vi.mock('../../../../lib/principal.ts', () => ({
  currentMemberships: async () => ({ userId: 'u1', orgs: [], weddings: [] }),
  currentOrgId: async () => 'org-a',
}))
vi.mock('../../../../lib/tminus.ts', () => ({ todayCivil: () => '2026-10-02' }))
vi.mock('next-intl/server', () => ({
  getTranslations: async (namespace: 'app') =>
    createTranslator({ locale: 'nl', messages: nl, namespace }),
  getLocale: async () => 'nl',
}))

const WeddingsPage = (await import('./page.tsx')).default

const wedding = (
  id: string,
  coupleDisplayName: string,
  weddingDate: string | null,
  status = 'live',
) => ({
  id,
  slug: id,
  status,
  coupleDisplayName,
  weddingDate,
  color: null,
})

const BOOK = [
  wedding('w1', 'Thérèse & Joël', '2026-11-14'),
  wedding('w2', 'Marie & Thomas', '2027-05-01'),
  wedding('w3', 'An & Pieter', '2026-06-20'),
  wedding('w4', 'Lotte & Bram', '2025-08-30', 'archived'),
]

const renderPage = async (query: Record<string, string> = {}) =>
  render(await WeddingsPage({ searchParams: Promise.resolve(query) }))

const viewLinks = () =>
  within(screen.getByRole('navigation', { name: 'Weergave' })).getAllByRole('link')
const couples = () =>
  screen
    .queryAllByRole('listitem')
    .filter((li) => li.closest('nav') === null)
    .map((li) => li.textContent ?? '')

beforeEach(() => {
  vi.clearAllMocks()
  listWeddings.mockResolvedValue(BOOK)
})

describe('the weddings list', () => {
  it('opens on Komend, with every view counted and linked', async () => {
    await renderPage()
    expect(viewLinks().map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['Komend 2', '/weddings'],
      ['Voorbij 1', '/weddings?view=past'],
      ['Gearchiveerd 1', '/weddings?view=archived'],
      ['Alle 4', '/weddings?view=all'],
    ])
    expect(screen.getByRole('link', { name: 'Komend 2' })).toHaveAttribute('aria-current', 'page')
    expect(
      viewLinks().filter((a) => a.hasAttribute('aria-current')),
      'exactly one view is current',
    ).toHaveLength(1)
    expect(couples()).toHaveLength(2)
    expect(couples()[0]).toContain('Thérèse & Joël')
    expect(couples()[1]).toContain('Marie & Thomas')
  })

  it('shows the view the URL names, and marks that one current', async () => {
    await renderPage({ view: 'past' })
    expect(screen.getByRole('link', { name: 'Voorbij 1' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Komend 2' })).not.toHaveAttribute('aria-current')
    expect(couples()).toHaveLength(1)
    expect(couples()[0]).toContain('An & Pieter')
  })

  it('falls back to Komend for a view it does not know', async () => {
    await renderPage({ view: 'voorbij' })
    expect(screen.getByRole('link', { name: 'Komend 2' })).toHaveAttribute('aria-current', 'page')
    expect(couples()).toHaveLength(2)
  })

  it('echoes the search, keeps it on every view link, and counts only the matches', async () => {
    await renderPage({ view: 'all', q: 'therese' })
    expect(screen.getByRole('searchbox', { name: 'Zoek een bruiloft' })).toHaveValue('therese')
    expect(viewLinks().map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['Komend 1', '/weddings?q=therese'],
      ['Voorbij 0', '/weddings?view=past&q=therese'],
      ['Gearchiveerd 0', '/weddings?view=archived&q=therese'],
      ['Alle 1', '/weddings?view=all&q=therese'],
    ])
    expect(couples()).toHaveLength(1)
    expect(couples()[0]).toContain('Thérèse & Joël')
  })

  it('submits the search to the list, carrying the view but not the default one', async () => {
    const { unmount } = await renderPage({ view: 'archived' })
    // Found through its field, not `getByRole('search')`: the page wraps it in `<search>`, whose
    // implicit landmark role jsdom's aria tables do not know yet (measured 2026-10-02), so a role
    // query cannot see it here and the landmark is not asserted by this file.
    const form = screen.getByRole('searchbox').closest('form')
    expect(form).toHaveAttribute('action', '/weddings')
    expect(form).toHaveAttribute('method', 'get')
    expect(form?.querySelector('input[type="hidden"][name="view"]')).toHaveValue('archived')
    unmount()

    await renderPage()
    expect(
      screen.getByRole('searchbox').closest('form')?.querySelector('input[name="view"]'),
    ).toBeNull()
  })

  it('says a search found nothing, and offers to clear it on the same view', async () => {
    await renderPage({ view: 'past', q: 'janssens' })
    expect(screen.getByText('Geen bruiloft gevonden voor “janssens”.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Zoekopdracht wissen' })).toHaveAttribute(
      'href',
      '/weddings?view=past',
    )
    expect(couples()).toEqual([])
  })

  it('says an empty view is empty, with nothing to clear when nobody searched', async () => {
    listWeddings.mockResolvedValue([BOOK[0]])
    await renderPage({ view: 'archived' })
    expect(screen.getByText('Niets gearchiveerd.')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Zoekopdracht wissen' })).toBeNull()
  })

  it('keeps the one sentence for an org with no weddings, and no search over nothing', async () => {
    listWeddings.mockResolvedValue([])
    await renderPage({ q: 'therese' })
    expect(screen.getByText(nl.app.weddings.empty)).toBeInTheDocument()
    expect(screen.queryByRole('searchbox')).toBeNull()
    expect(screen.queryByRole('navigation', { name: 'Weergave' })).toBeNull()
  })
})
