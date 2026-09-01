import { resolveHost, viewerAuthority } from '@guestnote/core/hosts'
import { type NextRequest, NextResponse } from 'next/server'
import { env } from './env.ts'
import { DEFAULT_LOCALE, isLocale } from './lib/locales.ts'

/**
 * The only file in this codebase that knows a hostname exists.
 *
 * Next's router matches on PATH ONLY -- it has no concept of a hostname. So `/` maps to
 * exactly one file, and three hosts cannot each serve `/` from one route table. This
 * file reads the host and internally rewrites the path before the router sees it. A
 * rewrite is invisible: the browser's URL bar never changes.
 *
 * Exactly one surface keeps its literal paths. That is marketing, because it is the
 * public/SEO surface whose URLs are canonical and whose file-based metadata conventions
 * (sitemap.ts, robots.ts, opengraph-image) must resolve against real paths. The
 * dashboard and guest sites get invisible prefixes.
 *
 *   guestnote.be/nl/prijzen         -> (no rewrite)          (marketing)/[locale]/prijzen
 *   app.guestnote.be/weddings       -> /pro/weddings          pro/weddings
 *   app.guestnote.be/api/health     -> (no rewrite)           api/health
 *   els-en-jan.guestnote.be/story   -> /sites/els-en-jan/story sites/[tenant]/[[...slug]]
 *
 * ## What is deliberately NOT here
 *
 * - **Any I/O.** research/05-architecture.md section 3's whole argument for
 *   subdomains-first is that these branches are "pure string work -- nothing to look
 *   up, nothing to cache, nothing to go stale". A tenant-existence check here would put
 *   a database round-trip in front of every request.
 * - **Any import of `@guestnote/db`, even transitive.** It would drag the Neon
 *   WebSocket driver into the proxy bundle. `@guestnote/core/hosts` has no imports at
 *   all, which is why the resolver lives there.
 * - **Session validation**, and specifically NOT "redirect to /login when the cookie is
 *   missing". That is the tempting one. An expired-but-present cookie still reaches the
 *   layout, so the layout's redirect has to exist regardless; a copy here adds a second
 *   place to be wrong and removes nothing.
 * - **Any authorization.** Next's own docs warn that Server Functions are POST requests
 *   to the route that uses them, so a matcher change can silently remove proxy
 *   coverage: "always verify authentication and authorization inside each Server
 *   Function rather than relying on Proxy alone." Authorization is
 *   `requireOrgMember` / `requireWeddingAccess` plus `withTenant` plus RLS.
 * - **Accept-Language negotiation.** See lib/locales.ts.
 * - **Rate limiting and bot filtering.** WAF's job, at M1a.
 *
 * ## Why spoofing the host is not an escalation
 *
 * Reaching the origin directly with `x-forwarded-host: app.guestnote.be` lands on the
 * app branch and gets the login page, because the session cookie is `__Host-` prefixed
 * and therefore pinned to one host with no `Domain` attribute. Worth knowing so nobody
 * adds defences here that belong in the cookie configuration.
 */

/**
 * Rewrite targets. Reachable only via our own rewrites, never from outside.
 *
 * The guard below is security, not tidiness: `app/sites/` is a literal top-level folder
 * and literal segments beat dynamic ones in Next's matching, so without it
 * `guestnote.be/sites/els-en-jan` would render a tenant's guest site on the apex, with
 * the apex's cache headers. That is the cross-tenant leak of section 1's Trap 1,
 * arriving through a different door.
 */
const INTERNAL_PREFIXES = ['/pro', '/sites'] as const

/** Headers this file sets for downstream consumption. Never trusted from a caller. */
const OUR_HEADERS = ['x-gn-tenant'] as const

export const config = {
  matcher: [
    // Without a matcher, proxy runs on every request including static assets and
    // public/ files. `_next/data` is intentionally still matched by Next even when
    // excluded, to prevent protecting a page but not its data route.
    //
    // KNOWN CONSEQUENCE, measured 2026-08-18: a file in `public/` is none of the five
    // exclusions below, so on the app host `/logo.svg` is rewritten to `/pro/logo.svg`
    // and 404s. `src/components/brand/wordmark.tsx` inlines the mark rather than fetching
    // it for exactly this reason. The first asset that genuinely has to be a file needs an
    // entry here.
    //
    // THE MIRROR OF THAT, and a 500 on every deployed page load from 2026-08-19 until
    // 2026-09-01: excluding a name here without shipping the file is worse than not
    // excluding it. `/favicon.ico` was excluded and `public/favicon.ico` did not exist, so
    // nothing rewrote it and nothing 404'd it early -- it fell through to the router, where
    // `[locale]` is a top-level dynamic segment and matched it. `(marketing)/[locale]`'s
    // ROOT layout then called `notFound()` on a non-locale, which from a root layout has no
    // boundary above it and renders a 500. In CloudWatch that was `Page changed from static
    // to dynamic at runtime /favicon.ico, reason: headers` on every request. Dismissed as
    // noise three times during the passkey debugging.
    //
    // So the three conventional names below are a promise that those files exist.
    // `favicon.ico` now does. `robots.txt` and `sitemap.xml` still do not, and they take
    // this same route -- locally they 404 (measured 2026-09-01, same as favicon.ico did),
    // and the deployed behaviour has not been read back. Only crawlers ask for them.
    // Recorded rather than fixed blind: Next's `robots.ts` / `sitemap.ts` conventions on
    // the marketing surface are the right answer, and an empty `robots.txt` is a decision
    // about indexing rather than a bug fix.
    '/((?!_next/static|_next/image|favicon\\.ico|robots\\.txt|sitemap\\.xml).*)',
  ],
}

export function proxy(request: NextRequest): Response {
  const { pathname, search } = request.nextUrl

  if (isInternalPrefix(pathname)) return notFound('internal path')

  const headers = new Headers(request.headers)
  for (const name of OUR_HEADERS) headers.delete(name)
  const forward = { request: { headers } }

  // `x-forwarded-host` first, `host` second. This single line of precedence is what
  // makes the same code correct locally -- where only `host` exists -- and behind
  // CloudFront, where a CloudFront Function copies the viewer Host into
  // `x-forwarded-host` because `AllViewerExceptHostHeader` plus a Lambda Function URL
  // rejects a mismatched Host. There is no NODE_ENV branch anywhere in it.
  const target = resolveHost(
    request.headers.get('x-forwarded-host') ?? request.headers.get('host'),
    env.rootDomain,
    env.appSubdomain,
  )

  switch (target.kind) {
    case 'redirect':
      // 308 rather than 301 for both `www.` and `pro.`: it is equally permanent and
      // equally cacheable, treated the same by search engines, and it preserves the
      // method and body instead of silently turning a POST into a GET.
      return permanentRedirect(canonicalUrl(request, target.authority))

    case 'marketing': {
      // The locale is a real path segment on this surface, so `/` needs somewhere to
      // go. This cannot live in next.config's `redirects()`: config redirects run
      // BEFORE proxy and match on path alone, so they would also rewrite `/` on the app
      // host, where `/` must render the dashboard.
      if (pathname === '/') {
        return permanentRedirect(canonicalUrl(request, hostOf(request), `/${DEFAULT_LOCALE}`))
      }
      // No public API yet. When the waitlist form moves into this app it gets an
      // explicit allow-list entry rather than a blanket opening.
      if (pathname.startsWith('/api/')) return notFound('no public api')

      // `[locale]` is a top-level dynamic segment, so it acts as a catch-all: without
      // this, `/anything` renders as locale "anything". Guarding it HERE rather than with
      // `notFound()` in the layout, because a root layout has no not-found boundary above
      // it to render into -- measured: that path returns 500, not 404. The routing layer
      // is the right place for a routing problem, and this is unit-testable.
      if (!isLocale(pathname.split('/')[1])) return notFound('unknown locale segment')

      // research/05-architecture.md section 1: marketing is "static, revalidated on
      // deploy". Next's own default for an SSG page is `s-maxage=31536000`, which would
      // have CloudFront hold a marketing page for a YEAR -- and section 1's Trap 2 rules
      // out fixing that with invalidations, since they are path-only on a shared
      // distribution. 60 seconds plus a long stale-while-revalidate is the documented
      // compromise: CloudFront absorbs traffic spikes, and a deploy is visible in a minute.
      const page = NextResponse.next(forward)
      page.headers.set('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=86400')
      return page
    }

    case 'app': {
      // `/api/*` MUST bypass the rewrite. Otherwise Better Auth's handler at
      // app/api/auth/[...all] becomes /pro/api/auth/[...all], which does not exist, and
      // every sign-in request 404s. This is the single most breakable line in the file.
      //
      // (It said "every magic link 404s" until 2026-08-18. There are no magic links: the
      // credential model is a passkey with a six-digit email code beneath it. See
      // .impeccable/surfaces/src-app-pro-public-login.md, Appendix A, for why.)
      if (pathname.startsWith('/api/')) return noStore(NextResponse.next(forward))

      const rewritten = NextResponse.rewrite(
        new URL(`/pro${pathname}${search}`, request.nextUrl),
        forward,
      )
      return noStore(rewritten)
    }

    case 'tenant': {
      // The slug becomes a ROUTE PARAM, which is the point: research/05-architecture.md
      // section 1 notes that a `use cache` scope cannot read headers, so the tenant has
      // to arrive as part of the cache key. PH4 depends on this shape.
      headers.set('x-gn-tenant', target.slug)
      return NextResponse.rewrite(
        new URL(`/sites/${target.slug}${pathname}${search}`, request.nextUrl),
        { request: { headers } },
      )
    }

    // A customer's own domain. The branch exists from day one -- and `wedding_domains`
    // with it -- because section 3 warns that retrofitting host resolution later costs
    // a migration plus a rewrite of every canonical-URL and email-link generator.
    case 'custom':
      return notFound('custom domains are v2')

    default:
      return notFound(target.reason)
  }
}

function isInternalPrefix(pathname: string): boolean {
  return INTERNAL_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

/**
 * Sets `Location` explicitly instead of using `NextResponse.redirect`.
 *
 * Next normalises a proxy response's `Location` to a relative path when it equals the
 * origin Next assumes for itself -- and that origin comes from the address the server is
 * bound to, NOT from the Host header. Setting the header directly does not avoid the
 * normalisation (measured: a plain `Response` behaves identically to
 * `NextResponse.redirect`), but building the URL from the resolver rather than from
 * `nextUrl` is still what makes the production behaviour correct.
 *
 * ## The collapse, and why it no longer bites locally
 *
 * Next collapses this `Location` to a relative path when the target equals the origin Next
 * assumes for itself -- the address the server is bound to, NOT the Host header. Under the
 * old `localhost` root domain, `www.localhost:3000` -> `localhost:3000` hit exactly that
 * case: it became `Location: /`, the browser resolved it against `www.localhost:3000`, and
 * it looped until `curl -L` gave up.
 *
 * The root domain became `guestnote.localhost` on 2026-08-19 (see env.ts for the real
 * reason, which was same-site cookies), and `guestnote.localhost:3000` is not the bound
 * origin -- so the collapse cannot trigger. Measured the same day: `Host:
 * www.guestnote.localhost:3000` now emits `location: http://guestnote.localhost:3000/`,
 * absolute, resolving in two hops.
 *
 * It never happened in production either, and that was verified rather than hoped: with
 * GUESTNOTE_ROOT_DOMAIN=guestnote.be and `x-forwarded-host: www.guestnote.be`, this
 * emits `location: https://guestnote.be/`. `guestnote.be` can never equal the origin of a
 * Lambda Function URL.
 *
 * The Next behaviour itself is unchanged, so this stays written down. Do not "fix"
 * anything by reaching for `nextUrl`: behind CloudFront, `nextUrl.host` is the ORIGIN's
 * hostname, so cloning it would redirect visitors to the Function URL and leak it.
 */
function permanentRedirect(url: URL): Response {
  return new Response(null, {
    status: 308,
    headers: { Location: url.toString(), 'Cache-Control': 'private, no-store' },
  })
}

/**
 * Builds an absolute URL for a redirect WITHOUT going through `request.nextUrl.host`.
 *
 * That distinction matters in production: behind CloudFront, `nextUrl` is derived from
 * the request actually received by the Lambda Function URL, so its host is the origin's
 * hostname. Cloning it would redirect the visitor to the Function URL and leak the
 * origin. The authority always comes from the resolver instead.
 */
function canonicalUrl(request: NextRequest, authority: string, pathname?: string): URL {
  const proto =
    request.headers.get('x-forwarded-proto') ?? request.nextUrl.protocol.replace(':', '')
  const path = pathname ?? request.nextUrl.pathname
  return new URL(`${proto}://${authority}${path}${request.nextUrl.search}`)
}

/**
 * The viewer's authority, port included, for a same-host redirect.
 *
 * Falls back to `nextUrl.host` only when there is no host header at all, which in
 * practice cannot happen for an HTTP/1.1 request -- it exists so this returns a string.
 */
function hostOf(request: NextRequest): string {
  const raw = request.headers.get('x-forwarded-host') ?? request.headers.get('host')
  return viewerAuthority(raw) || request.nextUrl.host
}

/**
 * Layer one of three for the dashboard's cache headers, and the authoritative one.
 *
 * A path-based `headers()` rule in next.config cannot do this job: the documented
 * execution order is config headers -> config redirects -> proxy -> filesystem routes,
 * so `headers()` sees the PRE-rewrite path. A rule sourced at `/pro/:path*` would match
 * nothing on the app host and everything if someone hit that path on the apex.
 */
function noStore(response: NextResponse): NextResponse {
  response.headers.set('Cache-Control', 'private, no-store')
  response.headers.set('X-Robots-Tag', 'noindex, nofollow')
  return response
}

/**
 * A bare 404 rather than a rewrite to a rendered page. Guards fire on probes and on
 * unrecognised hosts, where there is nothing useful to render and no reason to hand
 * back fingerprintable HTML. The `reason` is not sent to the client.
 */
function notFound(_reason: string): NextResponse {
  return new NextResponse('Not found', {
    status: 404,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'private, no-store' },
  })
}
