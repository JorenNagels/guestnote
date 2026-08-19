# ADR 0004 — sign-in mail sends for real: react-email's renderer, not its components

**Date:** 2026-08-19 · **Status:** Settled, verified end to end. Production access still pending, deliberately.

Records what happened when `research/05-architecture.md` §6's mail design met the registry and
the runtime. Two things it asserts are no longer true as written, and one Better Auth default
turned out to make the whole exercise riskier than it looked:

1. **§6 says "use `react-email`".** Still right about the renderer, wrong about how to get the
   components — the package it means was deprecated and its replacement would add roughly 80 MB
   to every Lambda.
2. **§6 says bounce handling is "mandatory, not optional".** It is now wired, but only as far as
   *visibility*; the part that writes to the database does not exist and the schema says so.
3. **Not in any document:** Better Auth's rate limiter was off outside production and stored in
   memory inside it, and the sign-in code was stored in the database in plain text. Both were
   harmless while `sendCode` was a `console.info`. Neither is once mail leaves the building.

## The question

`research/05-architecture.md` §6: *"use **`react-email`** regardless — typed React templates,
local preview via `email dev`, version-controlled beside the app, i18n through the same
`next-intl` catalogues — rendered to HTML and handed to SES v2 `SendEmail`."*

That reads as one decision. It is three — a renderer, a component library, and a CLI — and they
have diverged since it was written.

What rests on it: `apps/web/next.config.ts` sets `output: 'standalone'` with
`outputFileTracingRoot`, and OpenNext at M1a will zip whatever that traces. File tracing traces
**files**, not tree-shaken imports, so a dependency that is merely *importable* from application
code is a dependency that ships.

## The answer

**Use `@react-email/render`. Do not use `@react-email/components`. Do not import from
`react-email` at runtime.** Measured against the npm registry and the installed tree,
2026-08-19.

| Package | Unpacked | Deps | State |
|---|---|---|---|
| `@react-email/components@1.0.12` | 14.3 kB | 20 | **deprecated** — "Package no longer supported" |
| `@react-email/button`, `-body`, `-tailwind`, … | — | — | **deprecated**, all of them |
| `react-email@6.9.2` (the unified package) | 3.5 MB | 22 | supported, **one `.` export, no subpaths** |
| `@react-email/render@2.1.0` | 190 kB | 4 | **not deprecated** |

`react-email@6.9.2` declares `prismjs@^1.30.0`, `marked@^15.0.12`, `tailwindcss@^4.1.18` and
`esbuild` as runtime dependencies of that single entry point.
[resend/react-email#3556](https://github.com/resend/react-email/issues/3556) measured the
consequence: *"serverless function bundles grew by ~80 MB per function"*, with Vercel deploys
hanging. The issue is closed and the package now sets `sideEffects: false`, but 6.9.2 still has
no subpath exports, and `sideEffects` does not help file tracing.

So the split, and the CLI stays because it never reaches a bundle:

| Layer | What | Why |
|---|---|---|
| Runtime render | `@react-email/render@^2.1.0` | Maintained, 190 kB, and the same engine the CLI previews with — so the preview *is* the production render path |
| Markup | hand-written JSX + inline styles, `packages/email/src/layout.tsx` | ~90 lines of table markup and MSO boilerplate that has not changed in a decade |
| Preview | `react-email@^6.9.2` + `@react-email/ui@^6.9.2`, **devDependencies** | Never imported by application code; 52 MB, and verified absent from `.next/standalone` |

`@aws-sdk/client-sesv2` is 1.94 MB, which is the floor for SESv2 `SendEmail` and the reason
`packages/email/src/ses.ts` is the only file allowed to import it — `biome.json` and
`packages/db/src/no-unsafe-imports.test.ts` both hold that, the second because a lint rule can
be silenced with a comment.

### Verified end to end

`POST /api/auth/email-otp/send-verification-otp` against `next dev`, with a `NEXT_LOCALE`
cookie, twice:

| Assertion | Result |
|---|---|
| Request accepted | HTTP 200 `{"success":true}` |
| Rendered HTML size | **3,308 bytes** |
| `NEXT_LOCALE=fr` → French copy, `lang="fr"` | `<title>903330 est votre code de connexion Guestnote</title>` |
| `NEXT_LOCALE=nl` → Dutch copy | `<title>280269 is je Guestnote-aanmeldcode</title>` |
| Links in the email | **0** — no `href` anywhere, asserted in `render.test.ts` |
| `mail_deliveries` rows | 2, locales `fr` and `nl`, both `status = 'sent'` with a message id |
| `bounced_at` / `complained_at` | null, and will stay null until a consumer exists |
| Database suites | **101 passed** on both tiers, up from 99 (`postgres:17-alpine` locally, Neon **PostgreSQL 18.4** pooled) |
| `npm run check` | 353 passed, 18 files |

And then against **live SES**, once the SSO session was refreshed -- `next start` with
`NODE_ENV=production` and `GUESTNOTE_MAIL_TRANSPORT` deliberately **unset**, so the production
default had to resolve to `ses` on its own:

| Assertion | Result |
|---|---|
| Recipient | `success@simulator.amazonses.com` — the mailbox simulator, so no human inbox |
| Request | HTTP 200 `{"success":true}` |
| `mail_deliveries.provider_message_id` | `010701a018a86db2-94e7a5ae-3ab4-48f5-a6e4-9eaf902527d0-000000` — a real SES id |
| `provider_message_id like 'console-%'` | **false**, so the console transport was not silently substituted |
| Files written to `apps/web/.mail` | **0 new**, same check from the other direction |
| `SendQuota.SentLast24Hours` | still `0` — AWS documents simulator sends as not counting against the daily quota, and that is now measured rather than quoted |

That closes the last gap: before this, the SES transport was exercised only against an injected
fake client. IAM was not an obstacle because the local profile is `AdministratorAccess`; the
scoped `ses:SendEmail` policy for the Lambda role is still M1a's to write.

Two doc facts worth carrying, both from AWS rather than measured here:

- **Suppression is a successful send.** AWS documents the `SEND` event as *"(If account-level or
  global suppression is being used, SES will still count it as a send, but delivery is
  suppressed.)"* So `SendEmail` returns a MessageId and the mail goes nowhere. `MailFailure` has
  no `'suppressed'` member for this reason, and `mail_deliveries.status = 'sent'` means "SES
  accepted it" and nothing more.
- **Hard bounces are already suppressed** for accounts created after 25 November 2019, which
  includes this one. The event destination below buys *visibility*, not protection.

## The second finding: two Better Auth defaults that mail made dangerous

Read off the installed `better-auth@1.7.1` and `@better-auth/core`, not remembered.

**`rateLimit` was doing nothing.** `init-options.d.mts` documents *"By default, rate limiting is
only enabled on production"* with `storage` defaulting to `"memory"`. So there was no limiter at
all in development, and one per Lambda container in production. While a code went to a terminal
that cost nothing. With SES attached, each request past the limit is a real email against a
sandbox ceiling of **200/day and 1/second**, and a loop pointed at the sign-in form would burn
the quota for every other user and put the domain's reputation at risk.

Now `rateLimit: { enabled: true, storage: 'database' }`, against a new `rate_limits` table whose
three fields came from `getAuthTables()` on the installed package. Measured:

| Request | Result |
|---|---|
| 1–3 in the window | HTTP 200 |
| 4th and after | **HTTP 429** `{"message":"Too many requests. Please try again later."}` |
| `rate_limits.count` | reached 3 and stopped |
| `mail_deliveries` rows created by the 429s | **0** — the limiter rejects before the send |

**`storeOTP` defaulted to `"plain"`.** `verifications.value` held the live six-digit code in
readable form, so anything that could read one row of that table had a five-minute window into
any account. Now `storeOTP: 'hashed'`; the plugin's types confirm it degrades safely, because
`resendStrategy` *"falls back to `rotate` when OTP is hashed"* and `rotate` is already the
default. Measured after the change: `length(value) = 45`, and `value = '903330'` is false.

## Why "just pin the deprecated package" does not apply

`@react-email/components@1.0.12` works today, needs React 19, has 20 small dependencies and none
of the CLI's weight. It is a real option and it was rejected rather than overlooked: a deprecated
dependency receives no compatibility or security fixes, and the thing it saves is table markup
whose specification stopped moving years ago. `packages/email/src/layout.tsx` carries every
workaround with the reason attached, which is the form this repo prefers anyway.

It stays the documented fallback if the hand-written boilerplate turns out to cost more than it
saves.

## What this costs

- **Roughly 90 lines of email HTML we now own** — doctype, the MSO `PixelsPerInch` block, the
  six-declaration hidden preheader, `format-detection` to stop iOS turning six digits into a
  `tel:` link, and the border radius repeated on the last cell because Outlook paints over it.
  Each is commented where it appears; none of it is interesting until it breaks.
- **The preview server costs 52 MB, not the 3.5 MB the CLI package advertises.** `react-email`
  itself is 3.5 MB, but `email dev` refuses to start without `@react-email/ui`, which is
  **52,244,744 bytes unpacked and depends on `next@16.3.0`** — a second copy of Next beside the
  app's 16.3.1. It is added explicitly as a devDependency rather than left to the CLI's
  interactive "would you like to install it? (Y/n)" prompt, which would hang any non-tty run.
  Verified not to reach the deploy artefact: after adding it, `.next/standalone` contains no
  `@react-email/ui`, `react-email`, `prismjs`, `marked`, `tailwindcss` or `esbuild`, and stays at
  48 MB.

  It also brings its own templates-directory convention, which is why
  `packages/email/src/layout.tsx` sits *outside* `src/templates/` — the CLI's `--dir` should only
  see files exporting a previewable component. Its default port is 3000, which `next dev` owns,
  so the script pins 3030. Measured working: `✔ Successfully rendered sign-in-code.tsx in 59ms`,
  and it handled this repo's `.ts`-extension source imports without configuration.
- **`PREVIEW_COPY` duplicates seven strings** that really live in `apps/web/messages/*.json`. It
  is a fixture, `satisfies SignInCodeCopy` keeps it in step with the type, and
  `i18n/messages.test.ts` covers the catalogues themselves.
- **`mail_deliveries` is not `email_log`.** `research/05-architecture.md` §4 designs the latter
  around `wedding_id`, `guest_id` and an idempotency key on
  `(wedding_id, guest_id, template, scheduled_for)`; `guests` is P4. Two tables with similar
  jobs is the accepted price of not pre-empting a design that is not ready.
- **`bounced_at` and `complained_at` have no writer.** The columns exist, the SNS topic exists,
  and the consumer that joins them does not. Stated in `schema/mail.ts` so a reader does not
  conclude bounces are being tracked.

## What is still open

- **The SES event consumer.** SNS → SQS → Lambda writing `mail_deliveries.bounced_at`. It needs a
  public origin or a queue, so it lands with M1a.

  The publishing half is **deployed and measured**, 2026-08-19. `infra/mail-events.yaml` created
  four resources, all `CREATE_COMPLETE`, and probes to `bounce@simulator.amazonses.com` and
  `complaint@simulator.amazonses.com` produced **two `NumberOfMessagesPublished` datapoints of 1**
  on `guestnote-mail-events`. That is the assertion worth having: a wrong topic policy would leave
  SES unable to publish, silently, and the metric is the only place it would show.

  Safe to probe because AWS states it plainly: *"Emails that you send to the mailbox simulator do
  not count toward your sending quota or your bounce and complaint rates"*, and the simulator
  address *"isn't placed on the Amazon SES suppression list"*. Checked before sending, because on
  a domain with no sending history one counted bounce is a 100% bounce rate.

  ~~**The subscription is `PendingConfirmation` until the link in AWS's email is clicked**~~ —
  **confirmed 2026-08-19.** `sns list-subscriptions` returns a real ARN for both
  `guestnote-mail-events` and `guestnote-waitlist`, so bounce and complaint notifications are
  being delivered. Both still point at a personal Gmail address rather than
  `info@guestnote.be`, which exists as of the same day — see
  `0005-the-apex-receives-mail.md`.
- **`advanced.ipAddress.trustedProxies` is unset.** The limiter keys on client IP, and the
  documented behaviour with that option unset is to trust *"only single-value IP headers"*.
  Behind CloudFront `x-forwarded-for` is a chain, so until M1a configures it every request will
  key to the same value and the `rate_limits` table becomes decorative. Flagged in
  `better-auth.ts` at the line it affects.
- **`AUTH_POLICY.codeTtlSeconds` is still not ratified.** The email derives its "expires in N
  minutes" from that constant and the catalogues use an ICU `plural`, so changing it to 60 or 600
  reads correctly without a copy edit. That is preparation, not a decision.
- **The identity, DKIM, custom MAIL FROM and the `guestnote-default` configuration set remain
  hand-made.** The event destination is under CloudFormation; the set it attaches to is not --
  `infra/mail-events.yaml` references it by name, which is what let the stack deploy without
  adopting or recreating a resource that already had reputation metrics running. Bringing the
  other four under IaC is `create-change-set --import-existing-resources` and belongs with M1a's
  `FoundationStack`, not with this.
- **Production access.** This ticks two of ADR 0002's five gates. See that file.
