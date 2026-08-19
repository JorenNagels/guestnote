import { createElement } from 'react'
import { describe, expect, it } from 'vitest'
import { renderEmail } from './render.ts'
import { PREVIEW_COPY, SignInCode } from './templates/sign-in-code.tsx'

/**
 * What the sign-in email must be true of, regardless of how it looks.
 *
 * Not a snapshot. A snapshot of email HTML fails on every spacing tweak and passes through
 * every regression that matters -- the same argument `packages/ui/src/button.test.tsx` makes
 * for not asserting on class strings. Each assertion below is a property somebody would file
 * a bug about.
 */

const render = () =>
  renderEmail(createElement(SignInCode, { code: '123456', locale: 'nl', copy: PREVIEW_COPY }))

describe('the sign-in code email', () => {
  it('carries the code in both the HTML and the plaintext part', async () => {
    const { html, text } = await render()
    expect(html).toContain('123456')
    // The text part is not decoration: a `multipart/alternative` message with one scores
    // better with filters than HTML-only, and this domain has no sending reputation yet.
    expect(text).toContain('123456')
  })

  /**
   * **The assertion this file exists for.**
   *
   * research/07-auth-and-tenancy.md replaced the magic link with a code partly because mail
   * scanners fetch every URL before delivery. An email that then contains a sign-in link
   * reintroduces the habit, and trains a planner to click links in mail that looks like ours.
   * "We remembered not to add one" is not a property a codebase keeps for two years.
   */
  it('contains no link at all', async () => {
    const { html } = await render()
    expect(html).not.toMatch(/<a[\s>]/i)
    expect(html).not.toMatch(/href=/i)
  })

  it('announces the recipient language on the document', async () => {
    const { html } = await render()
    expect(html).toMatch(/<html[^>]*lang="nl"/)
    const fr = await renderEmail(
      createElement(SignInCode, { code: '654321', locale: 'fr', copy: PREVIEW_COPY }),
    )
    expect(fr.html).toMatch(/<html[^>]*lang="fr"/)
  })

  /**
   * `@react-email/render` prepends this, we do not. Asserted because an email without a
   * doctype is rendered in quirks mode by Outlook.com, which changes how table widths
   * collapse -- and because it documents that the renderer, not the template, owns it.
   */
  it('is a complete document with the XHTML transitional doctype', async () => {
    const { html } = await render()
    expect(html.trimStart()).toMatch(/^<!DOCTYPE html PUBLIC "-\/\/W3C\/\/DTD XHTML 1\.0/i)
  })

  /**
   * The Outlook DPI fix survives rendering. It is an HTML comment, which JSX cannot express,
   * so `layout.tsx` injects the head as a raw string -- if that mechanism ever breaks, this is
   * what notices, and the symptom otherwise is a 600px column rendering at 750px in Outlook.
   */
  it('keeps the MSO conditional block and the autolink suppression', async () => {
    const { html } = await render()
    expect(html).toContain('<!--[if mso]>')
    expect(html).toContain('<o:PixelsPerInch>96</o:PixelsPerInch>')
    // Without this, iOS turns a six-digit run into a blue, tappable tel: link.
    expect(html).toContain('format-detection')
  })

  it('puts the preheader in the HTML but keeps it out of the plaintext', async () => {
    const { html, text } = await render()
    expect(html).toContain(PREVIEW_COPY.preheader)
    // It is a duplicate of the expiry line, and it exists to be read in an inbox list rather
    // than in the message. `data-skip-in-text` plus react-email's own selectors do this.
    expect(text).not.toContain(PREVIEW_COPY.preheader)
  })

  /**
   * html-to-text uppercases `h1` by default, so this arrived as "JE AANMELDCODE" -- shouting
   * in the one part of the email that has no styling to soften it, and wrong in Dutch.
   */
  it('does not shout the heading in the plaintext part', async () => {
    const { text } = await render()
    expect(text).toContain(PREVIEW_COPY.heading)
    expect(text).not.toContain(PREVIEW_COPY.heading.toUpperCase())
  })

  it('uses the subject as the document title', async () => {
    const { html } = await render()
    expect(html).toContain(`<title>${PREVIEW_COPY.subject}</title>`)
  })
})
