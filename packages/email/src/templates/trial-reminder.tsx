import { Layout } from '../layout.tsx'
import { COLOUR, SIZE } from '../theme.ts'

/**
 * Finished strings, same rule as `SignInCodeCopy`: the app resolves the catalogue and ICU
 * placeholders, this template only lays them out.
 */
export type TrialReminderCopy = {
  readonly subject: string
  readonly preheader: string
  readonly heading: string
  /** Already names the studio and the trial's last day. */
  readonly intro: string
  readonly cta: string
  /** Sits above the raw URL, for clients that strip the button. */
  readonly linkFallback: string
  /** What happens if they do nothing: read-only, nothing deleted. */
  readonly after: string
  readonly footer: string
}

export type TrialReminderProps = {
  /** The Billing page, absolute, on the app host. Not a credential: it asks for a sign-in. */
  readonly url: string
  readonly locale: string
  readonly copy: TrialReminderCopy
}

/**
 * Three days before a studio's trial ends, to its owner (spec 0005, "Trial"): the date, what
 * happens after it, and a button to Billing. Sent once per trial by the daily cron
 * (`app/api/cron/trial-reminders`), never while billing is off.
 *
 * Built from `StaffInvite`'s markup (invariant 11: hand-written components, `@react-email/render`
 * only). The link is safe to prefetch for the reason the invitation's is: it opens a page that
 * asks for a sign-in, and spends nothing.
 */
export function TrialReminder({ url, locale, copy }: TrialReminderProps) {
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
          margin: 0,
          fontSize: '14px',
          lineHeight: '20px',
          color: COLOUR.mutedForeground,
        }}
      >
        {copy.after}
      </p>
    </Layout>
  )
}

/** Fixture for the preview server and the render test. The real words are in the app. */
export const PREVIEW_TRIAL_REMINDER_COPY = {
  subject: 'Je proefperiode voor Studio Wit eindigt op 14 juni 2027',
  preheader: 'Kies een abonnement om alles open te houden.',
  heading: 'Nog drie dagen',
  intro: 'De proefperiode van Studio Wit loopt tot en met 14 juni 2027.',
  cta: 'Kies een abonnement',
  linkFallback: 'Werkt de knop niet? Kopieer dan deze link in je browser:',
  after:
    'Kies je niets, dan worden je bruiloften alleen-lezen. Er wordt niets verwijderd, en een abonnement maakt alles meteen weer open.',
  footer: 'Guestnote · automatisch bericht. Antwoorden op dit adres komen niet aan.',
} satisfies TrialReminderCopy

TrialReminder.PreviewProps = {
  url: 'https://app.guestnote.be/billing',
  locale: 'nl',
  copy: PREVIEW_TRIAL_REMINDER_COPY,
} satisfies TrialReminderProps

export default TrialReminder
