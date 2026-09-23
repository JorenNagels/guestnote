import 'server-only'
import type { SendResult, StaffInviteCopy } from '@guestnote/email'
import { createTranslator } from 'next-intl'
import en from '../../messages/en.json'
import fr from '../../messages/fr.json'
import nl from '../../messages/nl.json'
import { appInviteUrl } from './app-url.ts'
import { INVITE_TTL_DAYS } from './invite-token.ts'
import { DEFAULT_LOCALE, isLocale, type Locale } from './locales.ts'
import { getMailer } from './mailer.ts'

/**
 * Renders and sends the staff invitation.
 *
 * Its own file rather than a second function in `lib/mailer.ts` so slice S6 does not edit a
 * file every other slice imports; it reuses `getMailer()`, so it sends through the same
 * transport and writes to the same `mail_deliveries`.
 *
 * ## Copy is in the base catalogues, not `messages/app/team.*`
 *
 * `i18n/catalogue.ts` says mail copy stays under `email.*` in the three base files, because
 * this reads them without a request. `email.staffInvite` is there.
 *
 * ## Whose language
 *
 * The inviter's current one (`locale`, from the `NEXT_LOCALE` cookie). The invitee has no
 * account yet, so no preference of theirs exists. Narrowed here for the reason
 * `sendSignInCode` narrows: the cookie is attacker-controlled.
 */
const CATALOGUES: Readonly<Record<Locale, typeof nl>> = { nl, en, fr }

export type StaffInviteMail = {
  readonly to: string
  readonly token: string
  readonly locale: string
  readonly inviter: string
  readonly org: string
  readonly role: 'admin' | 'member'
}

export async function sendStaffInviteMail(input: StaffInviteMail): Promise<SendResult> {
  const locale: Locale = isLocale(input.locale) ? input.locale : DEFAULT_LOCALE
  const t = createTranslator({
    locale,
    messages: CATALOGUES[locale],
    namespace: 'email.staffInvite',
  })
  const values = {
    inviter: input.inviter,
    org: input.org,
    role: input.role === 'admin' ? t('roleAdmin') : t('roleMember'),
    days: INVITE_TTL_DAYS,
  }
  const copy: StaffInviteCopy = {
    subject: t('subject', values),
    preheader: t('preheader'),
    heading: t('heading'),
    intro: t('intro', values),
    cta: t('cta'),
    linkFallback: t('linkFallback'),
    expiry: t('expiry', values),
    ignore: t('ignore', values),
    footer: t('footer'),
  }
  return getMailer().sendStaffInvite({
    to: input.to,
    locale,
    url: appInviteUrl(input.token),
    copy,
  })
}
