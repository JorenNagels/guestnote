/**
 * Host -> surface resolution. The only place in the codebase that understands what a
 * hostname means.
 *
 * ## Why this is a package and not a file in apps/web
 *
 * `RESERVED_SUBDOMAINS` has two consumers that must never disagree: `proxy.ts`, which
 * needs to know that `app` and `pro` are not tenants, and the slug validator in the
 * repository layer, which `packages/db/src/schema/weddings.ts` promises enforces
 * reserved words. If those two lists ever diverge, a planner successfully registers
 * `admin` and their wedding site 404s forever.
 *
 * That fixes the location. It cannot live in `apps/web`, because `packages/db` would
 * then import from an app. It cannot live in `packages/db`, because `proxy.ts` must not
 * import that package -- doing so drags the Neon WebSocket driver into the proxy
 * bundle. So it lives here, and this module has NO imports at all.
 *
 * research/05-architecture.md section 3 also warns that retrofitting host resolution
 * later costs "a migration plus a rewrite of every canonical-URL and email-link
 * generator". This module is that single point.
 *
 * ## Why everything is a parameter
 *
 * `rootDomain` and `appSubdomain` are arguments, not module-level `process.env` reads.
 * That is what keeps this pure and testable with no environment, and leaves `proxy.ts`
 * as the only thing that touches `env`.
 */

/**
 * Labels that can never be a wedding slug.
 *
 * `mail` is load-bearing rather than defensive: docs/adr/0002 made
 * `mail.guestnote.be` the SES custom MAIL FROM domain. `guestnote` is here so
 * `guestnote.guestnote.be` cannot exist.
 */
export const RESERVED_SUBDOMAINS: ReadonlySet<string> = new Set([
  // surfaces
  'www',
  'app',
  'pro',
  'api',
  'admin',
  'auth',
  'id',
  'login',
  'account',
  'billing',
  // assets and media
  'files',
  'media',
  'img',
  'images',
  'assets',
  'static',
  'cdn',
  // mail -- see docs/adr/0002-ses-setup-and-production-access.md
  'mail',
  'smtp',
  'imap',
  'mx',
  'autodiscover',
  'autoconfig',
  // infrastructure and environments
  'ns1',
  'ns2',
  'dev',
  'staging',
  'preview',
  'test',
  'status',
  'health',
  'hooks',
  'webhooks',
  // content
  'docs',
  'help',
  'support',
  'blog',
  // the brand itself
  'guestnote',
])

/**
 * A DNS label, as DNS actually defines it: 1-63 characters, alphanumeric at both ends,
 * hyphens allowed in between.
 *
 * Deliberately NOT the product's minimum slug length. This resolver mirrors what can
 * arrive in a Host header; the creation-time validator adds product rules on top (see
 * `MIN_TENANT_SLUG_LENGTH`). Conflating the two would mean a host that DNS considers
 * legal getting a different answer here than in the browser.
 */
const DNS_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/

/**
 * The product rule, for whoever writes the wedding-creation validator. Not applied
 * during resolution -- a two-character host simply finds no wedding and 404s.
 */
export const MIN_TENANT_SLUG_LENGTH = 3

export type HostTarget =
  /** Apex. Marketing, and the one surface that keeps its literal paths. */
  | { kind: 'marketing' }
  /** The dashboard and the couple portal. Rewritten to /pro/* by proxy.ts. */
  | { kind: 'app' }
  /** A guest wedding site. `slug` becomes a route param, never a header read. */
  | { kind: 'tenant'; slug: string }
  /** `www.` -> apex, and `pro.` -> the app host. `authority` includes the port. */
  | { kind: 'redirect'; authority: string }
  /** A customer's own domain. 404 until v2 (CloudFront SaaS Manager). */
  | { kind: 'custom'; domain: string }
  /** Fails closed. Never falls back to marketing -- see resolveHost. */
  | { kind: 'unknown'; reason: string }

export type NormalizedHost = {
  /** Lowercased, port-stripped, trailing-dot-stripped. Empty if unusable. */
  host: string
  /** `:3000`, or '' when the header carried no port. Re-appended to redirects. */
  port: string
}

/**
 * Turns a raw `Host` / `x-forwarded-host` header value into something comparable.
 *
 * Every step here exists because of a real input:
 *
 *  - **First comma-separated value.** Chained proxies *append* to `x-forwarded-host`,
 *    so the value can be `a.example.com, b.internal`. The viewer's host is the first.
 *  - **Lowercase.** Host is case-insensitive; `APP.Guestnote.be` must not 404.
 *  - **Strip a trailing `:port` only.** Naively splitting on ':' mangles an IPv6
 *    literal into something that can look like a valid label.
 *  - **Strip one trailing dot.** `guestnote.be.` is the same host as `guestnote.be`.
 *  - **Reject anything left over.** After the above, a legal hostname contains only
 *    `[a-z0-9.-]`. Anything else is malformed or an injection attempt, and the whole
 *    value is discarded rather than partially trusted.
 */
export function normalizeHost(raw: string | null | undefined): NormalizedHost {
  const none: NormalizedHost = { host: '', port: '' }
  if (!raw) return none

  const first = raw.split(',')[0]
  if (first === undefined) return none

  let value = first.trim().toLowerCase()
  if (!value) return none

  // IPv6 literals are bracketed in a Host header: `[::1]:3000`. Peel the port off the
  // end rather than splitting on ':'.
  let port = ''
  const portMatch = /:(\d{1,5})$/.exec(value)
  if (portMatch?.[1] !== undefined) {
    port = `:${portMatch[1]}`
    value = value.slice(0, -port.length)
  }

  if (value.endsWith('.')) value = value.slice(0, -1)
  if (!value) return none

  // Rejects bracketed IPv6, underscores, spaces, and anything percent-encoded.
  if (!/^[a-z0-9.-]+$/.test(value)) return none

  return { host: value, port }
}

/**
 * The viewer's authority -- host plus port -- for building a same-host absolute URL.
 *
 * Exists so callers never re-implement the normalisation above. A second parser that
 * agreed with this one today would disagree with it after the first edit, and the two
 * consumers here are "which surface answers" and "where do we redirect to", which must
 * never differ on what the host is.
 */
export function viewerAuthority(raw: string | null | undefined): string {
  const { host, port } = normalizeHost(raw)
  return host ? `${host}${port}` : ''
}

/**
 * Resolves a host header to the surface that should answer it.
 *
 * **The default is `unknown`, never `marketing`.** If the CloudFront Function ever
 * stops copying the viewer `Host` into `x-forwarded-host`, `host` becomes the Lambda
 * Function URL's own hostname. Falling back to apex would silently serve the marketing
 * site for every request; failing closed makes it a visible outage. That case has its
 * own test.
 *
 * @param raw          the `x-forwarded-host` header if present, else `host`
 * @param rootDomain   `guestnote.be` deployed, `localhost` in development
 * @param appSubdomain the single label the dashboard answers on, normally `app`
 */
export function resolveHost(
  raw: string | null | undefined,
  rootDomain: string,
  appSubdomain: string,
): HostTarget {
  const { host, port } = normalizeHost(raw)
  if (!host) return { kind: 'unknown', reason: 'no usable host header' }

  const root = normalizeHost(rootDomain).host
  if (!root) return { kind: 'unknown', reason: 'rootDomain is not a usable hostname' }

  if (host === root) return { kind: 'marketing' }

  if (!host.endsWith(`.${root}`)) {
    return { kind: 'custom', domain: host }
  }

  const label = host.slice(0, -(root.length + 1))

  // The wildcard certificate is `*.guestnote.be`, which research/05-architecture.md
  // section 3 notes "covers exactly one label". Accepting `a.b.guestnote.be` here would
  // promise a certificate that does not exist, so a deeper name is not a tenant named
  // `a` -- it is nothing.
  if (label.includes('.')) {
    return { kind: 'unknown', reason: `more than one label below ${root}: ${label}` }
  }

  if (label === 'www') return { kind: 'redirect', authority: `${root}${port}` }
  if (label === appSubdomain) return { kind: 'app' }

  // `pro.` was the host in the architecture docs before the couple portal made "pro"
  // the wrong word for a surface couples and vendors also log into. Kept as a permanent
  // redirect so old links and four documents' worth of references still land.
  if (label === 'pro') {
    return { kind: 'redirect', authority: `${appSubdomain}.${root}${port}` }
  }

  if (RESERVED_SUBDOMAINS.has(label)) {
    return { kind: 'unknown', reason: `reserved subdomain: ${label}` }
  }

  if (!DNS_LABEL.test(label)) {
    return { kind: 'unknown', reason: `not a valid DNS label: ${label}` }
  }

  // Blocks `xn--` punycode and the IDN homograph slugs it enables. A tenant slug is
  // chosen by a customer and shown to their guests; it stays ASCII.
  if (label.slice(2, 4) === '--') {
    return { kind: 'unknown', reason: `punycode or reserved hyphenation: ${label}` }
  }

  return { kind: 'tenant', slug: label }
}
