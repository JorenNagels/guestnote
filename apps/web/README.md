# `@guestnote/web`

One Next.js 16 app, three surfaces, one deploy. The reasoning is in
`docs/adr/0003-one-app-three-hosts.md`; this file is how to run it.

## Local setup

```bash
nvm use                      # 24.19.0. `engines` requires >=24 <25.
npm install
ln -sfn ../../.env.local apps/web/.env.local   # already done; see below
npm run dev                  # from the repo root
```

**The env symlink is load-bearing.** Next loads `.env.local` from the *app* directory, not
the monorepo root, so `apps/web/.env.local` is a symlink to the root file. That keeps one
copy of the database credentials rather than two. It is gitignored by the root `.env.*`
rule. If `/api/health` reports `DATABASE_URL is not set`, the symlink is missing.

## The hosts

`guestnote.localhost` is the default and needs no DNS or `/etc/hosts`: Chrome, Edge and
Firefox resolve any `*.localhost` to loopback (RFC 6761). It also wins on a second count —
every `*.localhost` name is a *potentially trustworthy origin*, so `Secure` and therefore
`__Host-` prefixed cookies work over plain http.

**Why the `guestnote.` label, since 2026-08-19.** This used to be plain `localhost`, on the
grounds that it kept "dev and production cookie handling identical". Only half of that was
ever true. The `Secure` half holds. Same-site does not: SameSite is computed on the
*registrable domain*, `localhost` is its own public suffix, so `localhost` and `app.localhost`
are **cross-site** to a browser and a `SameSite=Lax` cookie will not travel between them —
while `guestnote.be` and `app.guestnote.be` share `guestnote.be` and it does. With the extra
label both local hosts share `guestnote.localhost`, and dev matches production on both counts.
That is what makes the apex's signed-in probe (`app/api/session-hint/route.ts`) testable
locally at all. `src/env.ts` carries the measurement.

| URL | Surface |
|---|---|
| `http://guestnote.localhost:3000/` | apex → 308 → `/nl` |
| `http://guestnote.localhost:3000/{nl,en,fr}` | marketing |
| `http://app.guestnote.localhost:3000/` | the dashboard |
| `http://pro.guestnote.localhost:3000/…` | 308 → `app.guestnote.localhost:3000` |
| `http://els-en-jan.guestnote.localhost:3000/` | guest site — 404 until PH4 |
| `http://app.guestnote.localhost:3000/api/health` | RLS armed? |

**Safari on macOS does not resolve `*.localhost`.** When Safari or iOS testing matters, add
fixed names to `/etc/hosts` under `guestnote.test` (RFC 6761-reserved, can never resolve
publicly — unlike `.dev`, which is HSTS-preloaded, or `.local`, which is mDNS) and set
`GUESTNOTE_ROOT_DOMAIN=guestnote.test`. Note the consequence: `guestnote.test` over http is
*not* a trustworthy origin, so `__Host-` cookies break there and it needs `mkcert`. That
trade is why `.localhost` is the default.

PH4 needs arbitrary tenant labels, which means dnsmasq (`address=/guestnote.test/127.0.0.1`)
or a wildcard-DNS service. Because the root domain is one env var and `resolveHost` is a pure
function, that is a one-line change with no code path behind it.

### Former wart: `www` no longer loops locally

**Fixed as a side effect of the root-domain change above, measured 2026-08-19.** Next collapses
a proxy `Location` header to a relative path when it matches the origin Next assumes for itself
— the bound address, not the `Host` header. Under a plain `localhost` root domain the `www`
redirect targeted `localhost:3000`, which *is* that origin, so it became `Location: /` and
looped forever.

`guestnote.localhost:3000` is not the bound origin, so the collapse cannot trigger:

```bash
curl -sI -H 'Host: www.guestnote.localhost:3000' http://127.0.0.1:3000/
# location: http://guestnote.localhost:3000/   — absolute, and it resolves in 2 hops to /nl
```

The underlying Next behaviour is unchanged and still worth knowing about; ADR 0003 §8 has the
original measurement. **Do not "fix" anything by reaching for `nextUrl`** — behind CloudFront
`nextUrl.host` is the *origin's* hostname, so cloning it would leak the Function URL.

## Verifying a change

```bash
npm run check                            # typecheck (all workspaces) + Biome + unit tests
npm run test:db                          # the gate. Needs the Neon env; see packages/db/README.md
npm run build -w @guestnote/web          # must print "✓ Finished TypeScript"
```

The host matrix, against `npm run start` rather than `npm run dev` — **dev overwrites
`Cache-Control`, so cache assertions are only meaningful in production mode:**

```bash
curl -sI http://guestnote.localhost:3000/                    # 308 -> /nl
curl -sI http://guestnote.localhost:3000/nl                  # 200, public, s-maxage=60, swr=86400
curl -sI http://guestnote.localhost:3000/xx                  # 404 — [locale] is a catch-all; proxy guards it
curl -sI http://app.guestnote.localhost:3000/                # 200, private, no-store
curl -sI http://pro.guestnote.localhost:3000/weddings        # 308 -> http://app.guestnote.localhost:3000/weddings
curl -sI http://guestnote.localhost:3000/pro                 # 404 — rewrite target unreachable from outside
curl -sI http://guestnote.localhost:3000/sites/els-en-jan    # 404 — the guard that matters most
curl -sI http://els-en-jan.guestnote.localhost:3000/         # 404 from the sites stub, NOT the marketing page
curl -sI http://admin.guestnote.localhost:3000/              # 404 — reserved subdomain
curl -sI -H 'x-forwarded-host: app.guestnote.localhost' http://guestnote.localhost:3000/   # 200 — the CloudFront path
curl -s   http://app.guestnote.localhost:3000/api/health     # ok: true, app_user, bypassRls false
curl -sI  http://guestnote.localhost:3000/api/health         # 404 — no public API
```

Production hostnames can be exercised locally, which is how the `www` branch and the
absolute-`Location` behaviour were verified:

```bash
GUESTNOTE_ROOT_DOMAIN=guestnote.be npm run start -w @guestnote/web
curl -sI -H 'x-forwarded-host: www.guestnote.be' -H 'x-forwarded-proto: https' http://guestnote.localhost:3000/
# location: https://guestnote.be/
```

### The standalone artefact

Worth running before any deploy work — it is the only check that proves the TypeScript-source
workspace packages and the Neon driver actually made it into what ships:

```bash
npm run build -w @guestnote/web
cp -r apps/web/.next/static apps/web/.next/standalone/apps/web/.next/
(set -a; . ./.env.local; set +a; cd apps/web/.next/standalone/apps/web && node server.js)
curl -s http://app.guestnote.localhost:3000/api/health
```

Note the output lands at `.next/standalone/apps/web/server.js`, not
`.next/standalone/server.js`, because `outputFileTracingRoot` points at the monorepo root.

## `/api/health` is not a liveness probe

It answers "is RLS still armed in production", which is the thing worth being paged about.
It runs `withUser(db, NIL_UUID, …)` and requires `current_user = 'app_user'`,
`rolbypassrls = false`, `rolsuper = false`, and zero rows from `org_members` — the last one
because the `own_memberships` policy filters on `app.user_id`. Anything else is a 503.

This is not theoretical: on its first run it caught `DATABASE_URL` pointing at
`neondb_owner`, which has `BYPASSRLS`, and reported `ownMemberships: 2` where the policy
requires 0. `docs/adr/0001` calls that "the real trap... not the pooler".

**For M1a:** `research/06-hosting-costs.md` warns that OpenNext's 5-minute warmer "defeats
scale-to-zero if the health check touches the database". This route touches the database on
purpose, so point the warmer at a separate static route.

## Errors in a Server Function

**A Server Function does not catch a database error.** It returns a result for what the
planner can fix or is not allowed to do (`notFound`, a field key), and lets anything else throw.
Next logs an uncaught throw with its stack and a digest, and the route's `error.tsx` renders a
retry.

Rejected: catching, reporting through `reportSilentFailure` and returning `failed`. It keeps an
open sheet's draft on screen through an outage, which is real, but it cost a `failed` message in
every feature's copy and `String(error)` dropped the stack. The money and run-sheet actions did
this and the tasks and templates actions did not, until the PR #1 review made it one rule
(2026-09-23). A catch that exists stays only where the failure is specific and expected: a mail
send (`team/actions.ts`, which takes the invite back when the mail does not leave).

## Layout

```
src/
  proxy.ts          the ONLY file that knows a hostname exists
  env.ts            the ONLY file that reads process.env. zod + `server-only`.
  i18n/request.ts   locale from the [locale] segment, or the NEXT_LOCALE cookie
  lib/db.ts         memoised getDb() -- never a module-scope pool, or DATABASE_URL
                    becomes a BUILD-time requirement and CI cannot compile
  lib/routes.ts     href builders; the substitute for typedRoutes, which is off
  lib/locales.ts    nl, en, fr. Import-free so proxy.ts can use it.
  app/
    globals.css                  the Tailwind entry; imports design-system/tokens.css
    (marketing)/[locale]/        ROOT LAYOUT A -- apex, owns "/", no rewrite
    pro/                         ROOT LAYOUT B -- app host, rewritten from /
    sites/[tenant]/[[...slug]]/  ROOT LAYOUT C -- tenant hosts. PH4 stub.
    api/health/
```

There is no `app/layout.tsx` on purpose: three root layouts, because the surfaces share no
`lang`, no fonts and no token scope. A shared root layout would ship the dashboard's design
tokens to every guest's phone.
