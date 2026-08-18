import { describe, expect, it } from 'vitest'
import { normalizeHost, RESERVED_SUBDOMAINS, resolveHost } from './hosts.ts'

/**
 * The first test in the app half of the repo, and it is this one on purpose.
 *
 * research/05-architecture.md section 3 says the host branches are "pure string work --
 * zero I/O". That is what makes them cheap to test exhaustively, and a mistake here is
 * the same class of failure the packages/db isolation suite exists to prevent: one
 * tenant's content served under another tenant's name.
 */

const ROOT = 'guestnote.be'
const APP = 'app'

const resolve = (raw: string | null | undefined, root = ROOT) => resolveHost(raw, root, APP)

describe('normalizeHost', () => {
  it('lowercases, because Host is case-insensitive', () => {
    expect(normalizeHost('APP.Guestnote.BE').host).toBe('app.guestnote.be')
  })

  it('separates the port instead of splitting on ":"', () => {
    expect(normalizeHost('app.localhost:3000')).toEqual({ host: 'app.localhost', port: ':3000' })
    expect(normalizeHost('guestnote.be')).toEqual({ host: 'guestnote.be', port: '' })
  })

  it('strips one trailing dot, which is the same host', () => {
    expect(normalizeHost('guestnote.be.').host).toBe('guestnote.be')
  })

  it('takes the FIRST value, because chained proxies append', () => {
    expect(normalizeHost('app.guestnote.be, internal.elb.amazonaws.com').host).toBe(
      'app.guestnote.be',
    )
  })

  it('discards the whole value rather than partially trusting it', () => {
    // A bracketed IPv6 literal survives port-stripping but is not a name we serve;
    // the point is that it is rejected outright rather than becoming a "label".
    expect(normalizeHost('[::1]:3000').host).toBe('')
    expect(normalizeHost('bad_host.guestnote.be').host).toBe('')
    expect(normalizeHost('has space.be').host).toBe('')
    expect(normalizeHost('%2e%2e.guestnote.be').host).toBe('')
  })

  it('handles absent headers', () => {
    expect(normalizeHost(null).host).toBe('')
    expect(normalizeHost(undefined).host).toBe('')
    expect(normalizeHost('').host).toBe('')
    expect(normalizeHost('   ').host).toBe('')
  })
})

describe('resolveHost', () => {
  it('serves marketing on the apex', () => {
    expect(resolve('guestnote.be')).toEqual({ kind: 'marketing' })
    expect(resolve('GUESTNOTE.BE:3000')).toEqual({ kind: 'marketing' })
    expect(resolve('guestnote.be.')).toEqual({ kind: 'marketing' })
  })

  it('redirects www to the apex', () => {
    expect(resolve('www.guestnote.be')).toEqual({ kind: 'redirect', authority: 'guestnote.be' })
  })

  it('serves the app on the app subdomain', () => {
    expect(resolve('app.guestnote.be')).toEqual({ kind: 'app' })
  })

  it('redirects the legacy pro. host to the app host', () => {
    expect(resolve('pro.guestnote.be')).toEqual({
      kind: 'redirect',
      authority: 'app.guestnote.be',
    })
  })

  it('keeps the port on a redirect, so local development is not sent to :80', () => {
    expect(resolve('pro.localhost:3000', 'localhost')).toEqual({
      kind: 'redirect',
      authority: 'app.localhost:3000',
    })
    expect(resolve('www.localhost:3000', 'localhost')).toEqual({
      kind: 'redirect',
      authority: 'localhost:3000',
    })
  })

  it('resolves a tenant slug', () => {
    expect(resolve('els-en-jan.guestnote.be')).toEqual({ kind: 'tenant', slug: 'els-en-jan' })
  })

  it('takes the same branches locally as deployed', () => {
    // The whole reason rootDomain is a parameter: `localhost` is not a special case in
    // the code, only a different argument.
    expect(resolve('localhost:3000', 'localhost')).toEqual({ kind: 'marketing' })
    expect(resolve('app.localhost:3000', 'localhost')).toEqual({ kind: 'app' })
    expect(resolve('els-en-jan.localhost:3000', 'localhost')).toEqual({
      kind: 'tenant',
      slug: 'els-en-jan',
    })
  })

  describe('the wildcard certificate covers exactly one label', () => {
    // research/05-architecture.md section 3. Accepting a deeper name would promise a
    // certificate that does not exist.
    it('rejects two labels rather than reading the first as a tenant', () => {
      const target = resolve('a.b.guestnote.be')
      expect(target.kind).toBe('unknown')
      expect(target).not.toMatchObject({ kind: 'tenant', slug: 'a' })
    })

    it('rejects www.<slug>.guestnote.be, which is what a user will actually type', () => {
      expect(resolve('www.els-en-jan.guestnote.be').kind).toBe('unknown')
    })
  })

  describe('reserved labels are not tenants', () => {
    it.for([...RESERVED_SUBDOMAINS].filter((l) => l !== 'www' && l !== 'app' && l !== 'pro'))(
      '%s',
      (label) => {
        expect(resolve(`${label}.${ROOT}`).kind).toBe('unknown')
      },
    )

    it('reserves mail, because ADR 0002 made it the SES MAIL FROM domain', () => {
      expect(RESERVED_SUBDOMAINS.has('mail')).toBe(true)
      expect(resolve('mail.guestnote.be').kind).toBe('unknown')
    })
  })

  describe('malformed tenant labels', () => {
    it('rejects punycode and the homograph slugs it enables', () => {
      expect(resolve('xn--80ak6aa92e.guestnote.be').kind).toBe('unknown')
    })

    it('rejects a label that does not start and end alphanumeric', () => {
      expect(resolve('-leading.guestnote.be').kind).toBe('unknown')
      expect(resolve('trailing-.guestnote.be').kind).toBe('unknown')
    })

    it('accepts a single character, because DNS does', () => {
      // The three-character product minimum belongs to the creation validator, not
      // here -- see MIN_TENANT_SLUG_LENGTH.
      expect(resolve('a.guestnote.be')).toEqual({ kind: 'tenant', slug: 'a' })
    })
  })

  describe('fails closed', () => {
    // THE load-bearing assertion in this file. If the CloudFront Function stops copying
    // the viewer Host, `host` becomes the Lambda Function URL's own hostname. Falling
    // back to marketing would silently serve the wrong site for every request; failing
    // closed makes it a visible outage.
    it('never treats an unrecognised host as the apex', () => {
      const fnUrl = 'jvqrbd6s72it46uua7jembwdgi0rpffg.lambda-url.eu-central-1.on.aws'
      expect(resolve(fnUrl).kind).not.toBe('marketing')
      expect(resolve(fnUrl).kind).not.toBe('app')
    })

    it('treats a foreign domain as a custom-domain candidate, which is 404 until v2', () => {
      expect(resolve('studiowit.be')).toEqual({ kind: 'custom', domain: 'studiowit.be' })
    })

    it('rejects a missing or unusable host header', () => {
      expect(resolve(null).kind).toBe('unknown')
      expect(resolve(undefined).kind).toBe('unknown')
      expect(resolve('').kind).toBe('unknown')
      expect(resolve('bad_host.guestnote.be').kind).toBe('unknown')
    })

    it('rejects an unusable rootDomain instead of matching everything', () => {
      expect(resolveHost('guestnote.be', '', APP).kind).toBe('unknown')
    })
  })
})
