#!/usr/bin/env bash
# Publish the coming-soon page at https://guestnote.be (and www).
#
# S3 (eu-central-1, private) -> CloudFront (OAC) -> Route 53 alias records.
#
# Everything lives in eu-central-1 EXCEPT the ACM certificate, which CloudFront
# requires in us-east-1. That is an AWS constraint, not a choice. The cert holds
# no data and costs nothing.
#
# Idempotent: re-running reuses the bucket, cert and distribution, re-uploads the
# page and issues an invalidation.

set -euo pipefail

# The default profile on this machine is the Realo work account. Guestnote is a
# separate business, so pin the profile and refuse to run anywhere else.
export AWS_PROFILE="${AWS_PROFILE:-guestnote}"
EXPECT_ACCOUNT="${EXPECT_ACCOUNT:-929219061071}"

REGION="${REGION:-eu-central-1}"
DOMAIN="${DOMAIN:-guestnote.be}"
WWW="www.$DOMAIN"
ZONE_ID="${ZONE_ID:-Z062010620FZZT8M58C8Q}"
CF_ZONE="Z2FDTNDATAQYW2"          # fixed, global: CloudFront's hosted zone for aliases
CACHING_OPTIMIZED="658327ea-f89d-4fab-a63d-7e88639e58f6"   # AWS managed cache policy

ACCOUNT="$(aws sts get-caller-identity --query Account --output text)"
if [[ "$ACCOUNT" != "$EXPECT_ACCOUNT" ]]; then
  echo "REFUSING TO DEPLOY." >&2
  echo "  AWS_PROFILE=$AWS_PROFILE resolves to $ACCOUNT, expected $EXPECT_ACCOUNT (guestnote)" >&2
  echo "  Intentional? EXPECT_ACCOUNT=$ACCOUNT $0" >&2
  exit 1
fi
BUCKET="${BUCKET:-guestnote-be-site-$ACCOUNT}"
HERE="$(cd "$(dirname "$0")" && pwd)"
say() { printf '\n\033[36m==>\033[0m %s\n' "$1"; }
echo "account $ACCOUNT · profile $AWS_PROFILE · region $REGION"

# ------------------------------------------------------------------- S3 -------
say "S3 bucket: $BUCKET ($REGION, private)"
if ! aws s3api head-bucket --bucket "$BUCKET" 2>/dev/null; then
  aws s3api create-bucket --bucket "$BUCKET" --region "$REGION" \
    --create-bucket-configuration "LocationConstraint=$REGION" >/dev/null
  echo "created"
else
  echo "exists, reusing"
fi
aws s3api put-public-access-block --bucket "$BUCKET" \
  --public-access-block-configuration \
  "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=false,RestrictPublicBuckets=false" >/dev/null

say "Rendering og.png (1200x630 share image)"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
if [[ -x "$CHROME" ]]; then
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
    --virtual-time-budget=1500 --window-size=1200,630 \
    --screenshot="$HERE/og.png" "file://$HERE/og.html" >/dev/null 2>&1 && echo "rendered from og.html"
else
  echo "Chrome not found, keeping the existing og.png"
fi

say "Generating sitemap.xml"
cat > "$HERE/sitemap.xml" <<XML
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://$DOMAIN/</loc>
    <lastmod>$(date +%F)</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>
XML
echo "lastmod $(date +%F)"

say "Uploading"
aws s3 cp "$HERE/index.html" "s3://$BUCKET/index.html" \
  --content-type "text/html; charset=utf-8" --cache-control "public, max-age=300" >/dev/null
aws s3 cp "$HERE/robots.txt" "s3://$BUCKET/robots.txt" \
  --content-type "text/plain; charset=utf-8" --cache-control "public, max-age=3600" >/dev/null
aws s3 cp "$HERE/sitemap.xml" "s3://$BUCKET/sitemap.xml" \
  --content-type "application/xml; charset=utf-8" --cache-control "public, max-age=3600" >/dev/null
aws s3 cp "$HERE/og.png" "s3://$BUCKET/og.png" \
  --content-type "image/png" --cache-control "public, max-age=86400" >/dev/null
echo "index.html, robots.txt, sitemap.xml, og.png"

# ------------------------------------------------------------------ ACM -------
say "Certificate for $DOMAIN + $WWW (us-east-1 — required by CloudFront)"
CERT_ARN="$(aws acm list-certificates --region us-east-1 \
  --query "CertificateSummaryList[?DomainName=='$DOMAIN'].CertificateArn | [0]" --output text)"
if [[ "$CERT_ARN" == "None" || -z "$CERT_ARN" ]]; then
  CERT_ARN="$(aws acm request-certificate --region us-east-1 \
    --domain-name "$DOMAIN" --subject-alternative-names "$WWW" \
    --validation-method DNS --query CertificateArn --output text)"
  echo "requested $CERT_ARN"
else
  echo "reusing $CERT_ARN"
fi

say "Writing DNS validation records"
for i in $(seq 1 20); do
  RECORDS="$(aws acm describe-certificate --region us-east-1 --certificate-arn "$CERT_ARN" \
    --query "Certificate.DomainValidationOptions[?ResourceRecord!=null].ResourceRecord" --output json)"
  [[ "$(python3 -c "import json,sys;print(len(json.load(sys.stdin)))" <<<"$RECORDS")" -ge 1 ]] && break
  sleep 3
done
python3 - "$RECORDS" > /tmp/gn-val.json <<'PY'
import json,sys
recs={ (r["Name"],r["Value"]) for r in json.loads(sys.argv[1]) }   # dedupe: apex+www often share one
print(json.dumps({"Comment":"ACM validation","Changes":[
  {"Action":"UPSERT","ResourceRecordSet":{"Name":n,"Type":"CNAME","TTL":300,
   "ResourceRecords":[{"Value":v}]}} for n,v in sorted(recs)]}))
PY
aws route53 change-resource-record-sets --hosted-zone-id "$ZONE_ID" \
  --change-batch "file:///tmp/gn-val.json" >/dev/null
echo "written; waiting for issuance (usually 1-4 min)"
aws acm wait certificate-validated --region us-east-1 --certificate-arn "$CERT_ARN"
echo "certificate ISSUED"

# ----------------------------------------------------------- CloudFront -------
say "Origin access control"
OAC_ID="$(aws cloudfront list-origin-access-controls \
  --query "OriginAccessControlList.Items[?Name=='$BUCKET'].Id | [0]" --output text 2>/dev/null || echo None)"
if [[ "$OAC_ID" == "None" || -z "$OAC_ID" ]]; then
  OAC_ID="$(aws cloudfront create-origin-access-control --origin-access-control-config \
    "Name=$BUCKET,Description=guestnote coming-soon,SigningProtocol=sigv4,SigningBehavior=always,OriginAccessControlOriginType=s3" \
    --query OriginAccessControl.Id --output text)"
  echo "created $OAC_ID"
else
  echo "reusing $OAC_ID"
fi

say "CloudFront distribution"
DIST_ID="$(aws cloudfront list-distributions \
  --query "DistributionList.Items[?contains(Aliases.Items, '$DOMAIN')].Id | [0]" --output text 2>/dev/null || echo None)"
if [[ "$DIST_ID" == "None" || -z "$DIST_ID" ]]; then
  python3 - "$BUCKET" "$REGION" "$OAC_ID" "$CERT_ARN" "$DOMAIN" "$WWW" "$CACHING_OPTIMIZED" > /tmp/gn-dist.json <<'PY'
import json,sys
bucket,region,oac,cert,domain,www,cache=sys.argv[1:8]
print(json.dumps({
 "CallerReference": f"{bucket}-coming-soon",
 "Comment": "guestnote.be coming soon",
 "Enabled": True,
 "DefaultRootObject": "index.html",
 "Aliases": {"Quantity":2,"Items":[domain,www]},
 "PriceClass": "PriceClass_100",          # NA + Europe: the audience is Belgian
 "HttpVersion": "http2and3",
 "IsIPV6Enabled": True,
 "Origins": {"Quantity":1,"Items":[{
    "Id":"s3-origin",
    "DomainName": f"{bucket}.s3.{region}.amazonaws.com",
    "OriginAccessControlId": oac,
    "S3OriginConfig":{"OriginAccessIdentity":""},
    "OriginShield":{"Enabled":False},
    "ConnectionAttempts":3,"ConnectionTimeout":10,
    "CustomHeaders":{"Quantity":0}}]},
 "DefaultCacheBehavior": {
    "TargetOriginId":"s3-origin",
    "ViewerProtocolPolicy":"redirect-to-https",
    "AllowedMethods":{"Quantity":2,"Items":["GET","HEAD"],
      "CachedMethods":{"Quantity":2,"Items":["GET","HEAD"]}},
    "Compress":True,
    "CachePolicyId":cache},
 # A holding page should answer on any path rather than showing an S3 error.
 "CustomErrorResponses":{"Quantity":2,"Items":[
    {"ErrorCode":403,"ResponseCode":"200","ResponsePagePath":"/index.html","ErrorCachingMinTTL":10},
    {"ErrorCode":404,"ResponseCode":"200","ResponsePagePath":"/index.html","ErrorCachingMinTTL":10}]},
 "ViewerCertificate":{"ACMCertificateArn":cert,"SSLSupportMethod":"sni-only",
    "MinimumProtocolVersion":"TLSv1.2_2021","CertificateSource":"acm"},
}))
PY
  DIST_ID="$(aws cloudfront create-distribution \
    --distribution-config "file:///tmp/gn-dist.json" --query Distribution.Id --output text)"
  echo "created $DIST_ID"
else
  echo "reusing $DIST_ID"
fi
DIST_DOMAIN="$(aws cloudfront get-distribution --id "$DIST_ID" --query Distribution.DomainName --output text)"

say "Bucket policy: only this distribution may read"
python3 - "$BUCKET" "$ACCOUNT" "$DIST_ID" > /tmp/gn-bucket.json <<'PY'
import json,sys
bucket,account,dist=sys.argv[1:4]
print(json.dumps({"Version":"2012-10-17","Statement":[{
 "Sid":"AllowCloudFrontServicePrincipal","Effect":"Allow",
 "Principal":{"Service":"cloudfront.amazonaws.com"},
 "Action":"s3:GetObject","Resource":f"arn:aws:s3:::{bucket}/*",
 "Condition":{"StringEquals":{"AWS:SourceArn":f"arn:aws:cloudfront::{account}:distribution/{dist}"}}}]}))
PY
aws s3api put-bucket-policy --bucket "$BUCKET" --policy "file:///tmp/gn-bucket.json"
echo "applied"

# ------------------------------------------------------------- Route 53 -------
say "DNS: alias $DOMAIN and $WWW -> $DIST_DOMAIN"
python3 - "$DOMAIN" "$WWW" "$DIST_DOMAIN" "$CF_ZONE" > /tmp/gn-dns.json <<'PY'
import json,sys
domain,www,target,cfzone=sys.argv[1:5]
print(json.dumps({"Comment":"coming soon","Changes":[
 {"Action":"UPSERT","ResourceRecordSet":{"Name":n,"Type":t,
   "AliasTarget":{"HostedZoneId":cfzone,"DNSName":target,"EvaluateTargetHealth":False}}}
 for n in (domain,www) for t in ("A","AAAA")]}))
PY
aws route53 change-resource-record-sets --hosted-zone-id "$ZONE_ID" \
  --change-batch "file:///tmp/gn-dns.json" >/dev/null
echo "4 alias records upserted (A + AAAA, apex + www)"

say "Error responses: unknown paths must answer 404, not 200"
CUR="$(aws cloudfront get-distribution-config --id "$DIST_ID")"
if [[ "$(python3 -c 'import json,sys;d=json.load(sys.stdin)["DistributionConfig"]["CustomErrorResponses"]["Items"];print(all(i.get("ResponseCode")=="404" for i in d))' <<<"$CUR")" != "True" ]]; then
  ETAG="$(python3 -c 'import json,sys;print(json.load(sys.stdin)["ETag"])' <<<"$CUR")"
  python3 -c '
import json,sys
c=json.load(sys.stdin)["DistributionConfig"]
for i in c["CustomErrorResponses"]["Items"]: i["ResponseCode"]="404"
print(json.dumps(c))' <<<"$CUR" > /tmp/gn-cfg.json
  aws cloudfront update-distribution --id "$DIST_ID" --if-match "$ETAG" \
    --distribution-config "file:///tmp/gn-cfg.json" >/dev/null
  rm -f /tmp/gn-cfg.json
  echo "updated to 404"
else
  echo "already 404"
fi

aws cloudfront create-invalidation --distribution-id "$DIST_ID" \
  --paths "/" "/index.html" "/robots.txt" "/sitemap.xml" "/og.png" >/dev/null
rm -f /tmp/gn-val.json /tmp/gn-dist.json /tmp/gn-bucket.json /tmp/gn-dns.json

cat <<DONE

──────────────────────────────────────────────────────────────────
  https://$DOMAIN   (and https://$WWW)

  distribution  $DIST_ID  ($DIST_DOMAIN)
  bucket        $BUCKET  ($REGION, private, OAC only)
  certificate   us-east-1 (CloudFront requirement)

  A new distribution takes ~5-10 min to reach Deployed. Check:
    aws cloudfront get-distribution --id $DIST_ID --query Distribution.Status --output text

  To ship a copy change: re-run this script.
──────────────────────────────────────────────────────────────────
DONE
