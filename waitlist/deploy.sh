#!/usr/bin/env bash
# Deploy the Guestnote waitlist: DynamoDB + SNS + Lambda Function URL.
#
# Everything created here sits inside AWS perpetual free tiers. The one thing
# that must not change: the DynamoDB table is PROVISIONED (1 WCU / 1 RCU).
# The 25 WCU / 25 RCU free tier does not apply to on-demand tables.
#
# Usage:  NOTIFY_EMAIL=you@example.com ./deploy.sh
# Re-running is safe: existing resources are reused, the function code is updated.

set -euo pipefail

REGION="${REGION:-eu-central-1}"
NAME="${NAME:-guestnote-waitlist}"
TABLE="${TABLE:-$NAME}"
TOPIC="${TOPIC:-$NAME}"
ROLE="${ROLE:-$NAME-role}"
ORIGINS="${ORIGINS:-https://guestnote.be,https://www.guestnote.be}"
NOTIFY_EMAIL="${NOTIFY_EMAIL:-}"

if [[ -z "$NOTIFY_EMAIL" ]]; then
  echo "NOTIFY_EMAIL is required — where planner leads get emailed." >&2
  echo "  NOTIFY_EMAIL=you@example.com ./deploy.sh" >&2
  exit 1
fi

# The default AWS profile on this machine is the Realo work account. Guestnote is a
# separate business, so pin the profile and refuse to run anywhere else unless the
# expected account is overridden deliberately.
export AWS_PROFILE="${AWS_PROFILE:-guestnote}"
EXPECT_ACCOUNT="${EXPECT_ACCOUNT:-929219061071}"

ACCOUNT="$(aws sts get-caller-identity --query Account --output text)"
if [[ "$ACCOUNT" != "$EXPECT_ACCOUNT" ]]; then
  echo "REFUSING TO DEPLOY." >&2
  echo "  profile AWS_PROFILE=$AWS_PROFILE resolves to account $ACCOUNT" >&2
  echo "  expected $EXPECT_ACCOUNT (guestnote)" >&2
  echo "  If this is intentional: EXPECT_ACCOUNT=$ACCOUNT ./deploy.sh" >&2
  exit 1
fi
echo "account $ACCOUNT via profile $AWS_PROFILE"

say() { printf '\n\033[36m==>\033[0m %s\n' "$1"; }

# ---------------------------------------------------------------- DynamoDB ----
say "DynamoDB table: $TABLE (provisioned 1/1 — stays in the free tier)"
if ! aws dynamodb describe-table --table-name "$TABLE" --region "$REGION" >/dev/null 2>&1; then
  aws dynamodb create-table \
    --table-name "$TABLE" --region "$REGION" \
    --attribute-definitions AttributeName=email,AttributeType=S \
    --key-schema AttributeName=email,KeyType=HASH \
    --provisioned-throughput ReadCapacityUnits=1,WriteCapacityUnits=1 \
    --table-class STANDARD >/dev/null
  aws dynamodb wait table-exists --table-name "$TABLE" --region "$REGION"
  echo "created"
else
  echo "exists, reusing"
fi

# --------------------------------------------------------------------- SNS ----
say "SNS topic: $TOPIC"
TOPIC_ARN="$(aws sns create-topic --name "$TOPIC" --region "$REGION" --query TopicArn --output text)"
if ! aws sns list-subscriptions-by-topic --topic-arn "$TOPIC_ARN" --region "$REGION" \
      --query "Subscriptions[?Endpoint=='$NOTIFY_EMAIL']" --output text | grep -q .; then
  aws sns subscribe --topic-arn "$TOPIC_ARN" --protocol email \
    --notification-endpoint "$NOTIFY_EMAIL" --region "$REGION" >/dev/null
  echo "subscribed $NOTIFY_EMAIL — CONFIRM THE EMAIL AWS JUST SENT YOU"
else
  echo "already subscribed"
fi

# --------------------------------------------------------------------- IAM ----
say "IAM role: $ROLE"
if ! aws iam get-role --role-name "$ROLE" >/dev/null 2>&1; then
  aws iam create-role --role-name "$ROLE" \
    --assume-role-policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}' >/dev/null
  aws iam attach-role-policy --role-name "$ROLE" \
    --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
  echo "created — waiting for IAM to propagate"
  sleep 12
else
  echo "exists, reusing"
fi

aws iam put-role-policy --role-name "$ROLE" --policy-name "$NAME-access" \
  --policy-document "$(cat <<JSON
{"Version":"2012-10-17","Statement":[
 {"Effect":"Allow","Action":["dynamodb:UpdateItem"],
  "Resource":"arn:aws:dynamodb:$REGION:$ACCOUNT:table/$TABLE"},
 {"Effect":"Allow","Action":["sns:Publish"],"Resource":"$TOPIC_ARN"}]}
JSON
)"
ROLE_ARN="arn:aws:iam::$ACCOUNT:role/$ROLE"

# ------------------------------------------------------------------ Lambda ----
say "Lambda: $NAME"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
cp "$(dirname "$0")/handler.mjs" "$TMP/"
( cd "$TMP" && zip -q fn.zip handler.mjs )

# JSON, not shorthand: ORIGINS contains commas, which shorthand parses as separators.
ORIGINS_JSON="$(python3 -c 'import json,sys;print(json.dumps([x.strip() for x in sys.argv[1].split(",") if x.strip()]))' "$ORIGINS")"
ENVVARS="$(python3 -c 'import json,sys;print(json.dumps({"Variables":{"TABLE":sys.argv[1],"TOPIC_ARN":sys.argv[2],"ALLOWED_ORIGINS":sys.argv[3]}}))' "$TABLE" "$TOPIC_ARN" "$ORIGINS")"
CORS_JSON="$(python3 -c 'import json,sys;print(json.dumps({"AllowOrigins":json.loads(sys.argv[1]),"AllowMethods":["POST"],"AllowHeaders":["content-type"],"MaxAge":86400}))' "$ORIGINS_JSON")"
if aws lambda get-function --function-name "$NAME" --region "$REGION" >/dev/null 2>&1; then
  aws lambda update-function-code --function-name "$NAME" --region "$REGION" \
    --zip-file "fileb://$TMP/fn.zip" >/dev/null
  aws lambda wait function-updated --function-name "$NAME" --region "$REGION"
  aws lambda update-function-configuration --function-name "$NAME" --region "$REGION" \
    --environment "$ENVVARS" >/dev/null
  echo "code + config updated"
else
  aws lambda create-function --function-name "$NAME" --region "$REGION" \
    --runtime nodejs22.x --handler handler.handler --role "$ROLE_ARN" \
    --zip-file "fileb://$TMP/fn.zip" \
    --timeout 10 --memory-size 256 --architectures arm64 \
    --environment "$ENVVARS" >/dev/null
  aws lambda wait function-active --function-name "$NAME" --region "$REGION"
  echo "created"
fi

# Keep logs from quietly becoming the only line on the bill.
aws logs put-retention-policy --log-group-name "/aws/lambda/$NAME" \
  --retention-in-days 14 --region "$REGION" 2>/dev/null || true

# ------------------------------------------------------------ Function URL ----
say "Function URL (public)"
if ! aws lambda get-function-url-config --function-name "$NAME" --region "$REGION" >/dev/null 2>&1; then
  aws lambda create-function-url-config --function-name "$NAME" --region "$REGION" \
    --auth-type NONE \
    --cors "$CORS_JSON" >/dev/null
fi
# BOTH statements are required, and they are separate calls. Since October 2025 a
# NONE-auth function URL needs lambda:InvokeFunctionUrl *and* lambda:InvokeFunction,
# or every request is 403 -- the function is never even invoked.
# Note the different flags: --function-url-auth-type vs --invoked-via-function-url.
# ResourceConflictException just means the statement is already there.
addperm() {  # $1=sid  $2=action  $3=flag...
  local sid="$1" action="$2"; shift 2
  local out
  if ! out="$(aws lambda add-permission --function-name "$NAME" --region "$REGION" \
        --statement-id "$sid" --action "$action" --principal '*' "$@" 2>&1)"; then
    if ! grep -q ResourceConflictException <<<"$out"; then
      echo "$out" >&2; return 1
    fi
    echo "  $sid: already present"
  else
    echo "  $sid: added"
  fi
}
addperm AllowPublicFunctionUrl  lambda:InvokeFunctionUrl --function-url-auth-type NONE
addperm UrlPolicyInvokeFunction lambda:InvokeFunction    --invoked-via-function-url

URL="$(aws lambda get-function-url-config --function-name "$NAME" --region "$REGION" \
        --query FunctionUrl --output text)"

cat <<DONE

──────────────────────────────────────────────────────────────────
  Endpoint: $URL

  1. Confirm the SNS subscription email AWS sent to $NOTIFY_EMAIL
  2. Put the endpoint in coming-soon/index.html:
       var ENDPOINT = "$URL";
  3. Re-upload index.html and invalidate CloudFront

  Read the list:
    aws dynamodb scan --table-name $TABLE --region $REGION \\
      --query 'Items[].[email.S,planner.BOOL,lang.S,createdAt.S]' --output table
──────────────────────────────────────────────────────────────────
DONE
