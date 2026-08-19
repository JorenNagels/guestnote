import {
  AccountSuspendedException,
  BadRequestException,
  LimitExceededException,
  MailFromDomainNotVerifiedException,
  MessageRejected,
  SESv2Client,
  SendEmailCommand,
  SendingPausedException,
  TooManyRequestsException,
} from '@aws-sdk/client-sesv2'
import type { EmailMessage, MailFailure, MailTransport, SendResult } from './types.ts'

/**
 * **The only file in this repository allowed to import the AWS SES SDK.**
 *
 * `biome.json` restricts `@aws-sdk/client-sesv2` to this path, and
 * `packages/db/src/no-unsafe-imports.test.ts` enforces the same rule independently -- a lint
 * rule can be silenced with an inline comment, a test cannot. Exactly the arrangement
 * `packages/core/src/auth/better-auth.ts` has, for the same reason: `research/05-architecture.md`
 * section 6 chose SES on price and EU residency, and if either changes, the swap should be one
 * new file rather than a search across the codebase.
 *
 * Everything below returns `SendResult`, which names no AWS type.
 *
 * ## Configuration is arguments, never `process.env`
 *
 * The rule `hosts.ts` states for `packages/core`. `apps/web/src/lib/mailer.ts` is the single
 * composition point; a module-level env read here would make the package unusable from a
 * script or a test.
 */

export type SesTransportConfig = {
  /** `eu-central-1`. The identity, the configuration set and the app all live there. */
  readonly region: string
  /**
   * The envelope sender, formatted. `"Guestnote" <noreply@guestnote.be>`.
   *
   * SES verifies the domain, not the address, so any localpart under `guestnote.be` works
   * without further setup -- but SPF and DKIM only align because ADR 0002 configured a custom
   * MAIL FROM of `mail.guestnote.be`. Sending from a different domain would silently lose
   * DMARC alignment while continuing to deliver, which is the worst kind of regression.
   */
  readonly from: string
  /**
   * `guestnote-default`. Created by hand per ADR 0002; `infra/mail-events.yaml` attaches the
   * event destination to it by name without owning it.
   *
   * Naming it on every send is what makes bounces and complaints observable at all. Omit it
   * and the message still delivers, with no events and no reputation metrics -- a failure that
   * looks exactly like success.
   */
  readonly configurationSet: string
  /**
   * Injected by `ses.test.ts`. Dependency injection rather than `vi.mock`, because this repo
   * has no module mocking anywhere and a fake that must satisfy a real call shape is a fake
   * that breaks when the call shape changes.
   */
  readonly client?: SesSendPort
}

/**
 * The one method this transport calls, and the only reason an AWS type appears in a config
 * object at all.
 *
 * Narrowed to a structural port rather than `Pick<SESv2Client, 'send'>` so the fake in the
 * test does not have to satisfy the client's overload set. `SESv2Client` satisfies it; that
 * assignability is what `__porttest` confirmed before this was written.
 *
 * `index.ts` re-exports `createSesTransport` but NOT `SesTransportConfig`, so `SendEmailCommand`
 * stays reachable only from inside this file and its test.
 */
export type SesSendPort = {
  send(command: SendEmailCommand): Promise<{ readonly MessageId?: string | undefined }>
}

export function createSesTransport(config: SesTransportConfig): MailTransport {
  /**
   * Built once per module instance, and `lib/mailer.ts` memoises that instance for the same
   * reason `getDb()` does: on Lambda the module scope survives between invocations, so a warm
   * container reuses one client -- and with it one resolved credential chain and one keep-alive
   * connection pool -- instead of paying for both on every sign-in.
   *
   * The SDK's default retry mode is `standard`: three attempts with backoff on the errors its
   * own model marks retryable, which includes `TooManyRequestsException`. That matters in the
   * sandbox, where the rate limit is one message per second, so two people signing in at once
   * is enough to hit it. No retry logic here -- the SDK's is better than a hand-rolled one.
   */
  const client: SesSendPort = config.client ?? new SESv2Client({ region: config.region })

  return {
    name: 'ses',

    async send(message: EmailMessage): Promise<SendResult> {
      const command = new SendEmailCommand({
        FromEmailAddress: config.from,
        Destination: { ToAddresses: [message.to] },
        ConfigurationSetName: config.configurationSet,
        // NOT set: ReplyToAddresses. The apex has carried MX since 2026-08-19 (ADR 0005), so a
        // reply would now land in `info@guestnote.be` rather than bounce -- the original reason
        // for this absence is gone, the absence is not. A sign-in code is a machine message, and
        // an auth mail advertising a reply channel nobody watches in real time is worse than one
        // that says plainly it is unattended.
        //
        // NOT set: ListManagementOptions. That adds an unsubscribe link and a contact list,
        // which is right for the weekly digest and wrong for a sign-in code -- this is
        // transactional, and there is nothing to unsubscribe from.
        Content: {
          Simple: {
            // `Charset` on all three parts. SES defaults to 7-bit ASCII, which mangles the
            // first Dutch or French sentence carrying a diacritic -- "Voer je code in",
            // "vérifiez" -- into mojibake that still delivers.
            Subject: { Data: message.subject, Charset: 'UTF-8' },
            Body: {
              Html: { Data: message.html, Charset: 'UTF-8' },
              Text: { Data: message.text, Charset: 'UTF-8' },
            },
          },
        },
        ...(message.tags
          ? { EmailTags: Object.entries(message.tags).map(([Name, Value]) => ({ Name, Value })) }
          : {}),
      })

      try {
        const response = await client.send(command)
        // The field is optional in the SDK's types because the API models it that way. An
        // accepted send always has one, so an absent id means something is wrong enough to
        // say so rather than to record an empty string.
        return response.MessageId === undefined
          ? {
              ok: false,
              failure: 'unavailable',
              detail: 'SES accepted the send but returned no MessageId',
            }
          : { ok: true, messageId: response.MessageId }
      } catch (error) {
        return { ok: false, failure: classify(error), detail: describe(error) }
      }
    },
  }
}

/**
 * AWS's errors in this codebase's three words.
 *
 * `instanceof` against the SDK's own exception classes rather than string-matching a
 * `message`, because the classes are part of the published contract and the prose is not.
 * They are imported here and nowhere else, which is the point of the file.
 */
function classify(error: unknown): MailFailure {
  // Over the rate limit or the 24-hour quota. Both are transient; the SDK has already
  // retried a throttle three times by the time this is reached.
  if (error instanceof TooManyRequestsException) return 'throttled'
  if (error instanceof LimitExceededException) return 'throttled'

  // Refused, and retrying will not change it. `MessageRejected` is the sandbox's answer to an
  // unverified recipient, which is by far the most likely cause of "the code never arrived"
  // before production access lands.
  if (error instanceof MessageRejected) return 'rejected'
  if (error instanceof BadRequestException) return 'rejected'
  if (error instanceof MailFromDomainNotVerifiedException) return 'rejected'

  // Sending is off account-wide -- a suspension, or SES pausing us over a bounce rate. Not
  // 'rejected': nothing about this message is wrong, and the operator response is completely
  // different. It is the one failure here that should page someone.
  if (error instanceof AccountSuspendedException) return 'unavailable'
  if (error instanceof SendingPausedException) return 'unavailable'

  return 'unavailable'
}

/** A one-line description safe to put in a log and a database column. */
function describe(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`
  return String(error)
}
