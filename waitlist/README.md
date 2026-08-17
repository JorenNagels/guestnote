# Waitlist

Email capture for the coming-soon page. Lambda Function URL → DynamoDB, with an SNS email
to you when someone ticks the planner/venue box.

**Deployed to the `guestnote` AWS account, `929219061071`, `eu-central-1`.**

```bash
NOTIFY_EMAIL=you@example.com ./deploy.sh
```

`deploy.sh` pins `AWS_PROFILE=guestnote` and refuses to run if the credentials resolve to
any other account. This matters: the `default` profile on this machine is the **Realo work
account**, and Guestnote is a separate business — its infrastructure and billing must not
land there. To deploy elsewhere on purpose you have to say so explicitly:
`EXPECT_ACCOUNT=<id> ./deploy.sh`.

It prints the Function URL. Paste it into `coming-soon/index.html`:

```js
var ENDPOINT = "https://xxxxx.lambda-url.eu-central-1.on.aws/";
```

Then confirm the SNS subscription email AWS sends you, or planner notifications go nowhere.

## Cost: €0, and these tiers are perpetual

Checked against AWS pricing pages on 2026-08-13 rather than from memory:

| service | always-free allowance | what this uses |
|---|---|---|
| Lambda | 1M requests + 400,000 GB-s / month | a few hundred requests, ~200ms each |
| Lambda Function URL | no charge | no API Gateway needed, which is the part that *would* cost |
| DynamoDB | 25 GB + 25 WCU + 25 RCU | 1 WCU / 1 RCU, a few KB |
| SNS | 1,000 email notifications / month | one per planner lead |
| CloudWatch Logs | 5 GB ingest / month | trivial, retention pinned to 14 days |

**The one trap:** DynamoDB's 25 WCU / 25 RCU free tier applies to **provisioned** capacity
on the Standard table class only. An on-demand table gets the 25 GB of storage but bills
every request. `deploy.sh` provisions 1/1 deliberately — don't "modernise" it to on-demand.

At waitlist volumes this is genuinely zero, not rounding-to-zero. You would need ~1M
signups in a month to leave the Lambda tier.

## Why SNS and not SES

SES needs a verified identity — a verified domain or mailbox. That is exactly the cost you
wanted to defer. SNS email subscriptions verify by you clicking a link in your own inbox,
so no `guestnote.be` mailbox is required and nothing is charged.

Trade-off: SNS emails come from `no-reply@sns.amazonaws.com` and look like infrastructure.
That is fine for notifying *yourself*. It is not fine for emailing guests, which is why
`05-architecture.md` still has SES for the real product.

## Abuse handling

A public unauthenticated endpoint gets found. What's in place:

- **Honeypot** — a hidden `company` field. Filled means bot: returns 200 so it learns
  nothing, writes nothing.
- **Body cap** 2 KB, **email cap** 254 chars, strict-ish format check.
- **One row per address.** `UpdateItem` keyed on email, so a replay is an update, not a new
  row — and a duplicate never re-notifies.
- **Notifications only for planner leads.** This is the important one: SNS free stops at
  1,000 emails a month, so notifying on every signup would hand a spammer your bill.
  Ordinary signups are stored silently.

What's deliberately *not* in place: per-IP rate limiting. It needs a second table and a
read on every request, and the blast radius here is junk rows in a table that costs
nothing. If it becomes a problem, put CloudFront in front with a rate-based WAF rule —
but WAF is ~$5/month, so don't do it pre-emptively.

## Reading the list

```bash
# everyone
aws dynamodb scan --table-name guestnote-waitlist --region eu-central-1 \
  --query 'Items[].[email.S,planner.BOOL,lang.S,createdAt.S]' --output table

# just the planner leads — the 15 validation calls
aws dynamodb scan --table-name guestnote-waitlist --region eu-central-1 \
  --filter-expression 'planner = :t' \
  --expression-attribute-values '{":t":{"BOOL":true}}' \
  --query 'Items[].[email.S,lang.S,createdAt.S]' --output table

# CSV, for when you want it in a spreadsheet
aws dynamodb scan --table-name guestnote-waitlist --region eu-central-1 \
  --query 'Items[].[email.S,planner.BOOL,lang.S,createdAt.S]' --output text \
  | tr '\t' ',' > waitlist.csv
```

`scan` is the right call at this size. It stops being right somewhere north of a few
thousand rows, which this will never reach before the real product replaces it.

## Stored per signup

`email` (partition key, lowercased) · `createdAt` · `lastSeen` · `hits` · `lang` ·
`planner` (only present when true) · `ip` · `ua`

`ip` is there for abuse triage. Under GDPR that is personal data with a legitimate-interest
basis, so when the real privacy policy is written this table needs a retention decision —
and there is no deletion endpoint yet. Worth closing before this gets real traffic.

## Teardown

```bash
aws lambda delete-function --function-name guestnote-waitlist --region eu-central-1
aws dynamodb delete-table  --table-name guestnote-waitlist --region eu-central-1
aws sns delete-topic --topic-arn "$(aws sns create-topic --name guestnote-waitlist \
  --region eu-central-1 --query TopicArn --output text)"
aws iam delete-role-policy --role-name guestnote-waitlist-role --policy-name guestnote-waitlist-access
aws iam detach-role-policy --role-name guestnote-waitlist-role \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
aws iam delete-role --role-name guestnote-waitlist-role
```

## Moving to CDK later

This is CLI-deployed on purpose: no bootstrap, no stack, live in two minutes, and easy to
delete. `05-architecture.md` commits to CDK for the real product — when that stack exists,
re-declare these four resources there and delete them here. Nothing else depends on them.
