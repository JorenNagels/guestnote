import {
  bigint,
  check,
  index,
  integer,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { createdAt, oneOf, tstz } from './_shared.ts'

/**
 * The two tables that arrived with the mail pipeline. Neither is tenant-scoped, and both are
 * classified `UNSCOPED_TABLES` in `./index.ts` -- the reason is the same one `auth.ts` gives:
 * every row here is written *before* a principal exists. A sign-in code is requested by
 * someone who is, by definition, not signed in yet, so there is no `app.user_id` to scope by
 * and a policy would break authentication outright.
 *
 * The mitigation is structural rather than a policy: nothing outside `packages/core/auth` and
 * `apps/web/src/lib/mailer.ts` touches either table.
 */

/** `sent` means SES accepted the message. See the note on `sentAt` -- it is not delivery. */
export const MAIL_DELIVERY_STATUSES = ['sent', 'failed'] as const

/**
 * One row per send attempt.
 *
 * ## Why this is not `email_log`
 *
 * `research/05-architecture.md` section 4 designs `email_log` with `wedding_id`, `guest_id`
 * and a unique idempotency key on `(wedding_id, guest_id, template, scheduled_for)`. That
 * table belongs to the guest-facing product at P4, and `guests` does not exist yet. Taking the
 * name now would either pre-empt that design or leave two half-tables with confusingly similar
 * jobs.
 *
 * So this is the auth-mail log, deliberately narrower: no tenant keys, because a sign-in code
 * is sent to a person and not on behalf of a wedding, and no idempotency key, because every
 * request legitimately produces a new code. When `email_log` lands, this stays as it is.
 *
 * ## What it is for
 *
 * "No code arrived" is the support question this answers, and it has three different answers
 * that are otherwise indistinguishable: a `failed` row with a reason, a `sent` row (so the
 * problem is downstream, and `bounced_at` or the SNS topic will say more), or no row at all --
 * meaning the request never reached the application.
 */
export const mailDeliveries = pgTable(
  'mail_deliveries',
  {
    id: uuid('id').primaryKey(),
    toEmail: text('to_email').notNull(),
    /** Matches the SES message tag exactly; `packages/email` owns the one constant for both. */
    template: text('template').notNull(),
    locale: text('locale').notNull(),
    /**
     * SES's `MessageId`, or null when the send never got that far.
     *
     * Unique, and the reason the column exists at all: it is the only key a bounce or
     * complaint notification carries back, so it is what the event consumer will join on.
     * Nullable plus unique is exactly what is wanted here -- Postgres permits many NULLs in a
     * unique index, so failed sends coexist happily while accepted ones cannot collide.
     */
    providerMessageId: text('provider_message_id'),
    status: text('status').notNull(),
    /** The transport's own description of the failure. Null on success. */
    error: text('error'),
    /**
     * When SES accepted the message. **Not when it was delivered, and not a promise that it
     * ever will be.**
     *
     * AWS documents the `SEND` event as succeeding even for an address on the account
     * suppression list: "SES will still count it as a send, but delivery is suppressed." So a
     * row can be `sent`, carry a `provider_message_id`, and have gone nowhere. The two columns
     * below, and the SNS topic in `infra/mail-events.yaml`, are the only places that shows up.
     */
    sentAt: tstz('sent_at'),
    /**
     * Written by the SES event consumer, which **does not exist yet**.
     *
     * Deliberately not left out. The column is where the ADR 0002 bounce gate lands, naming it
     * now makes the consumer's job unambiguous, and until then the SNS email subscription puts
     * the same information in front of a human. A reader should know these are always null
     * today rather than conclude bounces are being tracked.
     */
    bouncedAt: tstz('bounced_at'),
    complainedAt: tstz('complained_at'),
    createdAt: createdAt(),
  },
  (t) => [
    check('mail_deliveries_status_check', oneOf('status', MAIL_DELIVERY_STATUSES)),
    uniqueIndex('mail_deliveries_provider_message_id_key').on(t.providerMessageId),
    // "How many codes has this address asked for tonight", which is the question a support
    // conversation and an abuse investigation both start from.
    index('mail_deliveries_to_email_created_at_idx').on(t.toEmail, t.createdAt),
  ],
)

/**
 * Better Auth's rate-limit store. **The export name is load-bearing.**
 *
 * The adapter runs with `usePlural: true`, so the `rateLimit` model resolves to the schema key
 * `rateLimits`. Renaming this export breaks the limiter at runtime with a
 * "model was not found in the schema object" error, not at compile time.
 *
 * ## Why it exists
 *
 * `packages/core/src/auth/better-auth.ts` sets `rateLimit: { storage: 'database' }`, and the
 * installed `@better-auth/core` types document the two defaults that made that necessary:
 * *"By default, rate limiting is only enabled on production"*, and `storage` defaults to
 * `"memory"`. So before this table there was **no limiter at all outside production**, and one
 * limiter per Lambda container inside it -- which is worth very little when the point is to
 * cap how many real emails one address can trigger.
 *
 * ## Shapes read off the runtime, not remembered
 *
 * Three fields, from `getAuthTables()` called on the installed better-auth@1.7.1 with this
 * project's options -- the same method `auth.ts` used, and for the same reason: the CLI lags
 * the runtime. `key` string, `count` number, `lastRequest` number.
 */
export const rateLimits = pgTable('rate_limits', {
  id: uuid('id').primaryKey(),
  /**
   * Better Auth's own composite: the client identifier and the path it hit. Unique because it
   * is looked up on every rate-limited request and written back on each one, which makes this
   * the hottest index in the auth path after `sessions.token`.
   */
  key: text('key').notNull().unique(),
  count: integer('count').notNull(),
  /**
   * Epoch milliseconds, as a `bigint`.
   *
   * `integer` would overflow: the field is a JS number holding `Date.now()`, and `int4` tops
   * out at 2.1e9 while epoch ms passed 1.7e12 years ago. Drizzle's `mode: 'number'` hands
   * Better Auth back the plain number it wrote rather than a BigInt, which is what it expects.
   */
  lastRequest: bigint('last_request', { mode: 'number' }).notNull(),
})
