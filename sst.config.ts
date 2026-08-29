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

    const web = new sst.aws.Nextjs('Web', {
      path: 'apps/web',
      domain,
      environment: {
        // proxy.ts resolves which surface answers from the Host header, against these two.
        GUESTNOTE_ROOT_DOMAIN: rootDomain,
        GUESTNOTE_APP_SUBDOMAIN: 'app',
        DATABASE_URL: secret('DATABASE_URL'),
        BETTER_AUTH_SECRET: secret('BETTER_AUTH_SECRET'),
        GOOGLE_CLIENT_ID: secret('GOOGLE_CLIENT_ID'),
        GOOGLE_CLIENT_SECRET: secret('GOOGLE_CLIENT_SECRET'),
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
