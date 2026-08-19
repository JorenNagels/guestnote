#!/usr/bin/env bash
# Deploy infra/mail-events.yaml: SES bounce and complaint events -> SNS -> your inbox.
#
# Everything created here is free: SNS charges nothing for email delivery, and SES
# event publishing is not billed.
#
# Usage:  NOTIFY_EMAIL=you@example.com ./infra/deploy.sh
# Re-running is safe -- `cloudformation deploy` computes a change set, and reports
# "No changes to deploy" when there are none.
#
# AFTER THE FIRST RUN: AWS sends a subscription confirmation link to NOTIFY_EMAIL and
# delivers nothing until it is clicked. docs/adr/0002 records the same trap catching the
# verified sending identity, which sat unconfirmed for two days.

set -euo pipefail

REGION="${REGION:-eu-central-1}"
STACK="${STACK:-guestnote-mail-events}"
TEMPLATE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/mail-events.yaml"
CONFIG_SET="${CONFIG_SET:-guestnote-default}"
NOTIFY_EMAIL="${NOTIFY_EMAIL:-}"

if [[ -z "$NOTIFY_EMAIL" ]]; then
  echo "NOTIFY_EMAIL is required -- where bounce and complaint notifications go." >&2
  echo "  NOTIFY_EMAIL=you@example.com ./infra/deploy.sh" >&2
  exit 1
fi

# The default AWS profile on this machine is the employer's shared production account.
# Guestnote is a separate business, so pin the profile and refuse to run anywhere else
# unless the expected account is overridden deliberately. Same guard as
# waitlist/deploy.sh and coming-soon/deploy.sh.
export AWS_PROFILE="${AWS_PROFILE:-guestnote}"
EXPECT_ACCOUNT="${EXPECT_ACCOUNT:-929219061071}"

ACCOUNT="$(aws sts get-caller-identity --query Account --output text)"
if [[ "$ACCOUNT" != "$EXPECT_ACCOUNT" ]]; then
  echo "REFUSING TO DEPLOY." >&2
  echo "  profile AWS_PROFILE=$AWS_PROFILE resolves to account $ACCOUNT" >&2
  echo "  expected $EXPECT_ACCOUNT (guestnote)" >&2
  echo "  If this is intentional: EXPECT_ACCOUNT=$ACCOUNT ./infra/deploy.sh" >&2
  exit 1
fi
echo "account $ACCOUNT via profile $AWS_PROFILE"

say() { printf '\n\033[36m==>\033[0m %s\n' "$1"; }

# The template attaches an event destination to a configuration set it does not own. If
# that set is missing, CloudFormation fails partway through -- after creating the topic --
# which leaves a stack in ROLLBACK and an error that does not name the real cause. Check
# first and say so plainly.
say "checking the $CONFIG_SET configuration set exists"
if ! aws sesv2 get-configuration-set \
  --configuration-set-name "$CONFIG_SET" --region "$REGION" >/dev/null 2>&1; then
  echo "SES configuration set '$CONFIG_SET' does not exist in $REGION." >&2
  echo "  docs/adr/0002-ses-setup-and-production-access.md says it was created by hand." >&2
  echo "  Create it before deploying:" >&2
  echo "    aws sesv2 create-configuration-set --configuration-set-name $CONFIG_SET \\" >&2
  echo "      --region $REGION --reputation-options ReputationMetricsEnabled=true" >&2
  exit 1
fi
echo "exists"

say "deploying stack $STACK"
# No --capabilities: an SNS topic policy is a resource policy, not an IAM identity, so
# nothing here needs CAPABILITY_IAM.
aws cloudformation deploy \
  --template-file "$TEMPLATE" \
  --stack-name "$STACK" \
  --region "$REGION" \
  --no-fail-on-empty-changeset \
  --parameter-overrides \
  "NotifyEmail=$NOTIFY_EMAIL" \
  "ConfigurationSetName=$CONFIG_SET"

say "done"
aws cloudformation describe-stacks \
  --stack-name "$STACK" --region "$REGION" \
  --query 'Stacks[0].Outputs' --output table

cat <<EOF

Next:
  1. Click the confirmation link AWS just emailed to $NOTIFY_EMAIL.
     Nothing is delivered until you do.
  2. Prove the path end to end with the SES mailbox simulator, which does not
     consume the sandbox's 200/day quota:

       aws sesv2 send-email --region $REGION \\
         --from-email-address 'noreply@guestnote.be' \\
         --destination 'ToAddresses=bounce@simulator.amazonses.com' \\
         --configuration-set-name $CONFIG_SET \\
         --content 'Simple={Subject={Data=probe,Charset=UTF-8},Body={Text={Data=probe,Charset=UTF-8}}}'

     A BOUNCE notification should arrive within a minute. Swap the address for
     complaint@simulator.amazonses.com to exercise the other one.
EOF
