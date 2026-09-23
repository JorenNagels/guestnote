/// <reference path="./sst-env.d.ts" />

/**
 * Guestnote hosting -- milestone M1a. One Next app, three surfaces, deployed with SST v3
 * (`sst.aws.Nextjs`, which wraps OpenNext on Lambda + CloudFront + S3).
 *
 * ## Why SST, and not the hand-rolled CDK two-stack of research/05-architecture.md section 8
 *
 * Section 2 of that document names this exact escape hatch: *"If the OpenNext plumbing eats
 * more than one weekend, switch wholesale to SST v3."* Two environments (`production` and
 * `staging`) were wanted from day one -- see the correction note added to section 8 -- and
 * with SST that is one branch of config rather than a second parameterised CDK app plus its
 * own pipeline. The accepted cost: SST v3 runs on a Pulumi engine, not CloudFormation, so
 * the FoundationStack / AppStack split and `infra/mail-events.yaml`'s "absorbed into it
 * later" plan are both dropped. `infra/*.yaml` stay plain CloudFormation.
 *
 * ## What this file deliberately does NOT own
 *
 *  - **The `guestnote.be` Route 53 zone** and its `MX` / `TXT` / DKIM records (ADR 0002,
 *    ADR 0005). `production` below uses `dns: false`, so SST never writes to that zone. The
 *    apex `A`/`AAAA` cutover is a deliberate manual `change-resource-record-sets` batch --
 *    CLAUDE.md invariant 12: Route 53 replaces a whole record set on write and the apex
 *    `TXT` carries three load-bearing values. `infra/README.md` has the batch and the
 *    read-first rule.
 *  - **The us-east-1 ACM certificate for `production`.** `dns: false` gives SST no way to
 *    DNS-validate a certificate it creates, so it is requested once by hand (infra/README.md)
 *    and its ARN read from SSM below. `staging` is all-new DNS, so SST creates and validates
 *    that certificate itself.
 *  - **Secrets.** They live in SSM at `/guestnote/<stage>/*` -- the contract
 *    `apps/web/src/env.ts` documents -- and are read here at deploy time, never committed.
 *
 * ## Staging
 *
 * `staging` serves `staging.guestnote.be` and `*.staging.guestnote.be`, all new names, so
 * SST manages it end to end: `sst.aws.dns` writes the certificate-validation records and the
 * `A`/`AAAA` aliases and nothing pre-existing is touched. It points at its own Neon branch
 * (a copy-on-write clone of prod data) -- the web app is throwaway, the data is not shared
 * with production.
 */

export default $config({
  app(input) {
    return {
      name: 'guestnote',
      // Retain prod resources on `sst remove`; staging and any personal stage are
      // disposable. `protect` additionally refuses `sst remove` on production outright.
      removal: input.stage === 'production' ? 'retain' : 'remove',
      protect: input.stage === 'production',
      home: 'aws',
      providers: {
        aws: {
          region: 'eu-central-1',
          // Locally, pin the profile so a deploy cannot land in the employer's shared
          // production account -- the same guard `infra/deploy.sh` uses. In CI the
          // credentials arrive from GitHub OIDC and there is no profile to name.
          ...(process.env.CI ? {} : { profile: 'guestnote' }),
        },
      },
    }
  },

  async run() {
    const stage = $app.stage
    const isProd = stage === 'production'

    // The hosted-zone id for guestnote.be. Read from SSM so this file carries no account
    // specifics -- set once with
    //   aws ssm put-parameter --name /guestnote/shared/HOSTED_ZONE_ID --type String --value Z...
    const zoneId = aws.ssm.getParameterOutput({ name: '/guestnote/shared/HOSTED_ZONE_ID' }).value

    // Per-stage secret, SecureString. `withDecryption` returns the plaintext for injection
    // as a Lambda environment variable, which is how `apps/web/src/env.ts` consumes it.
    //
    // `getParameterOutput` (not `getParameter`) keeps the value a secret-marked Pulumi
    // Output: encrypted in the SST state bucket, rendered as `[secret]` in CLI output.
    // Do not switch to `getParameter` or string-interpolate `.value` -- that drops the
    // marking.
    //
    // A missing parameter fails `sst deploy` at plan time rather than degrading. That
    // inverts `env.ts`'s "safe by omission" for the two Google keys (unset -> no button,
    // never a broken one) -- but in a *deployed* stage that graceful path has no value:
    // every stage is expected to carry all five secrets, and failing the deploy is a
    // better signal than shipping a stage with silent gaps. The reject: a `try`/default
    // wrapper per key, which trades a loud precondition for a quiet one.
    const secret = (name: string) =>
      aws.ssm.getParameterOutput({
        name: `/guestnote/${stage}/${name}`,
        withDecryption: true,
      }).value

    // Non-prod stages are their own registrable sub-tree, which is what makes
    // `app.<stage>.guestnote.be` and `<slug>.<stage>.guestnote.be` take the same proxy.ts
    // branches production does.
    const rootDomain = isProd ? 'guestnote.be' : `${stage}.guestnote.be`

    const domain = isProd
      ? {
          name: 'guestnote.be',
          // One wildcard SAN covers app., www. and every tenant slug. The apex is the
          // second name on the by-hand certificate.
          aliases: ['*.guestnote.be'],
          // No apex cutover here -- see the file header. SST provisions the CloudFront
          // distribution and its alternate names; DNS is pointed at it by hand.
          dns: false,
          cert: aws.ssm.getParameterOutput({
            name: '/guestnote/production/ACM_CERT_ARN',
          }).value,
        }
      : {
          name: rootDomain,
          aliases: [`*.${rootDomain}`],
          // Cost, stated: this gives SST (and the CI deploy role) write access to the
          // shared `guestnote.be` zone that CLAUDE.md invariant 12 exists to protect. The
          // safety rests entirely on SST only ever creating `*.<stage>.guestnote.be` and
          // `_acme` names here -- it never touches the apex `A`/`TXT`/`MX`. The reject:
          // a dedicated `staging.guestnote.be` delegated zone, which is more moving parts
          // for a throwaway environment.
          dns: sst.aws.dns({ zone: zoneId }),
        }

    // The planner app's `app.` host, named once because both the env var below and the bucket's
    // CORS rule must agree on it.
    const appSubdomain = 'app'

    /**
     * Private files bucket -- planner files and the moodboard (spec 0003, `packages/storage`).
     *
     * **Private, and it stays so.** No `access`, so SST leaves the public-access block on and
     * the bucket policy only enforces HTTPS. Nothing reads or writes an object except by a
     * presigned URL that `packages/storage` signs with the server function's role, five
     * minutes at a time. The alternatives rejected: `access: 'cloudfront'` (a cacheable public
     * URL for a document that may be a contract), and a Lambda proxy for uploads (Lambda's 6 MB
     * body limit is smaller than a phone photo).
     *
     * **CORS is for the browser's direct PUT and nothing else.** Origin is the app host only,
     * because that is the one page that uploads -- SST's default is `*` on every method, which
     * would let any site a planner visits drive a presigned URL it had somehow obtained. GET is
     * not listed: an `<img src>` or a download link is not a CORS request. `content-type` is the
     * one non-safelisted header the browser sends; `Content-Length` it sets itself and never
     * appears in the preflight. `etag` is exposed for a future multipart upload.
     *
     * Localhost is allowed on non-production stages only, so `npm run dev` can upload to a
     * deployed staging bucket without a second bucket per laptop.
     *
     * Retention follows the app: `removal: 'retain'` and `protect` on production (top of file),
     * and SST's own `forceDestroy` on the rest, so a personal stage can be removed with files
     * in it. Versioning is off: every key is a fresh UUID, so no upload ever overwrites one.
     *
     * Not deployed by whoever wrote this. `sst diff --stage staging` first (infra/README.md).
     */
    const files = new sst.aws.Bucket('Files', {
      cors: {
        allowOrigins: [
          `https://${appSubdomain}.${rootDomain}`,
          ...(isProd ? [] : [`http://${appSubdomain}.guestnote.localhost:3000`]),
        ],
        allowMethods: ['PUT'],
        allowHeaders: ['content-type'],
        exposeHeaders: ['etag'],
        maxAge: '1 day',
      },
    })

    const web = new sst.aws.Nextjs('Web', {
      path: 'apps/web',
      domain,
      // The server function sends sign-in codes through SES (packages/email/src/ses.ts,
      // SendEmailCommand -> the `ses:SendEmail` action). `sst.aws.Nextjs` grants nothing
      // for SES by default, so before this line every send failed with
      // AccessDeniedException before it left the account -- measured on staging 2026-08-29,
      // the sign-in form reporting success while no mail was ever attempted.
      //
      // `resources: ['*']` rather than the identity ARN: SES sandbox plus per-identity
      // verification already decide what can actually be sent (ADR 0002), the account has
      // one sending identity, and pinning the ARN here would drag the account id into a
      // file that otherwise reads every account specific from SSM. Scope it down if a
      // second identity ever exists.
      permissions: [
        { actions: ['ses:SendEmail'], resources: ['*'] },
        // Presigning is a local signature made with the role's own credentials, and S3 checks
        // the *signer's* permissions when the URL is used -- so without these two actions every
        // presigned URL is valid-looking and answers 403. Objects only, this one bucket, and no
        // `s3:ListBucket` or `s3:DeleteObject`: the app cannot enumerate or remove files yet.
        {
          actions: ['s3:PutObject', 's3:GetObject'],
          resources: [$interpolate`${files.arn}/*`],
        },
      ],
      environment: {
        // proxy.ts resolves which surface answers from the Host header, against these two.
        GUESTNOTE_ROOT_DOMAIN: rootDomain,
        GUESTNOTE_APP_SUBDOMAIN: appSubdomain,
        // Name only, not a secret. apps/web/src/env.ts reads it and `lib/storage.ts` composes
        // `createS3Transport` from it; unset there is an error outside development.
        GUESTNOTE_FILES_BUCKET: files.name,
        DATABASE_URL: secret('DATABASE_URL'),
        BETTER_AUTH_SECRET: secret('BETTER_AUTH_SECRET'),
        GOOGLE_CLIENT_ID: secret('GOOGLE_CLIENT_ID'),
        GOOGLE_CLIENT_SECRET: secret('GOOGLE_CLIENT_SECRET'),
        // Unset means error reporting is off -- env.ts states the rule. Read from SSM like
        // the rest, even though a DSN is a write-only ingest URL and not really a secret:
        // one place to look for "what is configured here" beats two.
        SENTRY_DSN: secret('SENTRY_DSN'),
        // GUESTNOTE_MAIL_TRANSPORT is deliberately unset: lib/mailer.ts resolves an unset
        // value to `ses` in a deployed environment, which is the safe direction. AWS_REGION
        // is injected by the Lambda runtime; env.ts defaults it anyway.
      },
      server: {
        // research/05-architecture.md section 2: ARM64 + 1536 MB is the cold-start
        // mitigation (more memory -> more CPU -> shorter, often cheaper, invocations).
        //
        // nodejs22.x, not 24: SST 3.19.3's bundled Pulumi AWS provider (aws-6.66.2) rejects
        // `nodejs24.x` outright ("expected runtime to be one of [...nodejs22.x]"), measured
        // on the first staging deploy 2026-08-29. It does not matter at runtime -- OpenNext
        // ships the app as esbuild-bundled JS, so the repo's Node 24 floor (native `.ts`
        // type stripping for local dev and tooling) has nothing to do with the Lambda. Move
        // to 24 when an SST/provider bump supports it.
        runtime: 'nodejs22.x',
        architecture: 'arm64',
        memory: '1536 MB',
      },
      transform: {
        /**
         * JSON logs, so CloudWatch Logs Insights can filter on fields instead of grepping
         * strings.
         *
         * `lib/observability.ts` writes `console.warn('[silent-failure] …', context)` beside
         * every Sentry report, deliberately, because CloudWatch is the sink that still works
         * when the DSN is unset or Sentry is unreachable. In `text` format that context
         * object is a flattened string and the only query available is a substring match; in
         * `json` it is queryable structure, which is the difference between "did enrollment
         * fail" and "how many times, with which reason".
         *
         * ## Why this is in `transform` and not in `server`, where it was
         *
         * **Because `server.logging` is silently dropped.** `SsrSite` builds the server
         * `Function` from an explicit allow-list of `args.server` fields -- `runtime`,
         * `memory`, `architecture`, `install`, `loader`, `layers`, `timeout`, `edge` -- and
         * `logging` is not among them (read off `.sst/platform/src/components/aws/ssr-site.ts`
         * in SST 3.19.3, 2026-09-01). It was set there from 2026-08-29, and the deployed
         * function reported `LogFormat: "Text"` throughout; a commit message claiming JSON
         * logs were in effect was wrong.
         *
         * The `retention` half looked like it had applied, and that was a coincidence rather
         * than evidence: `Function`'s own default is `{ retention: "1 month", format: "text" }`,
         * so the value we asked for was the value we would have got anyway. Two settings, one
         * passed through by accident and one dropped, is exactly the shape that makes a
         * silent failure read as a working feature.
         *
         * `transform.server` reaches the `Function` args directly, where `logging.format`
         * *is* honoured (`logFormat: "JSON"`). Verify after a deploy, do not assume:
         * `aws lambda get-function-configuration --function-name <fn> --query LoggingConfig`.
         *
         * Retention is stated rather than left implicit even though it matches the default:
         * a future SST changing its default must not quietly change ours. Not shortened --
         * the failure that started this took eleven days to notice, and a two-week window
         * would have aged out half the evidence.
         */
        server: (args) => {
          args.logging = { format: 'json', retention: '1 month' }
        },
      },
      // Warmer OFF for now. The dashboard is the only warm-path consumer and a ~1 s cold
      // start is acceptable for an invite-only tester audience; keeping it off also keeps
      // the 5-minute poke away from the Neon 100 CU-hours/month free tier, now shared by two
      // branches. The OpenNext warmer never reaches a route -- it short-circuits on a
      // synthetic event -- but `/api/health` does touch the database and must never become
      // the warm target. See apps/web/src/app/api/health/route.ts.
      warm: 0,
    })

    // Surfaced for `npx sst outputs --stage <stage>` -- the production first-deploy step
    // in infra/README.md needs the CloudFront domain to verify against before the apex is
    // cut over.
    return { url: web.url }
  },
})
