import 'server-only'
import type { SendResult, TrialReminderCopy } from '@guestnote/email'
import { createTranslator } from 'next-intl'
import en from '../../messages/en.json'
import fr from '../../messages/fr.json'
import nl from '../../messages/nl.json'
import { appBillingUrl } from './app-url.ts'
import { formatCivilDate } from './civil-date.ts'
import { DEFAULT_LOCALE, type Locale } from './locales.ts'
import { getMailer } from './mailer.ts'

/**
 * Renders and sends the trial reminder (spec 0005, "Trial"). The shape of `invite-mail.ts`: copy
 * from the base catalogues' `email.*`, read without a request, through the shared mailer so the
 * send lands in `mail_deliveries` -- which is also what the cron deduplicates on.
 *
 * ## Whose language
 *
 * Dutch, the default. The cron has no request and the owner has no stored language
 * (`lib/prefs.ts` records why the `users` column did not happen), so there is nothing better to
 * go on. Taking a `locale` anyway so that, when there is, only the caller changes.
 */
const CATALOGUES: Readonly<Record<Locale, typeof nl>> = { nl, en, fr }

export type TrialReminderMail = {
  readonly to: string
  readonly studio: string
  /** The trial's last day, `YYYY-MM-DD`. */
  readonly endsOn: string
  readonly locale?: Locale
}

export async function sendTrialReminderMail(input: TrialReminderMail): Promise<SendResult> {
  const locale = input.locale ?? DEFAULT_LOCALE
  const t = createTranslator({
    locale,
    messages: CATALOGUES[locale],
    namespace: 'email.trialReminder',
  })
  const values = { studio: input.studio, date: formatCivilDate(locale, input.endsOn) }
  const copy: TrialReminderCopy = {
    subject: t('subject', values),
    preheader: t('preheader'),
    heading: t('heading'),
    intro: t('intro', values),
    cta: t('cta'),
    linkFallback: t('linkFallback'),
    after: t('after'),
    footer: t('footer'),
  }
  return getMailer().sendTrialReminder({ to: input.to, locale, url: appBillingUrl(), copy })
}
