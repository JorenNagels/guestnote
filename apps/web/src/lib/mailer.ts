import 'server-only'
import { join } from 'node:path'
import { AUTH_POLICY } from '@guestnote/core/auth'
import { newId, schema } from '@guestnote/db'
import {
  createConsoleTransport,
  createMailer,
  createSesTransport,
  type DeliveryRecord,
  type MailTransport,
  type SignInCodeCopy,
} from '@guestnote/email'
import { createTranslator } from 'next-intl'
import en from '../../messages/en.json'
import fr from '../../messages/fr.json'
import nl from '../../messages/nl.json'
import { env } from '../env.ts'
import { getDb } from './db.ts'
import { DEFAULT_LOCALE, isLocale, type Locale } from './locales.ts'

/**
 * The app's single mailer.
 *
 * `packages/email` takes its configuration as arguments -- the rule `hosts.ts` states for
 * `packages/core`, which this package follows -- so this is where env, the database and the
 * message catalogues are joined to it. Everything else in the app calls `sendSignInCode()`.
 *
 * Memoised for the reason `getDb()` and `getAuth()` are: on Lambda the module scope survives
 * between invocations, so a warm container reuses one SES client, one resolved credential chain
 * and one keep-alive pool instead of rebuilding all three per sign-in. Deferred rather than
 * module-scope for the same reason too -- `next build` imports route modules while collecting
 * page data, and an eager construction would make a region and a transport choice into
 * build-time dependencies.
 */
let cached: ReturnType<typeof createMailer> | undefined

/**
 * `From`, and the one value here that is a product fact rather than an environment one.
 *
 * Deliberately NOT an environment variable. It is identical in every environment, every extra
 * env key is one more thing to forget in SSM, and getting it wrong is not a config error but a
 * deliverability one: ADR 0002 configured a custom MAIL FROM of `mail.guestnote.be` so that SPF
 * *and* DKIM align on the domain, which is what a DMARC policy will eventually need. Sending as
 * any other domain would keep delivering while silently losing that alignment.
 *
 * `noreply@` with no Reply-To is `research/05-architecture.md` section 6's v1, and it is the
 * honest option rather than the lazy one: ADR 0002 added records only under `_domainkey.` and
 * `mail.`, so the apex has no MX and a reply would bounce at the replier's own server. A
 * localpart that says replies go nowhere beats one that quietly swallows them.
 */
const FROM = '"Guestnote" <noreply@guestnote.be>'

/** Created by hand per ADR 0002. `infra/mail-events.yaml` attaches events to it by name. */
const CONFIGURATION_SET = 'guestnote-default'

/** Gitignored. Absolute, because `packages/email` cannot know where the app was started from. */
const CONSOLE_OUTPUT_DIR = join(process.cwd(), '.mail')

/**
 * Typed by the NL catalogue rather than `unknown`.
 *
 * `createTranslator` derives its valid key paths from the shape of `messages`, so widening this
 * to `Record<Locale, unknown>` made every `t('subject')` below an error about `never` -- the
 * types were right and the annotation was wrong. `typeof nl` is the reference shape, and EN and
 * FR only assign to it while they are structurally identical, which is itself a weak version of
 * what `i18n/messages.test.ts` asserts properly.
 */
const CATALOGUES: Readonly<Record<Locale, typeof nl>> = { nl, en, fr }

/**
 * Render and send the sign-in code. The one function `lib/auth.ts` calls.
 *
 * `locale` is a plain `string` rather than `Locale` on purpose: it arrives from the
 * `NEXT_LOCALE` cookie, which is attacker-controlled, and narrowing it here rather than
 * trusting the caller keeps that in one place.
 */
export async function sendSignInCode(input: { to: string; code: string; locale: string }) {
  const locale: Locale = isLocale(input.locale) ? input.locale : DEFAULT_LOCALE
  return getMailer().sendSignInCode({
    to: input.to,
    locale,
    code: input.code,
    copy: signInCodeCopy(locale, input.code),
  })
}

export function getMailer() {
  if (cached) return cached
  cached = createMailer({ transport: transportFor(), record: recordDelivery })
  return cached
}

/**
 * `ses` unless development explicitly asks for `console`.
 *
 * The shape of `secretFor()` in `lib/auth.ts`, and for the same reason: **the value you get by
 * omission has to be the safe one.** A deployed environment that never sets
 * `GUESTNOTE_MAIL_TRANSPORT` gets SES and fails loudly on credentials. Defaulting the other way
 * would write every sign-in code into a CloudWatch log group and report success, which is
 * indistinguishable from working software until a customer cannot sign in.
 *
 * The refusal below is the other half of that. The console transport writes to the filesystem,
 * which is read-only on Lambda, and prints a live credential to stdout. Neither belongs anywhere
 * but a developer's own machine, so asking for it elsewhere is an error and not a preference.
 */
function transportFor(): MailTransport {
  const isDevelopment = process.env.NODE_ENV === 'development'
  const choice = env.mailTransport ?? (isDevelopment ? 'console' : 'ses')

  if (choice === 'console') {
    if (!isDevelopment) {
      throw new Error(
        'GUESTNOTE_MAIL_TRANSPORT=console is development-only: it writes rendered mail to disk ' +
          'and prints sign-in codes to stdout. Unset it so this environment uses SES, or fix ' +
          'the deploy that set it. See apps/web/src/lib/mailer.ts.',
      )
    }
    return createConsoleTransport({ outputDir: CONSOLE_OUTPUT_DIR })
  }

  return createSesTransport({
    region: env.awsRegion,
    from: FROM,
    configurationSet: CONFIGURATION_SET,
  })
}

/**
 * Every attempt, into `mail_deliveries`.
 *
 * Through `getDb()` rather than `withTenant()` because the table is unscoped, and deliberately:
 * a sign-in code is requested by someone who is not signed in, so there is no tenant to scope
 * to. `packages/db/src/schema/mail.ts` carries the reasoning and `UNSCOPED_TABLES` is where the
 * classification test enforces it.
 *
 * `packages/email` swallows a throw from here, which is the right trade -- a planner locked out
 * because a diagnostic insert timed out is worse than a missing row -- but it does mean this
 * cannot be the *only* record of a send. It is not: SES publishes its own events to the SNS
 * topic independently of anything the application manages to write.
 */
async function recordDelivery(entry: DeliveryRecord): Promise<void> {
  await getDb()
    .insert(schema.mailDeliveries)
    .values({
      id: newId(),
      toEmail: entry.toEmail,
      template: entry.template,
      locale: entry.locale,
      providerMessageId: entry.providerMessageId,
      status: entry.status,
      error: entry.error,
      // Only on success, and it means "SES accepted this" and nothing more -- see the column
      // comment. A row with `sent_at` set is not a row that was delivered.
      sentAt: entry.status === 'sent' ? new Date() : null,
    })
}

/**
 * The sign-in email's words, in the recipient's language, fully interpolated.
 *
 * ## Why `createTranslator` and not `getTranslations`
 *
 * next-intl's request-scoped helpers resolve the locale of the *request*. This needs the locale
 * of the *recipient*, which is not the same thing -- and at M3 it becomes a column on `users`,
 * at which point a planner who reads Dutch can be sent mail while an English request is in
 * flight. `createTranslator` takes an arbitrary locale, which is precisely why it exists, and
 * works outside a request context, so a Route Handler or a future queue consumer calls exactly
 * this function.
 *
 * This is the pipeline `apps/web/src/i18n/request.ts` said was coming when it declined to
 * migrate to `next/root-params` on the grounds that root params "cannot be used in Client
 * Components, Server Actions, or Route Handlers".
 *
 * ## Static imports, unlike request.ts
 *
 * `request.ts` loads one catalogue per request with a dynamic `import()`. All three are static
 * here because there is no request to key off: the choice is per recipient, and three JSON files
 * are a rounding error next to the SES client already in the bundle.
 *
 * ## Two different checks, on two different failures
 *
 * The return type is `packages/email`'s `SignInCodeCopy`, so a key missing from the *type* is a
 * compile error on this very object. A key missing from one of the three JSON *files* is not --
 * `createTranslator` returns the key path and the email ships with `email.signInCode.expiry`
 * where a sentence should be. That is what `i18n/messages.test.ts` exists for.
 */
function signInCodeCopy(locale: Locale, code: string): SignInCodeCopy {
  const t = createTranslator({
    locale,
    messages: CATALOGUES[locale],
    namespace: 'email.signInCode',
  })

  /**
   * Whole minutes, from the same constant the code's actual lifetime comes from.
   *
   * `AUTH_POLICY.codeTtlSeconds` is documented as NOT RATIFIED and the brief proposes raising
   * it to 600. Deriving the number means the email cannot end up claiming five minutes while
   * the verification row expires in ten -- and the catalogues use an ICU `plural`, so a change
   * to 60 reads "1 minuut" rather than "1 minuten".
   */
  const minutes = Math.round(AUTH_POLICY.codeTtlSeconds / 60)

  return {
    subject: t('subject', { code }),
    preheader: t('preheader', { minutes }),
    heading: t('heading'),
    intro: t('intro'),
    expiry: t('expiry', { minutes }),
    ignore: t('ignore'),
    footer: t('footer'),
  }
}
