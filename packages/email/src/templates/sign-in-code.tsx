import { Layout } from '../layout.tsx'
import { COLOUR, FONT, SIZE } from '../theme.ts'

/**
 * The words this email needs, already resolved and already interpolated.
 *
 * **The template takes finished strings and does no formatting.** `apps/web/src/lib/mailer.ts`
 * builds this from `apps/web/messages/{nl,en,fr}.json` with next-intl's `createTranslator`,
 * so ICU placeholders (`{code}`, `{minutes}`) are substituted before they arrive here.
 *
 * Two things that buys, both of which were the reason to keep the catalogue in the app
 * rather than beside the templates:
 *
 *   - There is one catalogue for the whole product. `apps/web/src/i18n/request.ts` said this
 *     pipeline was coming and declined to migrate to `next/root-params` because of it.
 *   - This package needs no locale logic, no plural rules and no dependency on next-intl.
 *     It renders whatever prose it is handed.
 *
 * And because the type is exported from here, a catalogue missing a key is a TypeScript
 * error at the construction site in `lib/mailer.ts` -- not a blank line in an inbox.
 */
export type SignInCodeCopy = {
  /** Leads with the code. See the note on `Subject` in lib/mailer.ts for why. */
  readonly subject: string
  readonly preheader: string
  readonly heading: string
  readonly intro: string
  /** Already carries the number of minutes. */
  readonly expiry: string
  readonly ignore: string
  readonly footer: string
}

export type SignInCodeProps = {
  /** Six digits. Rendered as one selectable run so copy-paste and iOS autofill both work. */
  readonly code: string
  /** BCP 47. Sets `<html lang>`, which is what a screen reader announces the digits in. */
  readonly locale: string
  readonly copy: SignInCodeCopy
}

/**
 * The sign-in code email.
 *
 * ## There is no link in this email, on purpose
 *
 * `research/07-auth-and-tenancy.md`'s 2026-08-18 note replaced the magic link with a code
 * for three measured reasons, one of which was that mail scanners fetch every URL before
 * delivery and spend single-use tokens. An email that then contains a "sign in" button
 * reintroduces the habit the credential change was meant to remove, and trains a planner to
 * click links in mail that appears to come from us -- which is the exact shape of the
 * phishing this product will eventually be targeted by.
 *
 * `render.test.ts` asserts the absence, because "we remembered not to add a link" is not a
 * property a codebase keeps for two years.
 */
export function SignInCode({ code, locale, copy }: SignInCodeProps) {
  return (
    <Layout lang={locale} title={copy.subject} preheader={copy.preheader} footer={copy.footer}>
      <h1
        style={{
          margin: `0 0 ${SIZE.spaceMd}px`,
          fontSize: '22px',
          lineHeight: '28px',
          fontWeight: 600,
          color: COLOUR.foreground,
        }}
      >
        {copy.heading}
      </h1>

      <p
        style={{
          margin: `0 0 ${SIZE.spaceLg}px`,
          fontSize: '16px',
          lineHeight: '24px',
          color: COLOUR.foreground,
        }}
      >
        {copy.intro}
      </p>

      {/*
        A table, not a styled <div>. Outlook drops `background-color` and `border` from
        block elements often enough that the code -- the one thing the email exists to
        deliver -- would render as bare digits on white. A single-cell table is the shape
        that is honoured everywhere.
      */}
      <table
        role="presentation"
        width="100%"
        cellPadding={0}
        cellSpacing={0}
        border={0}
        style={{ borderCollapse: 'collapse', margin: `0 0 ${SIZE.spaceLg}px` }}
      >
        <tbody>
          <tr>
            <td
              align="center"
              style={{
                padding: `${SIZE.spaceLg}px ${SIZE.spaceMd}px`,
                backgroundColor: COLOUR.muted,
                border: `1px solid ${COLOUR.border}`,
                borderRadius: `${SIZE.radius}px`,
              }}
            >
              <span
                className="gn-code"
                style={{
                  fontFamily: FONT.mono,
                  fontSize: '34px',
                  lineHeight: '40px',
                  fontWeight: 600,
                  // Wide tracking makes six digits readable at a glance. `letter-spacing`
                  // also applies AFTER the final character, which pushes the run visually
                  // left of centre; `text-indent` of the same size cancels exactly that.
                  letterSpacing: '8px',
                  textIndent: '8px',
                  color: COLOUR.foreground,
                }}
              >
                {code}
              </span>
            </td>
          </tr>
        </tbody>
      </table>

      <p
        style={{
          margin: `0 0 ${SIZE.spaceSm}px`,
          fontSize: '14px',
          lineHeight: '20px',
          color: COLOUR.mutedForeground,
        }}
      >
        {copy.expiry}
      </p>

      <p
        style={{
          margin: 0,
          fontSize: '14px',
          lineHeight: '20px',
          color: COLOUR.mutedForeground,
        }}
      >
        {copy.ignore}
      </p>
    </Layout>
  )
}

/**
 * Sample prose, for the preview server and the render test. **Not a source of truth.**
 *
 * The real words live in `apps/web/messages/{nl,en,fr}.json`. These exist because
 * `react-email`'s dev server renders a template with no application around it, so it needs
 * props from somewhere, and because a render test wants a fixture that cannot change when
 * marketing edits a sentence.
 *
 * It is Dutch because `DEFAULT_LOCALE` is. The `satisfies` is what keeps it honest: this
 * fixture and the app's catalogue are checked against the same type, so a key added to
 * `SignInCodeCopy` breaks both at once instead of leaving the preview silently stale.
 */
export const PREVIEW_COPY = {
  subject: '123456 is je Guestnote-aanmeldcode',
  preheader: 'Je code is 5 minuten geldig.',
  heading: 'Je aanmeldcode',
  intro: 'Voer deze code in om je aan te melden bij Guestnote.',
  expiry: 'De code verloopt over 5 minuten.',
  ignore: 'Heb je dit niet aangevraagd? Dan kun je deze e-mail negeren.',
  footer: 'Guestnote · automatisch bericht. Antwoorden op dit adres komen niet aan.',
} satisfies SignInCodeCopy

/**
 * `react-email`'s preview server reads props off this property, and only finds templates
 * that export a component as `default`. Both exist for the CLI alone; everything in this
 * repo imports the named `SignInCode`.
 */
SignInCode.PreviewProps = {
  code: '123456',
  locale: 'nl',
  copy: PREVIEW_COPY,
} satisfies SignInCodeProps

export default SignInCode
