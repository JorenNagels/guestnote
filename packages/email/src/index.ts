import { createElement } from 'react'
import { renderEmail } from './render.ts'
import { SignInCode, type SignInCodeCopy } from './templates/sign-in-code.tsx'
import type { DeliveryRecord, EmailMessage, MailTransport, SendResult } from './types.ts'

export { type ConsoleTransportConfig, createConsoleTransport } from './console.ts'
// `SesTransportConfig` is deliberately NOT re-exported: its optional `client` field names
// `SendEmailCommand`, and re-exporting the type here would put an AWS type on the seam that
// src/ses.ts exists to keep off it.
export { createSesTransport } from './ses.ts'
export type { SignInCodeCopy } from './templates/sign-in-code.tsx'
export type {
  DeliveryRecord,
  EmailMessage,
  MailFailure,
  MailTransport,
  SendResult,
} from './types.ts'

/**
 * The mail seam. **The only mail surface the rest of the codebase may import.**
 *
 * One method per template, rather than a general `send(html)`. That is deliberate: it keeps
 * subject lines, message tags and the plaintext part in one place per email instead of at
 * every call site, and it means adding the assignment mail at P10 is a method here rather than
 * a second set of conventions somewhere else.
 *
 * `research/05-architecture.md` section 6 is the design this implements -- react-email
 * templates rendered to HTML and handed to SES v2 `SendEmail`. See `src/layout.tsx` for why
 * the components are hand-written while the renderer is not.
 *
 * ## Configuration is passed in
 *
 * The rule `hosts.ts` states for `packages/core`, and the reason this package has no
 * `process.env` and no `@guestnote/db` import. `apps/web/src/lib/mailer.ts` composes it once
 * and memoises the result.
 */

export type MailerConfig = {
  readonly transport: MailTransport
  /**
   * Called once per attempt, successful or not, before the result is returned.
   *
   * This is how a send reaches `mail_deliveries` without this package depending on the
   * database -- the same shape as `AuthConfig.db` in `packages/core/auth`.
   *
   * **A failure here is swallowed.** Logging is not worth failing a sign-in over: a planner
   * who cannot get into the dashboard because an audit insert timed out is a worse outcome
   * than a missing row, and the row is diagnostic rather than authoritative. The swallow is
   * logged so it does not become invisible.
   */
  readonly record?: (entry: DeliveryRecord) => Promise<void>
}

export type SignInCodeInput = {
  readonly to: string
  /** BCP 47. Chooses nothing here -- `copy` is already resolved -- but sets `<html lang>`. */
  readonly locale: string
  readonly code: string
  readonly copy: SignInCodeCopy
}

export function createMailer(config: MailerConfig) {
  return {
    async sendSignInCode(input: SignInCodeInput): Promise<SendResult> {
      /**
       * `createElement` rather than JSX because this file is `.ts`.
       *
       * Making it `.tsx` would move it into the `component` vitest project (the extension is
       * the selector -- see vitest.config.ts), and a seam that renders a string has no
       * business in jsdom.
       */
      const element = createElement(SignInCode, {
        code: input.code,
        locale: input.locale,
        copy: input.copy,
      })

      const rendered = await renderEmail(element)

      const message: EmailMessage = {
        to: input.to,
        /**
         * The subject leads with the code.
         *
         * `research/07-auth-and-tenancy.md`'s 2026-08-18 note chose a code over a link partly
         * because "iOS 17+ autofills it from Mail above the keyboard" -- and that suggestion
         * is built from the subject and preview text, not from the body. Putting the digits
         * first also means a lock-screen notification is enough, so the planner never opens
         * the mail at all. The catalogue owns the wording; this just passes it through.
         */
        subject: input.copy.subject,
        html: rendered.html,
        text: rendered.text,
        // Becomes a dimension on `guestnote-default`'s metrics and travels with every SNS
        // event, so "which template bounced" is answerable without a join. SES allows only
        // [A-Za-z0-9_-] in tag names and values.
        tags: { template: TEMPLATE_SIGN_IN_CODE },
      }

      const result = await config.transport.send(message)
      await record(config, {
        toEmail: input.to,
        template: TEMPLATE_SIGN_IN_CODE,
        locale: input.locale,
        providerMessageId: result.ok ? result.messageId : null,
        status: result.ok ? 'sent' : 'failed',
        error: result.ok ? null : result.detail,
      })
      return result
    },
  }
}

export type Mailer = ReturnType<typeof createMailer>

/** Also the `mail_deliveries.template` value, so the column and the tag cannot disagree. */
const TEMPLATE_SIGN_IN_CODE = 'sign-in-code'

async function record(config: MailerConfig, entry: DeliveryRecord): Promise<void> {
  if (config.record === undefined) return
  try {
    await config.record(entry)
  } catch (error) {
    console.error(
      `  [guestnote] could not record a ${entry.template} delivery to ${entry.toEmail}: ` +
        String(error),
    )
  }
}
