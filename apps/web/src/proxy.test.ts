import { describe, expect, it } from 'vitest'

/**
 * `proxy.ts` is the only file in the app that knows a hostname exists, and its own header
 * calls one line "the single most breakable line in the file". This is that line's test,
 * and fifteen others.
 *
 * ## Why the imports are dynamic
 *
 * `proxy.ts` imports `./env.ts`, which parses `process.env` at module scope -- once, on
 * first import. Setting the variables afterwards would be too late, so they are set here
 * and the module is pulled in with a top-level `await import` below.
 *
 * The values are the DEPLOYED ones rather than the `localhost` defaults, on purpose: the
 * `www.` redirect is documented as behaving differently on localhost (Next collapses a
 * same-origin `Location` to `/` and the browser loops), so testing against `localhost`
 * would pin the wart instead of the behaviour.
 */
process.env.GUESTNOTE_ROOT_DOMAIN = 'guestnote.be'
process.env.GUESTNOTE_APP_SUBDOMAIN = 'app'

const { proxy } = await import('./proxy.ts')
const { NextRequest } = await import('next/server')

/**
 * A request as it arrives at the proxy.
 *
 * The URL and the Host header are separate arguments because in production they DISAGREE:
 * behind CloudFront the URL is the Lambda Function URL's own address and the viewer's host
 * only survives in `x-forwarded-host`. Tests that need that split pass it explicitly.
 */
function request(
  url: string,
  headers: Record<string, string> = {},
): InstanceType<typeof NextRequest> {
  const parsed = new URL(url)
  return new NextRequest(parsed, { headers: { host: parsed.host, ...headers } })
}

/** Where a rewrite actually sends the request, as a path. `null` when nothing was rewritten. */
function rewrittenPath(response: Response): string | null {
  const target = response.headers.get('x-middleware-rewrite')
  return target === null ? null : new URL(target).pathname + new URL(target).search
}

/**
 * The request headers the route handler will actually see.
 *
 * Next encodes a proxy's header edits into the RESPONSE as `x-middleware-override-headers`
 * (the complete list of surviving header names) plus one `x-middleware-request-<name>` per
 * value. Downstream, `resolve-routes.js` deletes every incoming header absent from that
 * list before applying it -- so absence here is a strip, not a pass-through, and that is
 * what makes the spoofing test below meaningful rather than decorative.
 */
function forwardedHeaders(response: Response): Record<string, string> {
  const names = response.headers.get('x-middleware-override-headers')
  if (!names) return {}
  const out: Record<string, string> = {}
  for (const name of names.split(',')) {
    const key = name.trim()
    out[key] = response.headers.get(`x-middleware-request-${key}`) ?? ''
  }
  return out
}

/** True when the proxy let the request through untouched. */
function passedThrough(response: Response): boolean {
  return response.headers.get('x-middleware-next') === '1'
}

describe('internal prefixes', () => {
  // The guard is security, not tidiness: `app/sites/` is a literal top-level folder and
  // literal segments beat dynamic ones, so without this a request for `/sites/els-en-jan`
  // renders a tenant's guest site on a surface that is not that tenant's.
  //
  // The cases below are deliberately on the APP and TENANT hosts. On the apex, `/pro` and
  // `/sites` are also caught by the unknown-locale guard, so an apex-only test passes with
  // this guard deleted -- it proves the 404 without proving what produced it. Verified by
  // mutation: removing `isInternalPrefix` leaves an apex-only suite fully green.
  it.each([
    ['/pro'],
    ['/pro/weddings'],
    ['/sites'],
    ['/sites/els-en-jan'],
    ['/sites/els-en-jan/story'],
  ])('404s %s on the app host rather than rewriting it again', (path) => {
    const response = proxy(request(`https://app.guestnote.be${path}`))
    expect(response.status).toBe(404)
    expect(rewrittenPath(response)).toBeNull()
  })

  it.each([['/sites/someone-else'], ['/pro/weddings']])(
    '404s %s on a tenant host, so one guest site cannot address another',
    (path) => {
      const response = proxy(request(`https://els-en-jan.guestnote.be${path}`))
      expect(response.status).toBe(404)
      expect(rewrittenPath(response)).toBeNull()
    },
  )

  it('404s them on the apex too', () => {
    for (const path of ['/pro', '/sites/els-en-jan']) {
      expect(proxy(request(`https://guestnote.be${path}`)).status).toBe(404)
    }
  })

  it('does not swallow a path that merely starts with the same letters', () => {
    // `/products` is not `/pro`, and a `startsWith('/pro')` without the boundary check
    // would take it.
    expect(rewrittenPath(proxy(request('https://app.guestnote.be/products')))).toBe('/pro/products')
    expect(passedThrough(proxy(request('https://guestnote.be/nl/products')))).toBe(true)
  })
})

describe('marketing, on the apex', () => {
  it('sends the bare root to the default locale, permanently', () => {
    const response = proxy(request('https://guestnote.be/'))
    expect(response.status).toBe(308)
    expect(response.headers.get('location')).toBe('https://guestnote.be/nl')
  })

  it('serves a localised path with no rewrite at all', () => {
    const response = proxy(request('https://guestnote.be/nl/prijzen'))
    expect(passedThrough(response)).toBe(true)
    expect(rewrittenPath(response)).toBeNull()
  })

  it('caches at the edge for a minute, not for a year', () => {
    // Next's own default for a static page is s-maxage=31536000, and CloudFront
    // invalidations are path-only on a shared distribution -- so this header is the only
    // thing standing between a deploy and a marketing page frozen for a year.
    const response = proxy(request('https://guestnote.be/nl/prijzen'))
    expect(response.headers.get('cache-control')).toBe(
      'public, s-maxage=60, stale-while-revalidate=86400',
    )
  })

  it('404s an unknown first segment instead of treating it as a locale', () => {
    // `[locale]` is a top-level dynamic segment and therefore a catch-all. Handled here
    // rather than with notFound() in the layout, because a root layout has no not-found
    // boundary above it and that path returns 500.
    expect(proxy(request('https://guestnote.be/de/preise')).status).toBe(404)
  })

  it.each(['nl', 'en', 'fr'])('accepts /%s as a locale', (locale) => {
    expect(passedThrough(proxy(request(`https://guestnote.be/${locale}`)))).toBe(true)
  })

  it('exposes no API surface', () => {
    // Pins the behaviour, but note what it does NOT prove: deleting the `/api/` branch in
    // proxy.ts leaves this green. Any path reaching it starts with `/api/`, so its first
    // segment is 'api', which is not a locale -- the unknown-locale guard three lines later
    // returns the same 404 for the same inputs. The branch is documentation and
    // defence-in-depth; it is not independently observable, and no test can make it so
    // while both guards return a bare 404. Verified by mutation, not assumed.
    expect(proxy(request('https://guestnote.be/api/health')).status).toBe(404)
    expect(proxy(request('https://guestnote.be/api/waitlist')).status).toBe(404)
  })
})

describe('the app host', () => {
  it('rewrites invisibly to /pro', () => {
    const response = proxy(request('https://app.guestnote.be/weddings'))
    expect(rewrittenPath(response)).toBe('/pro/weddings')
  })

  it('keeps the query string across the rewrite', () => {
    const response = proxy(request('https://app.guestnote.be/weddings?sort=date&page=2'))
    expect(rewrittenPath(response)).toBe('/pro/weddings?sort=date&page=2')
  })

  it('rewrites the root to /pro, not to /pro/', () => {
    expect(rewrittenPath(proxy(request('https://app.guestnote.be/')))).toBe('/pro/')
  })

  // THE line. `/api/*` must bypass the rewrite, or Better Auth's handler at
  // app/api/auth/[...all] becomes /pro/api/auth/[...all], which does not exist, and every
  // sign-in request 404s.
  it.each([
    ['/api/auth/sign-in/email'],
    ['/api/auth/passkey/generate-authentication-options'],
    ['/api/health'],
  ])('leaves %s alone so auth keeps working', (path) => {
    const response = proxy(request(`https://app.guestnote.be${path}`))
    expect(rewrittenPath(response)).toBeNull()
    expect(passedThrough(response)).toBe(true)
  })

  it('never lets the dashboard be cached or indexed', () => {
    for (const path of ['/weddings', '/api/auth/session']) {
      const response = proxy(request(`https://app.guestnote.be${path}`))
      expect(response.headers.get('cache-control')).toBe('private, no-store')
      expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow')
    }
  })
})

describe('a tenant host', () => {
  it('rewrites to /sites/<slug> and keeps the rest of the path', () => {
    const response = proxy(request('https://els-en-jan.guestnote.be/story'))
    expect(rewrittenPath(response)).toBe('/sites/els-en-jan/story')
  })

  it('passes the slug down as a header as well as a route param', () => {
    const response = proxy(request('https://els-en-jan.guestnote.be/story'))
    expect(forwardedHeaders(response)['x-gn-tenant']).toBe('els-en-jan')
  })

  it('handles the site root', () => {
    expect(rewrittenPath(proxy(request('https://els-en-jan.guestnote.be/')))).toBe(
      '/sites/els-en-jan/',
    )
  })

  it('overwrites a spoofed x-gn-tenant rather than trusting it', () => {
    const response = proxy(
      request('https://els-en-jan.guestnote.be/story', { 'x-gn-tenant': 'someone-else' }),
    )
    expect(forwardedHeaders(response)['x-gn-tenant']).toBe('els-en-jan')
  })

  it('strips x-gn-tenant entirely on a host that is not a tenant', () => {
    // The header is ours to set and never a caller's to send. On the app host it must not
    // survive at all -- not merely be ignored -- because anything downstream reading it
    // would otherwise see an attacker-chosen value.
    const response = proxy(request('https://app.guestnote.be/weddings', { 'x-gn-tenant': 'evil' }))
    expect(forwardedHeaders(response)).not.toHaveProperty('x-gn-tenant')
  })
})

describe('redirects', () => {
  it('sends www to the apex, permanently and absolutely', () => {
    const response = proxy(request('https://www.guestnote.be/nl/prijzen'))
    expect(response.status).toBe(308)
    expect(response.headers.get('location')).toBe('https://guestnote.be/nl/prijzen')
  })

  it('sends the retired pro host to the app host', () => {
    // `pro.` was the host in four documents before the couple portal made "pro" the wrong
    // word. It stays a permanent redirect so old links land.
    const response = proxy(request('https://pro.guestnote.be/weddings'))
    expect(response.status).toBe(308)
    expect(response.headers.get('location')).toBe('https://app.guestnote.be/weddings')
  })

  it('preserves the query string through a redirect', () => {
    const response = proxy(request('https://www.guestnote.be/nl?utm_source=x'))
    expect(response.headers.get('location')).toBe('https://guestnote.be/nl?utm_source=x')
  })

  it('uses 308 rather than 301, so a POST stays a POST', () => {
    expect(proxy(request('https://www.guestnote.be/x')).status).toBe(308)
  })

  it('never caches a redirect', () => {
    expect(proxy(request('https://www.guestnote.be/x')).headers.get('cache-control')).toBe(
      'private, no-store',
    )
  })
})

describe('behind CloudFront', () => {
  // A CloudFront Function copies the viewer Host into `x-forwarded-host`, because
  // AllViewerExceptHostHeader plus a Lambda Function URL rejects a mismatched Host. So the
  // real Host header is the origin's, and trusting it would serve the wrong surface.
  const ORIGIN = 'https://abc123.lambda-url.eu-central-1.on.aws'

  it('resolves the surface from x-forwarded-host, not from the origin host', () => {
    const response = proxy(
      request(`${ORIGIN}/weddings`, {
        'x-forwarded-host': 'app.guestnote.be',
        'x-forwarded-proto': 'https',
      }),
    )
    expect(rewrittenPath(response)).toBe('/pro/weddings')
  })

  it('builds a redirect against the viewer host, never leaking the origin URL', () => {
    // Cloning nextUrl here would redirect the visitor to the Function URL and expose it.
    const response = proxy(
      request(`${ORIGIN}/nl`, {
        'x-forwarded-host': 'www.guestnote.be',
        'x-forwarded-proto': 'https',
      }),
    )
    expect(response.headers.get('location')).toBe('https://guestnote.be/nl')
    expect(response.headers.get('location')).not.toContain('on.aws')
  })

  it('takes the scheme from x-forwarded-proto rather than from the internal hop', () => {
    const response = proxy(
      request(`http://abc123.lambda-url.eu-central-1.on.aws/nl`, {
        'x-forwarded-host': 'www.guestnote.be',
        'x-forwarded-proto': 'https',
      }),
    )
    expect(response.headers.get('location')).toBe('https://guestnote.be/nl')
  })

  it('fails closed when the forwarding stops, instead of serving marketing', () => {
    // If the CloudFront Function ever stops copying the viewer Host, this is what happens:
    // a visible 404, not the marketing site quietly served under every customer's name.
    expect(proxy(request(`${ORIGIN}/nl`)).status).toBe(404)
  })
})

describe('hosts that get nothing', () => {
  it.each([
    ['a reserved subdomain', 'https://admin.guestnote.be/'],
    ['a mail subdomain', 'https://mail.guestnote.be/'],
    ['two labels deep, past the wildcard certificate', 'https://a.b.guestnote.be/'],
    ['a punycode slug', 'https://xn--80ak6aa92e.guestnote.be/'],
    ['an unrelated domain', 'https://example.com/'],
  ])('404s %s', (_name, url) => {
    expect(proxy(request(url)).status).toBe(404)
  })

  it('404s a request with no host header at all', () => {
    const bare = new NextRequest(new URL('https://abc123.lambda-url.eu-central-1.on.aws/nl'))
    bare.headers.delete('host')
    expect(proxy(bare).status).toBe(404)
  })

  it('leaks no reason to the client', () => {
    const response = proxy(request('https://admin.guestnote.be/'))
    expect(response.headers.get('content-type')).toBe('text/plain; charset=utf-8')
    expect(response.headers.get('cache-control')).toBe('private, no-store')
  })
})

describe('host normalisation, end to end', () => {
  it('is case-insensitive', () => {
    expect(
      rewrittenPath(proxy(request('https://app.guestnote.be/x', { host: 'APP.Guestnote.BE' }))),
    ).toBe('/pro/x')
  })

  it('tolerates a trailing dot', () => {
    expect(
      rewrittenPath(proxy(request('https://app.guestnote.be/x', { host: 'app.guestnote.be.' }))),
    ).toBe('/pro/x')
  })

  it('takes the first value when a chained proxy appended to x-forwarded-host', () => {
    const response = proxy(
      request('https://origin.on.aws/x', {
        'x-forwarded-host': 'app.guestnote.be, internal.mesh.local',
        'x-forwarded-proto': 'https',
      }),
    )
    expect(rewrittenPath(response)).toBe('/pro/x')
  })
})
