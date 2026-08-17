# Coming-soon page

One self-contained `index.html`. No build step, no dependencies, no external requests —
the logo is inlined SVG, the favicon is a data URI, the fonts are system stacks. Drop it
on S3 and it works.

Preview locally: `open index.html`.

## What it does

- **NL by default**, EN on the toggle, choice remembered in `localStorage`. Dutch is the
  default because the domain is `.be` and the strategy is Flanders-first — not browser
  sniffing, which sends Belgian planners running an English OS to the wrong language.
- The logo's **checkmark draws itself** on load (`stroke-dashoffset` on the existing
  `<line>`, 817px long). Card fades → heart fades → check strokes in → copy rises.
- Ambient drifting card glyphs on `<canvas>`, ~7–16 depending on viewport.
  `prefers-reduced-motion` renders a single static frame instead of animating.
- Two calls to action in one form: the email field, and a **planner/venue checkbox** that
  flags the lead for the 15 validation calls — the actual next action in the README.
  Planner ticks trigger an SNS email to you; ordinary signups just get stored.
- A honeypot field kills the obvious bots without a captcha.

## Before it goes live

1. **Deploy the waitlist** (`../waitlist/deploy.sh`) and paste the Function URL into
   `ENDPOINT` at the top of the `<script>`. Until you do, submitting shows
   "De wachtlijst is nog niet actief" rather than pretending to work.
2. **No mailbox needed.** There is deliberately no `mailto:` anywhere. The planner ask is
   a checkbox in the form, so `hello@guestnote.be` can wait until it earns its cost.
3. **No launch date is stated.** Deliberate — don't promise one you haven't committed to.
   If you want one, it goes in the `eyebrow` string, both languages.

## Deploy

Static site, so S3 + CloudFront + Route 53. At this traffic it sits inside the permanent
free tiers (see `research/06-hosting-costs.md`).

```bash
BUCKET=guestnote-be-coming-soon
REGION=eu-central-1

aws s3 mb "s3://$BUCKET" --region "$REGION"
aws s3 cp index.html "s3://$BUCKET/index.html" \
  --content-type "text/html; charset=utf-8" \
  --cache-control "public, max-age=300"
```

Then, in this order:

1. **Certificate in `us-east-1`.** ACM certs for CloudFront *must* live in `us-east-1`
   regardless of where the bucket is. Request one for `guestnote.be` **and**
   `www.guestnote.be`, DNS-validated — Route 53 can write the validation records for you.
2. **CloudFront distribution.** Origin = the bucket via **OAC** (Origin Access Control,
   not the deprecated OAI), so the bucket stays private. Set **Default root object =
   `index.html`**, attach the cert, add both alternate domain names, redirect HTTP→HTTPS.
3. **Route 53.** Alias `A` *and* `AAAA` records for `guestnote.be` and `www.guestnote.be`
   pointing at the distribution. Alias records, not CNAMEs — the apex can't be a CNAME.

Short `max-age` on purpose: you'll be editing copy. Invalidate after each change:

```bash
aws cloudfront create-invalidation --distribution-id EXXXXXXXXXXXXX --paths "/index.html" "/"
```

## Don't paint yourself in

Leave these free for the real product — `05-architecture.md` needs them:

- `pro.guestnote.be` — the planner dashboard
- `*.guestnote.be` — tenant wedding sites, wildcard cert and wildcard CloudFront alias

So scope this distribution to the apex and `www` only. A wildcard alias here would
collide with the multi-tenant distribution later.

When the real app ships, this page either dies or becomes the marketing site — either way
it is deliberately throwaway, and nothing else should depend on it.
