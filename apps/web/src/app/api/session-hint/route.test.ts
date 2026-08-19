import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The apex's signed-in probe.
 *
 * Small enough to read in one screen and worth every assertion below, because two of its
 * properties are the kind that fail silently. If the CORS origin stops matching, the label
 * simply never updates and nothing appears in any log. If the body ever grows a second field,
 * that field is available to a page served from a shared CDN cache.
 *
 * `.ts`, not `.tsx`: no React anywhere in the module graph, so it belongs in `unit`.
 */
const currentSession = vi.fn()

vi.mock('../../../lib/principal.ts', () => ({
  currentSession: () => currentSession(),
}))

vi.mock('../../../lib/app-url.ts', () => ({
  apexOrigin: () => 'https://guestnote.be',
}))

const { GET } = await import('./route.ts')

const call = (origin?: string) =>
  GET(
    new Request('https://app.guestnote.be/api/session-hint', {
      headers: origin === undefined ? {} : { origin },
    }),
  )

beforeEach(() => {
  vi.clearAllMocks()
  currentSession.mockResolvedValue(null)
})

describe('the answer', () => {
  it('is false with no session', async () => {
    const response = await call('https://guestnote.be')
    await expect(response.json()).resolves.toEqual({ signedIn: false })
  })

  it('is true with a session', async () => {
    currentSession.mockResolvedValue({ userId: 'u1', email: 'ilse@studiowit.be' })
    const response = await call('https://guestnote.be')
    await expect(response.json()).resolves.toEqual({ signedIn: true })
  })

  it('is a boolean and nothing else, however much the session holds', async () => {
    // The assertion that matters most here. `toEqual` on the whole body is deliberate: any
    // new field would fail this, which is the point -- the caller is a page served from a
    // SHARED CloudFront cache, so anything readable here is one refactor away from being
    // rendered into HTML that another visitor receives.
    currentSession.mockResolvedValue({
      userId: 'u1',
      email: 'ilse@studiowit.be',
      name: 'Ilse Verhoeven',
      lastOrgId: 'org-1',
    })

    const body = await (await call('https://guestnote.be')).json()

    expect(body).toEqual({ signedIn: true })
    expect(Object.keys(body as object)).toEqual(['signedIn'])
  })

  it('answers 200 either way, so "signed out" is not an error', async () => {
    expect((await call('https://guestnote.be')).status).toBe(200)
    currentSession.mockResolvedValue({ userId: 'u1' })
    expect((await call('https://guestnote.be')).status).toBe(200)
  })
})

describe('CORS', () => {
  it('lets the apex read the answer', async () => {
    const { headers } = await call('https://guestnote.be')
    expect(headers.get('access-control-allow-origin')).toBe('https://guestnote.be')
    expect(headers.get('access-control-allow-credentials')).toBe('true')
  })

  it.each([
    ['a lookalike suffix', 'https://guestnote.be.evil.com'],
    ['a lookalike prefix', 'https://evilguestnote.be'],
    ['a subdomain of the apex', 'https://els-en-jan.guestnote.be'],
    ['the app host itself', 'https://app.guestnote.be'],
    ['plain http', 'http://guestnote.be'],
    ['a trailing slash', 'https://guestnote.be/'],
  ])('refuses %s', async (_name, origin) => {
    // Exact match, never a prefix or suffix test. `guestnote.be.evil.com` is the one that
    // would be admitted by `startsWith`, and a tenant subdomain is the one that matters
    // most here -- PH4 serves customer-facing wedding sites there.
    const { headers } = await call(origin)
    expect(headers.get('access-control-allow-origin')).toBeNull()
    expect(headers.get('access-control-allow-credentials')).toBeNull()
  })

  it('sends no CORS headers when there is no Origin at all', async () => {
    // curl, or a same-origin request. Neither needs them.
    const { headers } = await call()
    expect(headers.get('access-control-allow-origin')).toBeNull()
  })

  it('never answers with a wildcard, which is illegal alongside credentials', async () => {
    for (const origin of ['https://guestnote.be', 'https://evil.com', undefined]) {
      const { headers } = await call(origin)
      expect(headers.get('access-control-allow-origin')).not.toBe('*')
    }
  })

  it('varies on Origin, so no cache can cross-wire the header', async () => {
    const { headers } = await call('https://guestnote.be')
    expect(headers.get('vary')).toBe('Origin')
  })

  it('still answers a refused origin rather than erroring', async () => {
    // The browser is what withholds the body. Returning 200 with no CORS headers keeps the
    // endpoint boring; a 403 would only make a refused read look like an outage.
    const response = await call('https://evil.com')
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ signedIn: false })
  })
})

describe('caching', () => {
  it('is never cacheable, whatever the proxy did', async () => {
    // proxy.ts already marks the app host no-store, but a matcher change must not be able to
    // make a per-visitor answer cacheable by accident.
    const { headers } = await call('https://guestnote.be')
    expect(headers.get('cache-control')).toBe('private, no-store')
  })

  it('is json', async () => {
    const { headers } = await call('https://guestnote.be')
    expect(headers.get('content-type')).toBe('application/json')
  })
})
