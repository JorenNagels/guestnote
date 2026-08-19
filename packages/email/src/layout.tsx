import type { ReactNode } from 'react'
import { COLOUR, FONT, SIZE } from './theme.ts'

/**
 * The shell every Guestnote email renders inside.
 *
 * ## Why this is hand-written
 *
 * `research/05-architecture.md` section 6 chose react-email, and this package uses its
 * renderer (`@react-email/render`). What it does NOT use is its component library:
 * `@react-email/components` was deprecated ("Package no longer supported"), and its
 * replacement -- importing components from the unified `react-email` package -- has no
 * subpath exports and pulls `prismjs`, `marked`, `tailwindcss` and `esbuild` in from its
 * single entry point. resend/react-email#3556 measured that at roughly 80 MB per
 * serverless function, and `apps/web/next.config.ts` already sets `output: 'standalone'`
 * with `outputFileTracingRoot`, so this repo would pay it. File tracing traces files, not
 * tree-shaken imports.
 *
 * What is left is the boilerplate below, which is table markup that has not meaningfully
 * changed in a decade. Owning it explicitly costs about forty lines and buys a Lambda
 * bundle that stays the size of the SDK.
 *
 * ## Every choice here is an email-client workaround
 *
 * They are individually ugly and collectively load-bearing, so each is commented at the
 * point it appears rather than justified in a block nobody reads next to the code.
 */

export type LayoutProps = {
  /** BCP 47, for screen readers and for the client's own hyphenation. */
  lang: string
  /** Shown in the browser tab of "view in browser", and read by some clients. */
  title: string
  /**
   * The grey line an inbox shows after the subject.
   *
   * Not optional. Left unset, Gmail and Apple Mail scrape the first text they find, which
   * for this layout is the wordmark -- so the list view reads "Guestnote Guestnote".
   */
  preheader: string
  footer: string
  children: ReactNode
}

/**
 * `<head>` as a raw string, because JSX cannot express a comment.
 *
 * The MSO conditional block is a comment by construction (`<!--[if mso]>`), and React has
 * no way to emit one -- there is no comment node in JSX and no escape hatch short of
 * `dangerouslySetInnerHTML`. Applying it to the whole head rather than smuggling the metas
 * in as JSX keeps one mechanism instead of two.
 */
function head(title: string): string {
  return [
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    // Stops iOS Mail resizing text it decides is too small, which otherwise inflates the
    // code block past the container width.
    '<meta name="x-apple-disable-message-reformatting">',
    // iOS and several Android clients autolink anything that looks like a phone number, and a
    // six-digit code looks exactly like one -- it arrives blue, underlined and tappable, which
    // reads as the "click here to sign in" link this email deliberately does not have.
    '<meta name="format-detection" content="telephone=no,date=no,address=no,email=no">',
    // theme.ts is light-only. These two ask clients not to auto-invert; the ones that
    // ignore it (Gmail on Android) at least get a palette with enough contrast either way.
    '<meta name="color-scheme" content="light">',
    '<meta name="supported-color-schemes" content="light">',
    `<title>${escapeHtml(title)}</title>`,
    // Outlook on Windows renders through Word at 120 DPI, which scales every px length by
    // 1.25 and breaks the 600px column. Pinning PixelsPerInch is the documented fix.
    '<!--[if mso]>',
    '<xml><o:OfficeDocumentSettings>',
    '<o:PixelsPerInch>96</o:PixelsPerInch>',
    '</o:OfficeDocumentSettings></xml>',
    '<![endif]-->',
    // Two resets that inline styles cannot express, so they have to live in a <style> and
    // be accepted as best-effort: clients that strip <style> (older Gmail) still render
    // correctly, they just lose the mobile padding tweak.
    '<style>',
    'a{color:inherit}',
    `@media (max-width:${SIZE.containerWidth}px){`,
    '.gn-pad{padding-left:20px!important;padding-right:20px!important}',
    '.gn-code{font-size:30px!important;letter-spacing:6px!important}',
    '}',
    '</style>',
  ]
    .filter(Boolean)
    .join('')
}

/** The five characters that matter, for the one value interpolated into raw head HTML. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function Layout({ lang, title, preheader, footer, children }: LayoutProps) {
  return (
    <html lang={lang}>
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: the MSO block is an HTML
          comment, which JSX cannot emit. The one interpolated value goes through
          escapeHtml() above. */}
      <head dangerouslySetInnerHTML={{ __html: head(title) }} />
      <body
        style={{
          margin: 0,
          padding: 0,
          backgroundColor: COLOUR.background,
          color: COLOUR.foreground,
          fontFamily: FONT.sans,
          // Belt and braces with the meta above; some clients read only one of the two.
          colorScheme: 'light',
          // Stops iOS and some webmail clients scaling the type up on their own.
          WebkitTextSizeAdjust: '100%',
          textSizeAdjust: '100%',
        }}
      >
        {/*
          The preheader. Hidden by six declarations rather than `display:none`, because
          Gmail strips that and shows the text inline. This combination is the one that
          survives: zero-size, transparent, clipped, and pushed out of flow.
        */}
        <div
          // react-email's own convention, honoured by the `plainTextSelectors` that
          // render.ts passes to the text conversion. Without it the preheader appears at the
          // top of the plaintext part, where it is a verbatim duplicate of a line further
          // down -- it exists to be read in an inbox list, not in the message.
          data-skip-in-text="true"
          style={{
            display: 'none',
            overflow: 'hidden',
            lineHeight: '1px',
            opacity: 0,
            maxHeight: 0,
            maxWidth: 0,
          }}
        >
          {preheader}
        </div>

        {/*
          Two nested tables, not a div with `margin: 0 auto`. Outlook ignores auto margins
          on block elements, so the outer table centres with `align` and the inner one
          carries the fixed width. `role="presentation"` keeps both out of the
          accessibility tree -- they are layout, not data.
        */}
        <table
          role="presentation"
          width="100%"
          cellPadding={0}
          cellSpacing={0}
          border={0}
          style={{ backgroundColor: COLOUR.background, borderCollapse: 'collapse' }}
        >
          <tbody>
            <tr>
              <td align="center" style={{ padding: `${SIZE.spaceXl}px ${SIZE.spaceMd}px` }}>
                <table
                  role="presentation"
                  width={SIZE.containerWidth}
                  cellPadding={0}
                  cellSpacing={0}
                  border={0}
                  style={{
                    width: `${SIZE.containerWidth}px`,
                    maxWidth: '100%',
                    borderCollapse: 'collapse',
                    backgroundColor: COLOUR.surface,
                    border: `1px solid ${COLOUR.border}`,
                    borderRadius: `${SIZE.radius}px`,
                  }}
                >
                  <tbody>
                    <tr>
                      <td
                        className="gn-pad"
                        style={{ padding: `${SIZE.spaceXl}px ${SIZE.spaceXl}px ${SIZE.spaceMd}px` }}
                      >
                        <Wordmark />
                      </td>
                    </tr>
                    <tr>
                      <td
                        className="gn-pad"
                        style={{ padding: `0 ${SIZE.spaceXl}px ${SIZE.spaceXl}px` }}
                      >
                        {children}
                      </td>
                    </tr>
                    <tr>
                      <td
                        className="gn-pad"
                        style={{
                          padding: `${SIZE.spaceMd}px ${SIZE.spaceXl}px`,
                          borderTop: `1px solid ${COLOUR.border}`,
                          backgroundColor: COLOUR.background,
                          // The radius has to be repeated on the last cell or Outlook
                          // paints a square corner over the rounded table beneath it.
                          borderBottomLeftRadius: `${SIZE.radius}px`,
                          borderBottomRightRadius: `${SIZE.radius}px`,
                        }}
                      >
                        <p
                          style={{
                            margin: 0,
                            fontSize: '12px',
                            lineHeight: '18px',
                            color: COLOUR.mutedForeground,
                          }}
                        >
                          {footer}
                        </p>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>
          </tbody>
        </table>
      </body>
    </html>
  )
}

/**
 * The wordmark as text, never `guestnote-logo.svg`.
 *
 * Three reasons, in order of weight: most clients block remote images by default, so an
 * image wordmark is an empty box on first open; an SVG specifically is unsupported in
 * Outlook and Gmail; and hosting it would make the email depend on a public asset URL
 * that does not exist yet. Text renders everywhere, costs no request, and survives
 * dark-mode inversion.
 */
function Wordmark() {
  return (
    <p
      style={{
        margin: 0,
        fontSize: '18px',
        lineHeight: '24px',
        fontWeight: 600,
        letterSpacing: '-0.01em',
        color: COLOUR.primary,
      }}
    >
      Guestnote
    </p>
  )
}
