# ADR 0002 — SES: domain verified now, production access deferred

**Date:** 2026-08-17 · **Status:** Domain done. Production access pending, deliberately.
**Updated 2026-08-19:** the application now sends. See `0004-sign-in-mail-sends-for-real.md`;
two of the five gates below moved, and the configuration set gained an event destination.
**Updated 2026-08-19 (later the same day):** the apex now receives mail and DMARC is published.
See `0005-the-apex-receives-mail.md`; five statements below are superseded and marked.

> Every row in the table below was **re-read from the live account on 2026-08-19**, not carried
> forward from the day it was written: `sesv2 get-account`, `list-email-identities`,
> `get-email-identity` and `get-configuration-set` — plus `sns list-subscriptions`, which none
> of those four cover. All of it matched except the verified recipient and the SNS subscription,
> both since confirmed. `ProductionAccessEnabled: false`,
> `Max24HourSend: 200`, `MaxSendRate: 1`, `SentLast24Hours: 0`.

## What is set up

Region `eu-central-1`. All of it free, and none of it capable of being rejected.

| Thing | State |
|---|---|
| Domain identity `guestnote.be` | **verified** |
| Easy DKIM, RSA 2048 | **SUCCESS** — 3 CNAMEs under `_domainkey`, verified in ~3 min |
| Custom MAIL FROM `mail.guestnote.be` | **SUCCESS** — MX + SPF TXT on the subdomain |
| Behaviour on MX failure | `USE_DEFAULT_VALUE` |
| Configuration set `guestnote-default` | created, reputation metrics on |
| Event destination on it | **deployed 2026-08-19** — `BOUNCE`, `COMPLAINT`, `DELIVERY_DELAY` to `arn:aws:sns:eu-central-1:929219061071:guestnote-mail-events`. `infra/mail-events.yaml`, the repo's first IaC. Proven publishing, and the email subscription is **confirmed** — a real ARN rather than `PendingConfirmation`, checked 2026-08-19 (ADR 0005). It notifies a personal Gmail address, not `info@guestnote.be` |
| Account-level suppression | **on by default** (accounts after 2019-11-25), both bounces and complaints. Not something we configured; worth knowing it is already there |
| Account | **still in sandbox**: 200/day, 1/sec |
| Verified recipient `njoren@gmail.com` | **verified** — confirmed 2026-08-19 against the live account (`SendingEnabled: true`); this row said "awaiting the click" until then. **Largely redundant since 2026-08-17**, when the domain identity verified: a verified *domain* already makes any `@guestnote.be` address a legal sandbox destination, and as of 2026-08-19 those addresses receive (ADR 0005). It is not fully redundant while anything still sends to a Gmail address -- which both SNS topics do |

**Custom MAIL FROM is the reason to bother.** Without it, SPF authenticates
`amazonses.com` rather than `guestnote.be`, so SPF cannot align for DMARC. With it, both
DKIM and SPF align on the domain, which is what a `p=reject` policy would eventually need.

`USE_DEFAULT_VALUE` rather than `REJECT_MESSAGE` on purpose: if the MX record ever breaks,
SES falls back to `amazonses.com` and mail still goes out with DKIM intact.
`REJECT_MESSAGE` would silently stop *all* sending on a DNS mistake.

**Nothing touches the apex.** `guestnote.be` already carries a Google Site Verification
`TXT` and the CloudFront A/AAAA aliases. Every record added here is under `_domainkey.` or
`mail.`, so the apex was never in an UPSERT batch.

> **Superseded 2026-08-19.** This held for two days. The apex now carries three `MX` records
> pointed at Zoho, an SPF `TXT`, and `_dmarc` beside it. The care described above is precisely
> *why* the change was safe — Route 53 replaces a whole record set on write, so the Google and
> Zoho verification strings were repeated verbatim in the UPSERT rather than replaced — but the
> apex is a live record set now, and **every future write to its `TXT` set must carry all three
> values**. See `0005-the-apex-receives-mail.md`.

## Why production access was NOT requested yet

`research/05-architecture.md` §6 says to get production access "before you need it —
approval takes a day", and the plan carried that as a Step 0 item. Two things changed the
calculus:

1. **`UseCaseDescription` is deprecated** in `PutAccountDetails`. The review is a human
   support case, so the *quality* of the answer matters more than the lead time.
2. There is **no verified sending history, no bounce pipeline, and no application that
   sends anything**. That is the weakest possible version of this request, and a rejection
   has to be appealed — strictly worse than asking later with a working system to describe.

**And it blocks nothing.** Sandbox permits 200/day at 1/sec to *verified* identities, which
is ample for building sign-in email in W3. The plan already had dev sign-in mail going
to the console anyway.

> **2026-08-19.** The second reason has partly expired: there is now an application that sends,
> and `mail_deliveries` records every attempt. What is still missing is a *bounce consumer* --
> events reach a human inbox, not the database -- and two of the questions below are still not
> answerable from code. So the conclusion holds, with less of it resting on "nothing exists yet".

Ask once the W3 sign-in path actually sends and `email_log` + the bounce pipeline exist —
realistically alongside M10, or sooner if a validation call turns into a pilot.

## The request, drafted

Declared type: **`TRANSACTIONAL`**. Everything is triggered by a relationship the recipient
is already in — sign-in codes (magic link when this was written; see
`07-auth-and-tenancy.md`'s 2026-08-18 credential note), "a task was assigned to you", an RSVP confirmation,
"what is due on your own wedding". No promotional content, no acquired lists.

```bash
aws sesv2 put-account-details --region eu-central-1 \
  --mail-type TRANSACTIONAL \
  --website-url https://guestnote.be \
  --contact-language EN \
  --additional-contact-email-addresses njoren@gmail.com \
  --production-access-enabled
```

`ContactLanguage` accepts only `EN | JA`, so `EN` — despite the product being Dutch first.

### What still has to be true before sending it

Not stalling for its own sake — each of these is something AWS's reviewer asks about, and
each is a real answer we do not yet have:

- [~] **Bounce and complaint handling exists.** *Half, as of 2026-08-19.* The configuration set
      publishes `BOUNCE`, `COMPLAINT` and `DELIVERY_DELAY` to an SNS topic and a human is
      subscribed (`infra/mail-events.yaml`). The SQS + Lambda consumer that writes
      `mail_deliveries.bounced_at` does **not** exist -- those columns are always null today, and
      `schema/mail.ts` says so rather than implying coverage. Note also that account-level
      suppression was already protecting the reputation floor before any of this; the topic buys
      visibility. §6's warning about a tenant importing a stale CSV is about *guest* mail, which
      is P4 and not what sends today.
- [ ] **A recipient can stop receiving.** Guest RSVP mail is one-off and transactional, but
      the weekly digest needs a real preference toggle. This is currently unspecified.
- [ ] **Where addresses come from, stated plainly.** Planners and couples enter their own.
      Guest addresses are entered by the couple, for their own wedding, and are only ever
      mailed about that wedding. Nothing is bought or scraped.
- [ ] **Volume estimate.** `06-hosting-costs.md` models ~60k/month at 100 weddings, but that
      is the guest-site product. The planner app at launch is a much smaller number and it
      should be honest rather than aspirational.
- [~] **`email_log` idempotency is live.** *Not as designed, and deliberately.* Auth mail has no
      wedding, no guest and no legitimate idempotency key -- every request for a code should
      produce a new one. What exists instead is `mail_deliveries` (2026-08-19), unscoped, with a
      unique index on `provider_message_id` because that is the key a bounce notification carries
      back. `email_log` with the `(wedding_id, guest_id, template, scheduled_for)` index arrives
      with `guests` at P4; ADR 0004 explains why they are two tables and not one.

## Follow-ups

- **DMARC is not set up, deliberately.** `_dmarc.guestnote.be` with `p=none` is harmless and
  is the prerequisite for ever reaching `p=reject`, but it is only useful with a `rua=`
  address to receive aggregate reports — which is a decision, not a default. DKIM and SPF
  both align already, so the groundwork is done whenever that address is chosen.
  **Done 2026-08-19.** A mailbox on the domain made the address decidable; it is Postmark DMARC
  Digests, and `v=DMARC1; p=none; ... aspf=r;` is live. ADR 0005 records why `aspf=s` would have
  hard-failed every SES send, and why `sp=none` is a trap the day `p=` rises.
- **Per-tenant configuration sets** (§6, v2 white-label) are not built. `guestnote-default`
  is the single set until reputation needs attributing per customer.
- ~~**No event destination on the configuration set yet**~~ — added 2026-08-19,
  `infra/mail-events.yaml`. ~~**The SNS email subscription needs its confirmation link clicked**
  before anything is delivered, exactly like the verified recipient above.~~ **Confirmed
  2026-08-19** — `sns list-subscriptions` returns a real ARN for `guestnote-mail-events` and for
  `guestnote-waitlist`. Both still notify a personal Gmail address rather than the
  `info@guestnote.be` that now exists (ADR 0005).
