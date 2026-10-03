import { opensInTab } from '../../lib/board-items.ts'

/**
 * Opens one moodboard item with a URL signed at the click (2026-10-04): an image or a PDF in a new
 * tab, anything else saved in place, as the Files screen's Download is. Shared by the planner's
 * board, the couple's portal and the vendor link. A plain module so it is tested without a DOM.
 *
 * ## Why the tab is opened before the URL exists
 *
 * Signing is a Server Function, so the URL arrives after an `await`, and Safari refuses a
 * `window.open` that is not inside the click itself -- the tab would silently never appear. So a
 * blank tab is opened synchronously, then pointed at the URL. `noopener` cannot be passed (it
 * makes `open` return `null`, and there would be no tab to point), so `opener` is cut by hand
 * before the file loads. Rejected: an `<a href target=_blank>` to the URL signed at render, which
 * is dead five minutes after the page loaded; and a redirecting route per surface, which is three
 * new authenticated GET endpoints for what one click handler does.
 *
 * Resolves `false` when nothing could be signed (the item is gone, or the link was revoked); the
 * blank tab is closed again so the planner is not left looking at nothing.
 */
export async function openItem(
  mime: string,
  sign: () => Promise<string | null>,
  win: Pick<Window, 'open' | 'location'> = window,
): Promise<boolean> {
  if (!opensInTab(mime)) {
    const url = await sign().catch(() => null)
    if (!url) return false
    win.location.assign(url)
    return true
  }

  const tab = win.open('', '_blank')
  const url = await sign().catch(() => null)
  if (!url) {
    tab?.close()
    return false
  }
  // Absolute: in development the URL is relative (`lib/dev-files.ts`), and a blank tab has no
  // base of its own worth trusting across browsers.
  const absolute = new URL(url, win.location.href).href
  if (!tab) {
    // A blocker took the tab anyway. Opening in place beats opening nothing.
    win.location.assign(absolute)
    return true
  }
  tab.opener = null
  tab.location.href = absolute
  return true
}
