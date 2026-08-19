# ADR 0005 — the apex receives mail now: Zoho for humans, SES for the app, DMARC over both

**Date:** 2026-08-19 · **Status:** Settled, verified in DNS. Zoho's DKIM signing is pending one
toggle in their console.

Records three things that happened after `0004` landed, and repairs every statement they made
false — five in `0002`, one in `0004`, one in each research document, one in `README.md`, one in
`packages/email/README.md`, and three source comments. `0002` said *"Nothing touches the apex"* and *"DMARC is not set up,
deliberately"*; both were true when written and neither is true now. `research/06-hosting-costs.md`
§2 prices SES at a rate this account is not on.

## The question

`research/05-architecture.md` §6 chose the `noreply@guestnote.be` localpart. The *absence* of a
`Reply-To` was never any document's decision — §6's v1 actually pairs that localpart **with** a
`Reply-To` to the planner — it was `packages/email/src/ses.ts`'s own call, justified only in the
code, and this ADR is its first document of record:

> *"NOT set: ReplyToAddresses. The apex carries no MX record (ADR 0002 added records only under
> `_domainkey.` and `mail.`), so a Reply-To would bounce at the replier's server."*

That was a fact about DNS holding up a design decision. The moment a human needs a business
address on the domain — for planner conversations, for the AWS production-access contact, for the
`rua=` address `0002` was waiting on — the fact changes and the decision has to be re-argued
rather than inherited.

## The answer

**Zoho Mail on the free tier, in the EU data centre, alongside SES rather than instead of it.**
Chosen 2026-08-19 after pricing four alternatives; the DNS was applied and verified the same day.
`joren@guestnote.be` is the mailbox, `info@guestnote.be` a group beside it, against a free tier
whose ceiling is **5 users at 5 GB each on one domain, with no IMAP, POP or ActiveSync**. That
last exclusion is the one that bites, and it is priced in "What this costs" below.

### Why not the cheaper-looking options

| Option | Why not |
|---|---|
| **ImprovMX free** | Forwarding only. Replying to a Belgian wedding planner from `njoren@gmail.com` undercuts the pitch, and that is the whole reason for the mailbox |
| **Cloudflare Email Routing** | Free and generous (200 rules, 200 destinations, 25 MiB), but the zone would have to move off Route 53, where the CloudFront A/AAAA aliases live |
| **Migadu Micro** | $19/yr, Swiss GmbH (CHE-334.933.960), unlimited mailboxes — genuinely good, and the fallback if Zoho's free tier is withdrawn. Beaten only on price, and its **20 outbound messages/day** cap is real |
| **Google Workspace** | ~$9.20/user/month. Correct eventually, wrong now |

**Zoho's free plan is regionally gated**, which is not obvious: the pricing page carries the
footnote *"\*Available only in select data centers"*, and new EU signups are widely reported to
get a 15-day Mail Lite trial instead. This signup did get the free tier on `zoho.eu`. That is
luck, not a guarantee, so Migadu stays written down above.

### What was published

Three Route 53 change batches against zone `Z062010620FZZT8M58C8Q`, each waited to `INSYNC` and
each verified against the authoritative nameserver rather than a resolver cache:

| Assertion | Result |
|---|---|
| DKIM public key, transcribed from a screenshot | `openssl pkey -pubin -text` → **valid 1024-bit RSA**, 234-char record, one TXT string (limit 255) |
| `dig MX guestnote.be` | `10 mx.zoho.eu` · `20 mx2.zoho.eu` · `50 mx3.zoho.eu` |
| `dig TXT guestnote.be` | **3 values** — Google site verification, Zoho verification, `v=spf1 include:zohomail.eu ~all` |
| `dig TXT zmail._domainkey.guestnote.be` | the DKIM key, resolving |
| `dig TXT _dmarc.guestnote.be` | `v=DMARC1; p=none; pct=100; rua=mailto:re+f73ktxwptpm@dmarc.postmarkapp.com; sp=none; aspf=r;` |
| `dig TXT guestnote.be._report._dmarc.dmarc.postmarkapp.com` | **`"v=DMARC1;"`** — Postmark's RFC 7489 §7.1 authorisation answers, so reports will actually flow |
| SES records after all three batches | `mail.guestnote.be` MX and SPF unchanged, three `*.dkim.amazonses.com` CNAMEs unchanged |
| Apex `A` after all three batches | still the CloudFront distribution |

**The apex TXT set was the whole risk.** Route 53 replaces a record set on write, and that set
already held two values. An `UPSERT` carrying only the new SPF would have silently deleted the
Google and Zoho verification strings; the batch repeats both verbatim. This is exactly the
hazard `0002` avoided by never putting the apex in a batch, and the reason that sentence now has
to change rather than quietly stay.

### DMARC: what was chosen, and what was left at the default

`0002` parked DMARC because `rua=` needed *"a decision, not a default"*. The decision is
**Postmark DMARC Digests** — free, weekly, human-readable, no dashboard — over raw XML into a
mailbox nobody opens. The cost is that aggregate report data goes to a third party.

Two parameters matter more than the policy, and a third is inert:

- **`aspf=r` is chosen, not inherited.** SES's envelope sender is `mail.guestnote.be`, a
  *subdomain* of the From domain. Relaxed SPF alignment passes; **`aspf=s` would hard-fail every
  sign-in code**, invisibly at `p=none` and fatally at `p=reject`. Zoho and SES both DKIM-sign as
  `d=guestnote.be`, so DKIM alignment would survive strict — SPF is the one that breaks.
- **`sp=none` is Postmark's default and is a trap for later.** Today it is identical to `p=none`.
  The day `p=` rises, `sp=` must rise with it or every subdomain, `mail.guestnote.be` included,
  stays at no policy — the exact hole DMARC exists to close.
- **`pct=100` is Postmark's default and was accepted, not chosen.** It is the staged-rollout dial
  and it does nothing at `p=none`, since there is no enforcement to apply to a percentage. It
  becomes a real decision at the same moment `sp=` does.

## Where `research/` and `0002` were wrong

**`research/06-hosting-costs.md` §2 prices SES at `$0.10 per 1,000`, and `research/05-architecture.md`
§6's "~$6 at 60k" assumes the same rate without writing it down.** This account is not on it. Measured 2026-08-19:

```
$ aws sesv2 get-account --region eu-central-1
"PricingAttributes": { "CurrentPlan": "ESSENTIALS" }
```

AWS introduced SES pricing plans on **2026-07-21**. Accounts with no metered SES activity since
2025-06-01 are enrolled in **Essentials at $0.16/1,000** — and this identity first sent on
2026-08-17, after the cutover, so it was enrolled rather than grandfathered onto à-la-carte.
There is no monthly fee, so the delta is per-email only:

| Volume | Essentials $0.16 | À-la-carte $0.10 | Delta |
|---|---|---|---|
| Today (sign-in tests) | ~$0.01 | ~$0.01 | — |
| 60k/mo (`06` §2's model) | **$9.60** | $6.00 | **+$3.60/mo** |
| 300k/mo | **$48.00** | $30.00 | **+$18.00/mo** |

The $0.06 gap buys Virtual Deliverability Manager, which à-la-carte prices at $0.07/1,000.
`VdmAttributes` on this account is `null` — **the feature is off, so the bundle rate currently
buys nothing.** Left as-is deliberately: the difference is cents at present volume, and AWS
documents that an account *defaulted* into Essentials may cancel to à-la-carte with immediate
effect once — *"If you did not explicitly choose a plan and were defaulted to the Essentials
plan, your first downgrade or cancellation to à la carte pricing also takes effect
immediately"*, from the SES developer guide's pricing-plans page, read 2026-08-19. That keeps
the option open at no cost.

**`0002`'s follow-up and `0004`'s open item are both closed.** `0002` said *"The SNS email
subscription needs its confirmation link clicked before anything is delivered"*; `0004` worded the
same gap as `PendingConfirmation`. Both `guestnote-mail-events` and `guestnote-waitlist` return
real subscription ARNs. Both still notify a personal Gmail address rather than `info@`.

## What this costs

- **The apex is no longer inert, and every future write to its TXT set must carry all three
  values.** `0002` could treat it as untouchable; nothing can now. This is the single most
  breakable thing in the zone.
- **Zoho's free tier is webmail and Zoho's own mobile app only** — no IMAP, POP or ActiveSync.
  Two consequences: the account cannot be added to the Gmail app, and there is no IMAP-based
  migration path *out*, including into Google Workspace's Data Migration Service. Mail Lite at
  $1/user/month buys both back, and buying it is the exit as much as the convenience.
- **Two providers now send as `guestnote.be`.** Zoho on shared outbound IPs we do not control,
  SES on its own. Domain reputation is common to both, so a bad week at Zoho is a bad week for
  sign-in codes. SES Tenants ($0.005/month/tenant + $0.005/1,000) exist to isolate this and are
  not worth it at this volume.
- **Aggregate report data goes to Postmark**, in exchange for never parsing XML.
- **A new domain has no sending reputation.** First Zoho mail to Gmail landed in spam, which is
  expected for a domain that has never sent through Zoho, is authenticated by SPF alone until the
  DKIM toggle, and had no DMARC record until today. All three of those are now addressed or
  addressable; time and real interaction are the rest.

## What is still open

- **Zoho's DKIM is published but not switched on.** The `zmail._domainkey` TXT resolves; signing
  is enabled separately in Zoho's admin console. Until then Zoho mail authenticates on SPF only
  and `DMARC: PASS` will not appear in Gmail's *Show original*.
- **`p=none` is a starting position, not a destination.** Raise to `quarantine` only after the
  Postmark digests show a clean baseline, and move `sp=` in the same edit.
- **SES production access.** `0002`'s gates are unchanged by any of this; the mailbox does
  improve the `--additional-contact-email-addresses` argument, which still names a personal
  Gmail address.
- **The SES event consumer.** Still absent, still M1a. `mail_deliveries.bounced_at` still has no
  writer.
- **`Reply-To` stays unset, on new grounds.** The old reason — a reply would bounce — is dead.
  The decision stands because a sign-in code is a machine message and an auth mail should not
  advertise a reply channel nobody watches in real time. `ses.ts`, `ses.test.ts` and `mailer.ts`
  now say that instead.
