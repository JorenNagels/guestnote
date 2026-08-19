import { plainTextSelectors, render, toPlainText } from '@react-email/render'
import type { ReactNode } from 'react'

/**
 * React element in, the two bodies SES wants out.
 *
 * ## One render pass, not two
 *
 * `@react-email/render` can produce plaintext directly with `{ plainText: true }`, but that
 * re-renders the whole tree. `toPlainText` is exported from the same package and operates on
 * the HTML we already have, so this does the work once. Read off the installed 2.1.0's own
 * type definitions -- `render` is `(node, options?) => Promise<string>` and `toPlainText` is
 * `(html, options?) => string`.
 *
 * ## Why a plaintext part at all
 *
 * Not for the handful of people reading mail in a terminal. A `multipart/alternative` message
 * with a text part scores better with spam filters than an HTML-only one, and this is the
 * first mail this domain will ever send -- there is no sending reputation to lean on, so
 * every cheap signal is worth taking. It also means the code is still readable if a client
 * refuses the HTML.
 *
 * ## `pretty` is off
 *
 * It routes the output through prettier, which is a dependency of this package but not one
 * worth paying per send: it costs CPU on a Lambda for whitespace nobody reads. The preview
 * server formats its own output, so the readable version is available where it is useful.
 */
export type RenderedEmail = {
  readonly html: string
  readonly text: string
}

/**
 * `plainTextSelectors` is react-email's own list, extended rather than replaced.
 *
 * It carries the `[data-skip-in-text=true]` rule that keeps the hidden preheader out of the
 * text part (see the div in `layout.tsx`), and skips `img`. The addition is the heading:
 * html-to-text uppercases `h1` by default, so "Je aanmeldcode" arrived as "JE AANMELDCODE" --
 * which in a plaintext email reads as shouting, and in Dutch is simply wrong.
 */
const TEXT_SELECTORS = [...plainTextSelectors, { selector: 'h1', options: { uppercase: false } }]

export async function renderEmail(element: ReactNode): Promise<RenderedEmail> {
  const html = await render(element, { pretty: false })
  return { html, text: toPlainText(html, { selectors: TEXT_SELECTORS }) }
}
