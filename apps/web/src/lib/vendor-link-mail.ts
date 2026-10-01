import 'server-only'
import type { SendResult, StaffInviteCopy } from '@guestnote/email'
import { createTranslator } from 'next-intl'
import en from '../../messages/en.json'
import fr from '../../messages/fr.json'
import nl from '../../messages/nl.json'
import { appVendorLinkUrl } from './app-url.ts'
import { formatCivilDate } from './civil-date.ts'
import { DEFAULT_LOCALE, isLocale, type Locale } from './locales.ts'
import { getMailer } from './mailer.ts'

/**
 * Renders and sends a vendor's signed link (spec 0009 A4). The shape of `invite-mail.ts`: copy
 * from the base catalogues' `email.*`, read without a request, through the shared mailer so the
 * send lands in `mail_deliveries` like every other.
 *
 * ## Whose language
 *
 * The WEDDING's (`locale_default`), as the couple invitation does (spec 0008), not the planner's
 * cookie: a French-speaking caterer on a French wedding should not get Dutch because the planner
 * reads Dutch. Narrowed anyway, so a value the column one day allows and the catalogues do not
 * know falls back to Dutch instead of throwing in `createTranslator`.
 *
 * ## In the studio's name
 *
 * Subject, body and footer name the studio; the `From` stays `Guestnote <noreply@...>`, for the
 * DMARC reason `lib/mailer.ts` gives at `FROM`. Same as the couple invitation, no logo.
 */
const CATALOGUES: Readonly<Record<Locale, typeof nl>> = { nl, en, fr }

export type VendorLinkMail = {
  readonly to: string
  /** The plain token. Becomes the URL and nothing else; never logged, never recorded. */
  readonly token: string
  /** The wedding's `locale_default`. */
  readonly locale: string
  readonly studio: string
  readonly couple: string
  /** ISO timestamp; the mail names its UTC day, as the sheet's "Expires" line does. */
  readonly expiresAt: string
}

export async function sendVendorLinkMail(input: VendorLinkMail): Promise<SendResult> {
  const locale: Locale = isLocale(input.locale) ? input.locale : DEFAULT_LOCALE
  const t = createTranslator({
    locale,
    messages: CATALOGUES[locale],
    namespace: 'email.vendorLink',
  })
  const values = {
    studio: input.studio,
    couple: input.couple,
    date: formatCivilDate(locale, input.expiresAt.slice(0, 10)),
  }
  const copy: StaffInviteCopy = {
    subject: t('subject', values),
    preheader: t('preheader'),
    heading: t('heading', values),
    intro: t('intro', values),
    cta: t('cta'),
    linkFallback: t('linkFallback'),
    expiry: t('expiry', values),
    // The template's closing line. For an invitation it says "ignore this if unexpected"; for a
    // link that opens without a sign-in it says "do not forward this", which is the one thing a
    // vendor can do wrong with it.
    ignore: t('ignore'),
    footer: t('footer', values),
  }
  return getMailer().sendVendorLink({
    to: input.to,
    locale,
    url: appVendorLinkUrl(input.token),
    copy,
  })
}
