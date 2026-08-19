/**
 * The shapes that cross the mail seam.
 *
 * Same rule as `packages/core/src/auth/types.ts`: nothing here names a provider. No
 * `SendEmailCommand`, no `SESv2Client`, no AWS error class. `src/ses.ts` is the only file in
 * the repository allowed to import the SDK -- enforced by `biome.json` and by
 * `packages/db/src/no-unsafe-imports.test.ts` -- and that containment is only worth anything
 * while the types stay on this side of it.
 *
 * `research/05-architecture.md` section 6 picked SES over Resend on price and EU residency,
 * both of which are true today and neither of which is permanent. Swapping is a new file in
 * this package and nothing else.
 */

/**
 * Why a send did not happen, in terms a caller can act on.
 *
 * Three cases rather than a boolean because they want different responses, and rather than an
 * error class because a thrown AWS error would drag the SDK's types across the seam.
 *
 * ## There is deliberately no `'suppressed'` case
 *
 * The obvious fourth member would be "this address is on the account suppression list". It is
 * absent because that is not a send-time failure. AWS documents the `SEND` event as
 * *"The send request was successful and SES will attempt to deliver the message to the
 * recipient's mail server. (If account-level or global suppression is being used, SES will
 * still count it as a send, but delivery is suppressed.)"* -- so `SendEmail` returns a
 * MessageId and the mail silently goes nowhere.
 *
 * That matters twice over. It means a `SendResult.ok` is a statement about the API call and
 * not about delivery, so `mail_deliveries.status = 'sent'` must be read that way. And it is
 * the concrete reason the SNS event destination in `infra/mail-events.yaml` is worth having:
 * a suppressed sign-in code is invisible from inside the application, and the event stream is
 * the only place it shows up.
 *
 * Suppression is on by default for accounts created after November 2019, which includes this
 * one, so this is live behaviour rather than a hypothetical.
 */
export type MailFailure =
  /** Over the send rate or the daily quota. In the sandbox that is 1/second and 200/day. */
  | 'throttled'
  /**
   * SES refused the message outright. In the sandbox the overwhelming cause is a recipient
   * who is not a verified identity, which is the first thing to check when a code does not
   * arrive. Retrying does not help.
   */
  | 'rejected'
  /** Credentials, network, region, or anything genuinely unexpected. */
  | 'unavailable'

export type SendResult =
  | { readonly ok: true; readonly messageId: string }
  | { readonly ok: false; readonly failure: MailFailure; readonly detail: string }

export type EmailMessage = {
  readonly to: string
  readonly subject: string
  readonly html: string
  readonly text: string
  /**
   * SES message tags. They become dimensions on the configuration set's metrics and travel
   * with every event the SNS destination publishes, which is what makes "which template
   * bounced" answerable later without a join.
   *
   * SES constrains both names and values to `[A-Za-z0-9_-]`, so no prose and no colons.
   */
  readonly tags?: Readonly<Record<string, string>>
}

/** A transport is anything that can put a rendered message somewhere. */
export type MailTransport = {
  /** Named so a log line and a `mail_deliveries` row can say which one ran. */
  readonly name: 'ses' | 'console'
  send(message: EmailMessage): Promise<SendResult>
}

/**
 * One attempt, as the database wants it.
 *
 * Passed out through a callback rather than written here, because this package must not
 * depend on `@guestnote/db` -- the same reason `packages/core/auth` takes a Drizzle handle as
 * an argument instead of importing one. `apps/web/src/lib/mailer.ts` supplies the writer.
 */
export type DeliveryRecord = {
  readonly toEmail: string
  readonly template: string
  readonly locale: string
  /**
   * SES's id, or null when the send never got that far. Unique per accepted message, which
   * is what the future event consumer joins bounce and complaint notifications back on.
   */
  readonly providerMessageId: string | null
  readonly status: 'sent' | 'failed'
  /** The `detail` from a `SendResult` failure, for the row. Null on success. */
  readonly error: string | null
}
