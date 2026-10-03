import { describe, expect, it, vi } from 'vitest'
import { openItem } from './open-item.ts'

type FakeTab = { opener: unknown; location: { href: string }; close: () => void }

function fakeWindow(
  tab: FakeTab | null = { opener: 'me', location: { href: '' }, close: vi.fn() },
) {
  const order: string[] = []
  const win = {
    open: vi.fn(() => {
      order.push('open')
      return tab
    }),
    location: { href: 'http://app.guestnote.localhost:3000/weddings/w/moodboard', assign: vi.fn() },
  }
  const sign = (url: string | null) =>
    vi.fn(async () => {
      order.push('sign')
      return url
    })
  // Typed loosely on purpose: a test double of `Window` with only the two members used.
  return { win: win as unknown as Window, raw: win, tab, order, sign }
}

describe('openItem', () => {
  it('opens a PDF in a tab that exists before the signing await, then points it at the file', async () => {
    const { win, raw, tab, order, sign } = fakeWindow()
    expect(await openItem('application/pdf', sign('https://bucket/x?sig'), win)).toBe(true)
    // The order is the whole point: Safari blocks a window.open made after the await.
    expect(order).toEqual(['open', 'sign'])
    expect(raw.open).toHaveBeenCalledWith('', '_blank')
    expect(tab?.location.href).toBe('https://bucket/x?sig')
    expect(tab?.opener).toBeNull()
    expect(raw.location.assign).not.toHaveBeenCalled()
  })

  it('resolves a relative development URL against the page', async () => {
    const { win, tab, sign } = fakeWindow()
    await openItem('image/png', sign('/api/dev-files/a/b/c?sig=1'), win)
    expect(tab?.location.href).toBe('http://app.guestnote.localhost:3000/api/dev-files/a/b/c?sig=1')
  })

  it('saves an Office file in place and opens no tab', async () => {
    const { win, raw, sign } = fakeWindow()
    const docx = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    expect(await openItem(docx, sign('https://bucket/d'), win)).toBe(true)
    expect(raw.open).not.toHaveBeenCalled()
    expect(raw.location.assign).toHaveBeenCalledWith('https://bucket/d')
  })

  it('closes the blank tab again when nothing could be signed', async () => {
    const { win, tab, sign } = fakeWindow()
    expect(await openItem('application/pdf', sign(null), win)).toBe(false)
    expect(tab?.close).toHaveBeenCalled()
  })

  it('treats a failed Server Function call like nothing signed', async () => {
    const { win, tab } = fakeWindow()
    const failing = vi.fn(async () => {
      throw new Error('network')
    })
    expect(await openItem('application/pdf', failing, win)).toBe(false)
    expect(tab?.close).toHaveBeenCalled()
  })

  it('opens in place when a blocker took the tab', async () => {
    const { win, raw, sign } = fakeWindow(null)
    expect(await openItem('application/pdf', sign('https://bucket/x'), win)).toBe(true)
    expect(raw.location.assign).toHaveBeenCalledWith('https://bucket/x')
  })
})
