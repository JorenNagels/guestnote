import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { VendorBoard } from '../../lib/vendor-boards.ts'
import { type VendorBoardActions, VendorBoards } from './vendor-boards.tsx'

/**
 * The vendor's boards (spec 0007): what a failed image does. Time is `Date.now`, stubbed, rather
 * than fake timers -- CLAUDE.md's fake-timer trap -- and the component only ever reads it.
 */
const BOARDS: VendorBoard[] = [
  {
    id: 'b1',
    name: 'Fotograaf',
    images: [
      { id: 'f1', name: 'Golden hour', mime: 'image/jpeg', sizeBytes: 1, url: 'https://get/f1?v1' },
      { id: 'f2', name: 'Tables', mime: 'image/png', sizeBytes: 1, url: 'https://get/f2?v1' },
      // 2026-10-04: a document. No URL at render; opened through the token when tapped.
      { id: 'f3', name: 'Floor plan.pdf', mime: 'application/pdf', sizeBytes: 1536, url: null },
    ],
  },
]
const LABELS = {
  download: 'Download',
  close: 'Close',
  open: 'Enlarge {name}',
  openFile: 'Open {name}',
}

let now = 1_000_000
let actions: {
  refresh: ReturnType<typeof vi.fn>
  download: ReturnType<typeof vi.fn>
  open: ReturnType<typeof vi.fn>
}

beforeEach(() => {
  now = 1_000_000
  vi.spyOn(Date, 'now').mockImplementation(() => now)
  actions = {
    refresh: vi.fn(async () => ({ f1: 'https://get/f1?v2', f2: 'https://get/f2?v2' })),
    download: vi.fn(async () => null),
    open: vi.fn(async () => 'https://get/f3?inline'),
  }
})
afterEach(() => vi.restoreAllMocks())

const view = () =>
  render(
    <VendorBoards
      boards={BOARDS}
      labels={LABELS}
      actions={actions as unknown as VendorBoardActions}
      locale="en"
    />,
  )
const img = (name: string) => screen.getByRole('img', { name })

describe('a tile that fails to load', () => {
  it('on a fresh URL falls back to caption and download at once, without asking the server', async () => {
    view()
    await act(async () => {
      fireEvent.error(img('Golden hour'))
    })
    expect(actions.refresh).not.toHaveBeenCalled()
    expect(screen.queryByRole('img', { name: 'Golden hour' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Download' })).toBeInTheDocument()
  })

  it('after the URLs have lapsed asks once for all failing tiles, and swaps them in', async () => {
    view()
    now += 6 * 60_000
    await act(async () => {
      fireEvent.error(img('Golden hour'))
      fireEvent.error(img('Tables'))
    })
    expect(actions.refresh).toHaveBeenCalledTimes(1)
    expect(img('Golden hour')).toHaveAttribute('src', 'https://get/f1?v2')
    expect(img('Tables')).toHaveAttribute('src', 'https://get/f2?v2')
  })

  it('refreshes once, not in a loop: a tile failing again on its fresh URL falls back', async () => {
    view()
    now += 6 * 60_000
    await act(async () => {
      fireEvent.error(img('Golden hour'))
    })
    await act(async () => {
      fireEvent.error(img('Golden hour'))
    })
    expect(actions.refresh).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('img', { name: 'Golden hour' })).toBeNull()
  })

  it('falls back when the refresh itself fails', async () => {
    actions.refresh.mockRejectedValue(new Error('offline'))
    view()
    now += 6 * 60_000
    await act(async () => {
      fireEvent.error(img('Golden hour'))
    })
    expect(screen.queryByRole('img', { name: 'Golden hour' })).toBeNull()
  })

  it('falls back when the server says the link is gone', async () => {
    actions.refresh.mockResolvedValue(null)
    view()
    now += 6 * 60_000
    await act(async () => {
      fireEvent.error(img('Golden hour'))
    })
    expect(screen.queryByRole('img', { name: 'Golden hour' })).toBeNull()
    // The other tile has not failed, so it is left alone.
    expect(img('Tables')).toHaveAttribute('src', 'https://get/f2?v1')
  })

  it('falls back when the refreshed set no longer holds the image (unshared since)', async () => {
    actions.refresh.mockResolvedValue({ f2: 'https://get/f2?v2' })
    view()
    now += 6 * 60_000
    await act(async () => {
      fireEvent.error(img('Golden hour'))
    })
    expect(screen.queryByRole('img', { name: 'Golden hour' })).toBeNull()
  })
})

describe('download', () => {
  it('asks for an attachment URL for that image and goes to it', async () => {
    const assign = vi.fn()
    vi.stubGlobal('location', { ...window.location, assign })
    actions.download.mockResolvedValue('https://get/f1?attachment')
    view()
    fireEvent.click(screen.getByRole('button', { name: 'Enlarge Golden hour' }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Download' }))
    })
    expect(actions.download).toHaveBeenCalledWith('f1')
    expect(assign).toHaveBeenCalledWith('https://get/f1?attachment')
    vi.unstubAllGlobals()
  })

  it("offers the fallback tile's own download", async () => {
    view()
    await act(async () => {
      fireEvent.error(img('Tables'))
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Download' }))
    })
    expect(actions.download).toHaveBeenCalledWith('f2')
  })
})

describe('a document on the board (2026-10-04)', () => {
  it('is drawn as its type and size, not as an image or a fallback tile', () => {
    view()
    const tile = screen.getByRole('button', { name: 'Open Floor plan.pdf' })
    expect(tile).toHaveTextContent('PDF')
    expect(tile).toHaveTextContent('1.5 KB')
    expect(screen.getAllByRole('img')).toHaveLength(2)
    // Not mistaken for a broken image: no fallback Download button for it.
    expect(screen.queryByRole('button', { name: 'Download' })).toBeNull()
  })

  it('opens in a new tab with a URL signed through the token at the tap', async () => {
    const tab = { opener: window as unknown, location: { href: '' }, close: vi.fn() }
    const open = vi.spyOn(window, 'open').mockImplementation(() => tab as unknown as Window)
    view()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Open Floor plan.pdf' }))
    })
    expect(open).toHaveBeenCalledWith('', '_blank')
    expect(actions.open).toHaveBeenCalledWith('f3')
    expect(tab.location.href).toBe('https://get/f3?inline')
    expect(tab.opener).toBeNull()
    // Never the lightbox: that is for images.
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
