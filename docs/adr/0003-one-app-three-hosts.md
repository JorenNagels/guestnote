# ADR 0003 — One Next app, three hosts: what owns `/`, and who owns Tailwind

**Date:** 2026-08-17 · **Status:** Accepted, and measured rather than reasoned.

Records the decisions taken while creating `apps/web`, and the four places where
`research/05-architecture.md` turned out to be wrong. Everything below was verified against
a running server, not inferred from documentation.

## 1. The constraint everything follows from

**Next's router matches on path only. It has no concept of a hostname.** So `/` maps to
exactly one file, and three hosts cannot each serve `/` from one route table. `proxy.ts`
reads the `Host` header and *internally rewrites* the path before the router sees it; a
rewrite is invisible, unlike a redirect.

The consequence is the whole design decision: **exactly one surface keeps its literal
paths, and the others get an invisible internal prefix.**

| Host | Internal path | Root layout |
|---|---|---|
| `guestnote.be/nl/…` | unchanged | `app/(marketing)/[locale]/layout.tsx` |
| `app.guestnote.be/weddings` | `/pro/weddings` | `app/pro/layout.tsx` |
| `app.guestnote.be/api/*` | **unchanged** — the carve-out | — |
| `<slug>.guestnote.be/story` | `/sites/<slug>/story` | `app/sites/[tenant]/layout.tsx` |
| `www.` and `pro.` | 308 to the canonical host | — |
| everything else | — | 404 |

## 2. Marketing owns `/`

Because it is the public/SEO surface: its URLs are the canonical ones, and the file-based
metadata conventions (`sitemap.ts`, `robots.ts`, `opengraph-image`) resolve against real
paths. A file-convention OG image under a rewritten surface would emit
`https://guestnote.be/marketing/nl/opengraph-image-<hash>`, which the apex branch would
rewrite again and 404 — so on `pro/` and `sites/`, OG images must come from a Route Handler
with explicit absolute URLs.

Two costs, accepted:

- **`typedRoutes` is off.** With the dashboard at `app/pro/*`, `<Link href="/weddings">` is
  not a route in the file tree. The substitute is `src/lib/routes.ts` — href builders, one
  place to grep, no compiler help.
- **`/api/*` must skip the dashboard rewrite**, or Better Auth's handler becomes
  `/pro/api/auth/[...all]` and every magic link 404s at M3.

The host label (`app`) and the internal prefix (`/pro`) are independent, so renaming the
host is a config edit rather than a directory move. `pro.` stays as a permanent redirect,
which is also why the four documents naming it are not left lying.

## 3. Four corrections to `research/05-architecture.md`

**`app/_sites/[tenant]/` cannot work.** §0, §1 and §8 all prescribe rewriting to
`/_sites/<slug>/…`. A folder prefixed with `_` is a *private folder* in the App Router,
opted "out of routing" along with all its subfolders — the route would not exist and the
rewrite would 404. The name is inherited from the Pages-router-era Vercel Platforms
template. Corrected to `app/sites/[tenant]/`, with a proxy guard 404ing inbound `/sites/*`
because `app/sites/` is a literal segment and literal segments beat dynamic ones — without
the guard, `guestnote.be/sites/els-en-jan` would serve a tenant's site on the apex.

**`Cache-Control` cannot come from a path-based `headers()` rule.** The documented order is
config `headers` → config `redirects` → proxy → filesystem routes, so `headers()` sees the
*pre-rewrite* path. A rule sourced at `/pro/:path*` matches nothing on the app host and
everything on the apex. Both the dashboard's `private, no-store` and marketing's
`public, s-maxage=60, stale-while-revalidate=86400` are therefore set in `proxy.ts`, where
the resolved host is the discriminator. Verified: those headers do survive to the client in
`next start` (in `next dev` they are overwritten, which is a dev artefact and misled one
round of testing).

**Marketing's cache default is a year, not a minute.** Next serves an SSG page with
`s-maxage=31536000`. §1 wants "static, revalidated on deploy", and §1's Trap 2 rules out
fixing it with invalidations because they are path-only on a shared distribution. So the
60-second value is set explicitly.

**M1a's "`/api/health` doing a real `withTenant` round-trip"** would need a `Principal`, and
therefore a fixture `orgId` baked into a public endpoint. Implemented instead as
`withUser(db, NIL_UUID, …)` asserting `current_user = 'app_user'`, `rolbypassrls = false`,
`rolsuper = false`, and `count(*) from org_members = 0`. Strictly more, and fixture-free.

## 4. `apps/web` owns the Tailwind entry; `tokens.css` is a layer

`design-system/tokens.css` was a complete Tailwind **entry point** — it contained
`@import "tailwindcss"`, `@theme inline`, and `@layer base { @apply … }` — while `README.md`
and `08-design-system.md` describe it as generated tokens. That made it impossible to place
correctly, because `@source` paths resolve relative to the stylesheet that declares them, so
the entry has to live in the app.

So `apps/web/src/app/globals.css` is the entry and `tokens.css` keeps only primitives,
semantics, the `@theme` mapping and the base layer. It stays in `design-system/` next to
`tokens-reference.html`, so the values and their visual reference cannot drift.

The entry uses `@import "tailwindcss" source(none)` plus three explicit `@source` lines,
because Tailwind's automatic source base is the **current working directory** — which
differs between `npm run dev` at the repo root, `-w @guestnote/web`, and CI. Without
`source(none)` the generated CSS depends on where you stood when you ran the command.

**And a live bug fixed:** `tokens.css` expresses dark mode as a `.dark` **class**, but
Tailwind v4's `dark:` variant defaults to `prefers-color-scheme`. Every `dark:` utility —
including everything the shadcn CLI generates and everything ported from `se-parti-rsvp` —
would have keyed off the OS setting while the token values keyed off the class, silently,
with no error. Fixed with `@custom-variant dark (&:is(.dark *))`, and verified in the
emitted CSS: `.dark\:hidden:is(.dark *)`, with zero occurrences of `prefers-color-scheme`.

## 5. `packages/core` exists for one constant

`RESERVED_SUBDOMAINS` has two consumers that must never disagree: `proxy.ts`, and the slug
validator that `packages/db/src/schema/weddings.ts` promises enforces reserved words. If
they diverge, a planner registers `admin` and their site 404s forever.

That fixes the location. Not `apps/web`, or `packages/db` would import from an app. Not
`packages/db`, because `proxy.ts` must not import it — that would pull the Neon WebSocket
driver into the proxy bundle. So `packages/core/src/hosts.ts`, with no imports at all. It
gains the Better Auth seam at M3, which is what `biome.json` already anticipates.

## 6. The tsconfig exceptions, and why the base is not weakened

`apps/web/tsconfig.json` overrides exactly four things. `jsx: "preserve"`;
`types: ["node","react","react-dom"]` (TS 6 defaults `types` to `[]`, and under
`jsx: preserve` the JSX namespace resolves as `React.JSX`); `plugins: [{name: "next"}]`; and
`paths: {"@/*": ["./src/*"]}` — **a deliberate exception to `tsconfig.base.json`'s "no
`baseUrl` and no `paths`"**, because the shadcn CLI emits `@/lib/utils` and offers no
relative mode. Note that Vitest does not read tsconfig `paths`, so `src/lib/**` stays on
relative `.ts` imports and `@/` is reserved for components.

`noEmit` and `allowImportingTsExtensions` are inherited unchanged, and
`.next/types/**/*.ts` must be in `include` while `.next` must **not** be in `exclude`, or
`exclude` filters the route globals back out. `apps/web`'s own `typecheck` runs
`next typegen && tsc --noEmit`, because `.next/types` is where `PageProps`/`LayoutProps`
live and a clean checkout has none.

## 7. Verified, not assumed

- **Turbopack consumes a workspace package published as raw TypeScript** whose `exports`
  map points at `./src/index.ts` and whose internals import `./client.ts` with explicit
  extensions — in `dev` and in `build`. This was the highest-risk unknown in the plan,
  because `tsconfig.base.json`'s "packages are consumed as TypeScript source" is a
  repo-wide premise. It holds; no build step for `packages/db` is needed.
- **`import.meta.url` works in `next.config.ts`** for `outputFileTracingRoot`, which is
  mandatory in a monorepo: the default traces only the project directory, and both
  `packages/*` and the hoisted `@neondatabase/serverless` sit outside it.
- **The standalone artefact runs and answers `/api/health` with `ok: true`.** Turbopack
  bundles `@neondatabase/serverless` into `.next/server/chunks` rather than tracing it into
  `node_modules`, which is the App Router default and is why `serverExternalPackages` is
  deliberately not set.
- **next-intl's two modes coexist in one app** — the plan's one flagged unknown.
  `getRequestConfig`'s own types document it: `requestLocale` "can be `undefined` when a page
  outside of the `[locale]` segment renders". Marketing takes the locale from the `[locale]`
  segment; `/pro/*` falls through to the `NEXT_LOCALE` cookie. Measured: `<html lang="nl">`
  by default and `<html lang="fr">` with the cookie set.
  `requestLocale` is deprecated in favour of `next/root-params`, which is **not** migrated
  to yet on purpose: root-params cannot be used in Route Handlers, and Route Handlers are
  where P10's assignment email and weekly digest will need these same catalogues.

## 8. One local-development wart, bounded

`www.localhost:3000` → `localhost:3000` **loops**. Next normalises a proxy response's
`Location` to a relative path when it equals the origin Next assumes for itself, and that
origin comes from the address the server is bound to rather than from the `Host` header. So
the target collapses to `Location: /`, the browser resolves it against `www.localhost:3000`,
and `curl -L` sits at 308 until it gives up. Setting the header on a plain `Response`
instead of `NextResponse.redirect` does not avoid it.

It does not happen in production, and that is verified rather than hoped: with
`GUESTNOTE_ROOT_DOMAIN=guestnote.be` and `x-forwarded-host: www.guestnote.be`, the response
is `location: https://guestnote.be/` — absolute, protocol from `x-forwarded-proto`.
`guestnote.be` can never equal the origin of a Lambda Function URL.

**Do not "fix" it by reaching for `nextUrl`.** Behind CloudFront, `nextUrl.host` is the
*origin's* hostname, so cloning it would redirect visitors to the Function URL and leak it.

## 9. Open, and deliberately not done here

- **`packages/db` has no path for an anonymous read**, which blocks PH4. `assertScoped`
  requires a `userId`, and all three `Principal` members are authenticated — but §1 has the
  guest site rendering inside a `use cache` scope with no user, and `0001_rls.sql` fails
  closed. Wanted: `withPublicWedding(db, weddingId, fn)` setting
  `app.wedding_role = 'public'`, with the visibility policies extended to treat `'public'`
  as shared-only. Better than making `userId` optional and weakening `assertScoped` for
  every caller. `app/sites/` stays a stub until it exists.
- **Two shadcn token gaps**, cheap now and expensive after components exist. `tokens.css`
  defines `--series-1…5` while shadcn's chart component reads `--chart-1…5`: five
  `--chart-N: var(--series-N)` aliases in the `@theme inline` block would preserve the
  CVD-validated values and the "fixed order, never cycled" rule. And there is no
  `--sidebar-*` group at all, which M3 needs immediately — that one needs a contrast pass
  in both modes, so it is design work rather than plumbing.
- **`cacheComponents` stays off.** Nothing in PH0–PH3 is cached, and turning it on would
  couple §11.1's unverified OpenNext risk to M1a while spending the hosting reversibility
  §9 banks on. It flips at M1b, with per-tenant ISR. A `next build` with the flag on, run
  as a continue-on-error job, is the cheap early-warning probe once CI exists.
- **`@better-auth/cli` is two minor versions behind the library** (1.4.21 vs 1.6.29), so
  `packages/db/src/schema/auth.ts`'s plan to read the schema off Better Auth's own generator
  needs a Plan B at M3: derive the table metadata programmatically from `better-auth/db`
  using the real config object, which reflects the *installed* version instead.
- **At M3, set `generateId: () => newId()`**, not `generateId: 'uuid'` — the latter almost
  certainly emits v4 and would abandon `packages/db/src/id.ts`'s UUIDv7 time-ordering for
  the auth tables. And leave `advanced.crossSubDomainCookies` **disabled**: it sets
  `Domain=.guestnote.be`, which would send the planner's session cookie to every tenant
  guest site — a surface §5 assumes "*will* be forwarded into the family WhatsApp group".
