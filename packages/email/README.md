# `@guestnote/email`

Transactional mail: react-email templates rendered to HTML and handed to SES v2 `SendEmail`.
`research/05-architecture.md` §6 is the design; `docs/adr/0004-sign-in-mail-sends-for-real.md`
records where that document turned out to be wrong and what was measured instead.

One template today — the sign-in code — because it is the only one with a live trigger.

## The seam

`createMailer({ transport, record })`. Everything it returns is plain data; no AWS type crosses
the boundary. `apps/web/src/lib/mailer.ts` is the only composition point, and the only place that
knows a region, a From address or a database exists.

```
apps/web/src/lib/auth.ts        sendCode()  <- Better Auth's emailOTP callback
  -> lib/mailer.ts              sendSignInCode()  joins env + catalogues + db
    -> createMailer()           renders, sends, records
      -> src/ses.ts             SESv2 SendEmail        (deployed, and locally on request)
      -> src/console.ts         writes apps/web/.mail  (development default)
```

| File | Role |
|---|---|
| `src/index.ts` | `createMailer`, one method per template |
| `src/types.ts` | `MailTransport`, `SendResult`, `MailFailure`, `DeliveryRecord` |
| `src/ses.ts` | **the only file allowed to import `@aws-sdk/client-sesv2`** |
| `src/console.ts` | development transport: prints, and writes the rendered HTML + text |
| `src/render.ts` | `@react-email/render` → `{ html, text }`, one render pass |
| `src/theme.ts` | the palette as literal hex, because email clients ignore `var()` |
| `src/layout.tsx` | the shell: doctype, MSO block, hidden preheader, footer |
| `src/templates/*.tsx` | one previewable email each, default-exported for the CLI |

## Three rules worth knowing before editing

**1. Do not import components from `react-email`.** `@react-email/components` is deprecated, and
the unified `react-email` package has no subpath exports and pulls `prismjs`, `marked`,
`tailwindcss` and `esbuild` from its single entry — measured at ~80 MB per serverless function in
[resend/react-email#3556](https://github.com/resend/react-email/issues/3556). `apps/web` builds
with `output: 'standalone'` and file tracing traces *files*, not tree-shaken imports, so an
importable dependency is a shipped one. Use `@react-email/render` and the markup in
`src/layout.tsx`. ADR 0004 has the numbers.

**2. The AWS SDK is contained, and two things hold it.** `biome.json` restricts
`@aws-sdk/client-sesv2` to `src/ses.ts` and `src/ses.test.ts`; `packages/db/src/no-unsafe-imports.test.ts`
greps for it independently, because a lint rule can be silenced with an inline comment and a test
cannot. Same arrangement as `better-auth`.

**3. Copy lives in the app, not here.** `apps/web/messages/{nl,en,fr}.json` under `email.*`,
resolved with next-intl's `createTranslator` and passed in as a typed prop. Templates take
finished strings and do no formatting. `PREVIEW_COPY` in a template is a fixture for the preview
server and the render test — never a source of truth.

## Previewing a template

```bash
npm run email:dev          # -> http://localhost:3030
```

Port 3030 because the CLI defaults to 3000 and `next dev` owns that. `--dir` points at
`src/templates`, which is why `layout.tsx` lives one level up: the CLI expects every file in that
directory to export a previewable component.

**The preview server is a 52 MB devDependency.** `react-email` is only 3.5 MB, but `email dev`
will not start without `@react-email/ui` (52 MB unpacked, and it depends on `next@16.3.0` — a
second copy of Next beside the app's). It is listed explicitly so the CLI never drops into its
interactive "would you like to install it?" prompt, which hangs anything without a tty. None of it
reaches the deploy artefact; ADR 0004 records the check.

The dev transport is the other loop, and it shows the real production render path:

```bash
npm run dev               # then request a code at app.localhost:3000/login
open apps/web/.mail/*.html
```

`.mail/` is gitignored and contains live sign-in codes. `lib/mailer.ts` refuses to build the
console transport outside development, which is the other half of keeping that true.

## Sending for real, locally

```bash
aws sso login --sso-session flowsha           # SES needs credentials
GUESTNOTE_MAIL_TRANSPORT=ses npm run dev
```

**The account is still in the SES sandbox**: 200 messages/24h, 1/second, and **only to verified
recipients**. Anything else comes back as `MessageRejected`, which `src/ses.ts` maps to
`'rejected'`. ADR 0002 tracks which identities are verified.

The mailbox simulator is the way to exercise bounce and complaint handling without burning the
quota — `bounce@simulator.amazonses.com` and `complaint@simulator.amazonses.com` do not count
against the daily limit.

## Tests

`npm run check` covers all of it; nothing here needs credentials or a network.

| File | What it holds |
|---|---|
| `theme.test.ts` | parses `design-system/tokens.css`, resolves each `var()` chain, and fails when a literal hex drifts |
| `render.test.ts` | the code appears in both parts, **no `href` anywhere**, doctype, MSO block, preheader out of the plaintext |
| `ses.test.ts` | the `SendEmailCommand` input, `Charset: 'UTF-8'` on all three parts, no Reply-To, and every error mapping |
| `index.test.ts` | what the transport is handed, what is recorded, and that a throwing recorder still returns the send result |

Mutation-checked, per the root README's standard: the drift test was confirmed to fail on a
one-digit colour change, and the import ban on a probe file that imported the SDK.

## What is deliberately not here

- **A staff-invitation template.** `packages/core/src/auth/index.ts` still resolves invitations
  from a fixture map, so there is no flow that would send one.
- **Bounce consumption.** `infra/mail-events.yaml` publishes to SNS; the consumer that writes
  `mail_deliveries.bounced_at` needs a public origin and lands with M1a. Those columns are always
  null today.
- **Anything guest-facing.** Fan-out, EventBridge Scheduler one-shots, per-tenant configuration
  sets and `email_log` proper are all `research/05-architecture.md` §6 at P4.
