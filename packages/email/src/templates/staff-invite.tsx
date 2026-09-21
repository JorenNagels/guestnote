import { Layout } from '../layout.tsx'
import { COLOUR, SIZE } from '../theme.ts'

/**
 * Finished strings, same rule as `SignInCodeCopy`: the app resolves the catalogue and ICU
 * placeholders, this template only lays them out.
 */
export type StaffInviteCopy = {
  readonly subject: string
  readonly preheader: string
  readonly heading: string
  /** Already names the inviter, the organisation and the role. */
  readonly intro: string
  readonly cta: string
  /** Sits above the raw URL, for clients that strip the button. */
  readonly linkFallback: string
  /** Already carries the number of days. */
  readonly expiry: string
  readonly ignore: string
  readonly footer: string
}

export type StaffInviteProps = {
  /** The whole credential. Absolute, on the app host. */
  readonly url: string
  readonly locale: string
  readonly copy: StaffInviteCopy
}

/**
 * The email that tells a colleague they have been added to a planner's team.
 *
 * ## It has a link, and the sign-in email deliberately does not
 *
 * `SignInCode` carries no link because a mail scanner that prefetches URLs spends a
 * single-use sign-in token before the person sees it. This link is different in the one way
 * that matters: opening it consumes nothing. `/invite/<token>` only RESOLVES the invitation
 * and shows a sign-in form; the invitation is accepted after the invitee has signed in with
 * a code, which a scanner cannot do. A prefetch is therefore harmless, and the alternative
 * (a code the invitee types, with no link) would leave them to guess where to type it.
 *
 * The URL is printed in full under the button as well: a button is a styled `<a>` and some
 * clients strip the styling, and a long token is easier to copy from text than from a link.
 */
export function StaffInvite({ url, locale, copy }: StaffInviteProps) {
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
        A bulletproof button: the colour sits on the <td>, because Outlook drops the
        background from an <a>, and the link inside fills the cell.
      */}
      <table
        role="presentation"
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
                backgroundColor: COLOUR.primary,
                borderRadius: `${SIZE.radius}px`,
              }}
            >
              <a
                href={url}
                style={{
                  display: 'inline-block',
                  padding: `12px ${SIZE.spaceLg}px`,
                  fontSize: '16px',
                  lineHeight: '24px',
                  fontWeight: 600,
                  color: '#FFFFFF',
                  textDecoration: 'none',
                }}
              >
                {copy.cta}
              </a>
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
        {copy.linkFallback}
      </p>
      <p
        style={{
          margin: `0 0 ${SIZE.spaceLg}px`,
          fontSize: '13px',
          lineHeight: '20px',
          color: COLOUR.mutedForeground,
          wordBreak: 'break-all',
        }}
      >
        {url}
      </p>

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

/** Fixture for the preview server and the render test. The real words are in the app. */
export const PREVIEW_INVITE_COPY = {
  subject: 'Ilse nodigde je uit voor Studio Wit op Guestnote',
  preheader: 'Maak je account aan om samen bruiloften te plannen.',
  heading: 'Je bent uitgenodigd',
  intro:
    'Ilse Verhoeven nodigde je uit om als beheerder deel te nemen aan Studio Wit op Guestnote.',
  cta: 'Uitnodiging bekijken',
  linkFallback: 'Werkt de knop niet? Kopieer dan deze link in je browser:',
  expiry: 'De uitnodiging is 7 dagen geldig.',
  ignore: 'Ken je Ilse niet, of verwachtte je dit niet? Dan kun je deze e-mail negeren.',
  footer: 'Guestnote · automatisch bericht. Antwoorden op dit adres komen niet aan.',
} satisfies StaffInviteCopy

StaffInvite.PreviewProps = {
  url: 'https://app.guestnote.be/invite/preview-token',
  locale: 'nl',
  copy: PREVIEW_INVITE_COPY,
} satisfies StaffInviteProps

export default StaffInvite
