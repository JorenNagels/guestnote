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
 * *and* DKIM align on the domain. Since 2026-08-19 that is load-bearing rather than groundwork
 * -- `_dmarc.guestnote.be` is published at `p=none; aspf=r` (ADR 0005), so sending as any other
 * domain fails DMARC now, invisibly while the policy is `none` and fatally once it is not.
 *
 * The `noreply@` localpart is `research/05-architecture.md` section 6's v1. The absent Reply-To
 * is NOT -- section 6's v1 pairs that localpart *with* a Reply-To to the planner, and will again
 * when white-label lands. Auth mail is the deliberate exception. It was once justified by the
 * apex carrying no MX at all; since 2026-08-19 it carries three pointed at Zoho and
 * `info@guestnote.be` receives. The exception survives that on its own terms: a sign-in code is
 * a machine message, and a localpart that says replies go nowhere beats one that quietly
 * swallows them into a mailbox read once a day.
 */
const FROM = '"Guestnote" <noreply@guestnote.be>'

/** Created by hand per ADR 0002. `infra/mail-events.yaml` attaches events to it by name. */
const CONFIGURATION_SET = 'guestnote-default'

/** Gitignored. Absolute, because `packages/email` cannot know where the app was started from. */
const CONSOLE_OUTPUT_DIR = join(process.cwd(), '.mail')

/**
 * What the console transport prints under the file path, and the answer to "why did no email
 * arrive". It lives here because it names an environment variable, and `packages/email` reads
 * none -- see `ConsoleTransportConfig.hint`.
 *
 * The sandbox clause is the part worth carrying: flipping the transport is necessary but not
 * sufficient. Production access is still deliberately deferred (ADR 0002), so SES accepts a
 * destination only if it is a verified identity or under the verified domain, and anything
 * else comes back `MessageRejected` -- which `packages/email/src/ses.ts` maps to `rejected`
 * and the sign-in surface shows as "we could not deliver". Without this clause the obvious
 * next move after reading the hint is to set `ses` and be confused a second time.
 */
const CONSOLE_HINT =
  'set GUESTNOTE_MAIL_TRANSPORT=ses in .env.local (SES is still in sandbox: the ' +
  'recipient must be a verified identity or under guestnote.be, 200/day, 1/sec)'

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
    return createConsoleTransport({ outputDir: CONSOLE_OUTPUT_DIR, hint: CONSOLE_HINT })
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
