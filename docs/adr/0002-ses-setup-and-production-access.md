# ADR 0002 — SES: domain verified now, production access deferred

**Date:** 2026-08-17 · **Status:** Domain done. Production access pending, deliberately.

## What is set up

Region `eu-central-1`. All of it free, and none of it capable of being rejected.

| Thing | State |
|---|---|
| Domain identity `guestnote.be` | **verified** |
| Easy DKIM, RSA 2048 | **SUCCESS** — 3 CNAMEs under `_domainkey`, verified in ~3 min |
| Custom MAIL FROM `mail.guestnote.be` | **SUCCESS** — MX + SPF TXT on the subdomain |
| Behaviour on MX failure | `USE_DEFAULT_VALUE` |
| Configuration set `guestnote-default` | created, reputation metrics on |
| Account | **still in sandbox**: 200/day, 1/sec |
| Verified recipient `njoren@gmail.com` | created, **awaiting the click** |

**Custom MAIL FROM is the reason to bother.** Without it, SPF authenticates
`amazonses.com` rather than `guestnote.be`, so SPF cannot align for DMARC. With it, both
DKIM and SPF align on the domain, which is what a `p=reject` policy would eventually need.

`USE_DEFAULT_VALUE` rather than `REJECT_MESSAGE` on purpose: if the MX record ever breaks,
SES falls back to `amazonses.com` and mail still goes out with DKIM intact.
`REJECT_MESSAGE` would silently stop *all* sending on a DNS mistake.

**Nothing touches the apex.** `guestnote.be` already carries a Google Site Verification
`TXT` and the CloudFront A/AAAA aliases. Every record added here is under `_domainkey.` or
`mail.`, so the apex was never in an UPSERT batch.

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
is ample for building magic-link sign-in in W3. The plan already had dev magic links going
to the console anyway.

Ask once the W3 sign-in path actually sends and `email_log` + the bounce pipeline exist —
realistically alongside M10, or sooner if a validation call turns into a pilot.

## The request, drafted

Declared type: **`TRANSACTIONAL`**. Everything is triggered by a relationship the recipient
is already in — magic-link sign-in, "a task was assigned to you", an RSVP confirmation,
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

- [ ] **Bounce and complaint handling exists.** SES configuration set → SNS → SQS → Lambda,
      writing `email_log.bounced_at` and flipping `guests.email_status`. §6 calls this
      mandatory, not optional: one tenant importing a stale CSV can torch the sending
      reputation for every customer.
- [ ] **A recipient can stop receiving.** Guest RSVP mail is one-off and transactional, but
      the weekly digest needs a real preference toggle. This is currently unspecified.
- [ ] **Where addresses come from, stated plainly.** Planners and couples enter their own.
      Guest addresses are entered by the couple, for their own wedding, and are only ever
      mailed about that wedding. Nothing is bought or scraped.
- [ ] **Volume estimate.** `06-hosting-costs.md` models ~60k/month at 100 weddings, but that
      is the guest-site product. The planner app at launch is a much smaller number and it
      should be honest rather than aspirational.
- [ ] **`email_log` idempotency is live.** The unique index on
      `(wedding_id, guest_id, template, scheduled_for)`. Double-sending a wedding invitation
      is a support incident and an apology.

## Follow-ups

- **DMARC is not set up, deliberately.** `_dmarc.guestnote.be` with `p=none` is harmless and
  is the prerequisite for ever reaching `p=reject`, but it is only useful with a `rua=`
  address to receive aggregate reports — which is a decision, not a default. DKIM and SPF
  both align already, so the groundwork is done whenever that address is chosen.
- **Per-tenant configuration sets** (§6, v2 white-label) are not built. `guestnote-default`
  is the single set until reputation needs attributing per customer.
- **No event destination on the configuration set yet** — that arrives with the bounce
  pipeline above, and is the same piece of work.
