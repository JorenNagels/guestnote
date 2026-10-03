import type { VendorRow } from '@guestnote/db'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import copy from '../../../messages/app/vendors.en.json'
import { TOAST_LABELS } from '../toast/fixtures.ts'
import { ToastProvider } from '../toast/toast-provider.tsx'
import { DirectoryView } from './directory-view.tsx'
import { directoryLabels } from './labels.ts'

const archive = vi.fn()
const restore = vi.fn()
// The real hook returns `null` outside an App Router tree; this one reads what the test put in
// the address bar, which is what the router hands a page on a reload.
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(window.location.search),
}))
vi.mock('../../app/pro/(app)/vendors/actions.ts', () => ({
  createDirectoryVendor: vi.fn(),
  updateDirectoryVendor: vi.fn(),
  archiveDirectoryVendor: (...a: unknown[]) => archive(...a),
  restoreDirectoryVendor: (...a: unknown[]) => restore(...a),
}))

/**
 * Spec 0009 C4 on the studio directory: Archive acts at once, the edit sheet closes, and the
 * toast offers Undo, which calls the restore with the same vendor. Labels come from the real
 * English catalogue through the real `directoryLabels`, so a key missing there fails here.
 */
const lookup = (catalogue: Record<string, unknown>) => {
  const get = (key: string) =>
    key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], catalogue)
  const t = (key: string) => String(get(key))
  t.raw = get
  return t
}

const VENDOR: VendorRow = {
  id: 'v1',
  name: 'Bloemen Els',
  category: 'Flowers',
  email: null,
  phone: null,
  notes: null,
}

const view = (vendor: VendorRow = VENDOR) =>
  render(
    <ToastProvider labels={TOAST_LABELS}>
      <DirectoryView vendors={[vendor]} canWrite labels={directoryLabels(lookup(copy))} />
    </ToastProvider>,
  )

const toast = () => within(screen.getByTestId('toast')).getByRole('status')

beforeEach(() => {
  archive.mockReset().mockResolvedValue({ ok: true })
  restore.mockReset().mockResolvedValue({ ok: true })
})

describe('archiving a directory vendor', () => {
  it('archives at once, closes the sheet, and offers Undo by name', async () => {
    view()
    fireEvent.click(screen.getByRole('button', { name: 'Edit Bloemen Els' }))
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }))
    await waitFor(() => expect(archive).toHaveBeenCalledWith('v1'))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(toast()).toHaveTextContent('“Bloemen Els” archived.')

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(restore).toHaveBeenCalledWith('v1'))
    await waitFor(() => expect(toast()).toHaveTextContent('Restored.'))
  })

  // `String.replace` reads `$&` in a replacement STRING as "the match", so this name used to come
  // out as "Bloem {name} Co".
  it('puts a name holding a replacement pattern into the toast as written', async () => {
    view({ ...VENDOR, name: 'Bloem $& Co' })
    fireEvent.click(screen.getByRole('button', { name: 'Edit Bloem $& Co' }))
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }))
    await waitFor(() => expect(toast()).toHaveTextContent('“Bloem $& Co” archived.'))
  })

  it('keeps the sheet open, with no toast, when the archive is refused', async () => {
    archive.mockResolvedValue({ ok: false, error: 'forbidden' })
    view()
    fireEvent.click(screen.getByRole('button', { name: 'Edit Bloemen Els' }))
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(copy.errors.forbidden)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(toast()).toBeEmptyDOMElement()
  })

  it("says the undo was refused in the directory's words", async () => {
    restore.mockResolvedValue({ ok: false, error: 'forbidden' })
    view()
    fireEvent.click(screen.getByRole('button', { name: 'Edit Bloemen Els' }))
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(toast()).toHaveTextContent(copy.errors.forbidden))
  })
})

/**
 * The filters over the directory: category chips from the data, counts that follow the search,
 * and both remembered in the URL. The URL is asserted through `window.location`, which is what a
 * reload reads back; the write trails by `URL_DELAY_MS`, hence `waitFor`.
 */
describe('filtering the directory', () => {
  const row = (over: Partial<VendorRow>): VendorRow => ({ ...VENDOR, ...over })
  const VENDORS = [
    row({ id: 'v1', name: 'Bloemen Els', category: 'Flowers' }),
    // Typed on another day: same category, other case, a stray space.
    row({ id: 'v2', name: 'Fleur & Co', category: 'flowers ' }),
    row({ id: 'v3', name: 'Foto Jan', category: 'Photography' }),
    row({ id: 'v4', name: 'Zaal Ter Linde', category: 'Venue' }),
  ]

  const list = (vendors: VendorRow[] = VENDORS, url = '/vendors') => {
    window.history.replaceState(null, '', url)
    render(
      <ToastProvider labels={TOAST_LABELS}>
        <DirectoryView vendors={vendors} canWrite labels={directoryLabels(lookup(copy))} />
      </ToastProvider>,
    )
  }
  const chips = () => within(screen.getByRole('group', { name: 'Filter by category' }))
  /** The vendors the table shows, by name, in the order of `VENDORS`. */
  const names = () => VENDORS.map((v) => v.name).filter((n) => screen.queryByText(n))

  beforeEach(() => window.history.replaceState(null, '', '/'))

  it('offers one chip per category on the list, spellings folded, with counts', () => {
    list()
    expect(
      chips()
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['All 4', 'Flowers 2', 'Photography 1', 'Venue 1'])
    expect(chips().getByRole('button', { name: 'All 4' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('narrows the table to a category in one click, and puts it in the URL', async () => {
    list()
    fireEvent.click(chips().getByRole('button', { name: 'Flowers 2' }))
    expect(names()).toEqual(['Bloemen Els', 'Fleur & Co'])
    expect(chips().getByRole('button', { name: 'Flowers 2' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await waitFor(() => expect(window.location.search).toBe('?category=Flowers'))

    fireEvent.click(chips().getByRole('button', { name: 'All 4' }))
    expect(names()).toHaveLength(4)
    await waitFor(() => expect(window.location.search).toBe(''))
  })

  it('starts from the URL, whatever its case, so a reload keeps the filter', () => {
    list(VENDORS, '/vendors?category=photography')
    expect(names()).toEqual(['Foto Jan'])
    expect(chips().getByRole('button', { name: 'Photography 1' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('counts what the search lets through, and keeps the search in the URL', async () => {
    list()
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search vendors' }), {
      target: { value: 'fleur' },
    })
    expect(
      chips()
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['All 1', 'Flowers 1', 'Photography 0', 'Venue 0'])
    await waitFor(() => expect(window.location.search).toBe('?q=fleur'))
  })

  it('says when nothing matches, and Clear filters brings every row back', async () => {
    list(VENDORS, '/vendors?category=Venue&q=bloem')
    expect(screen.queryByRole('table')).toBeNull()
    expect(screen.getByText('No vendors match these filters.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(names()).toHaveLength(4)
    expect(screen.getByRole('searchbox', { name: 'Search vendors' })).toHaveValue('')
    await waitFor(() => expect(window.location.search).toBe(''))
  })

  it('treats a category no vendor has as All, not as an empty table', () => {
    list(VENDORS, '/vendors?category=Catering')
    expect(names()).toHaveLength(4)
    expect(chips().getByRole('button', { name: 'All 4' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('draws no chips when there is only one category to choose', () => {
    list([VENDORS[0] as VendorRow, VENDORS[1] as VendorRow])
    expect(screen.queryByRole('group', { name: 'Filter by category' })).toBeNull()
  })
})
