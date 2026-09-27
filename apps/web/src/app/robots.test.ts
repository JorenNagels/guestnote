import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * `robots.txt` on the apex (spec 0006). The case that matters is the first one: staging is a
 * copy of production's pages on a production-cloned database, and a robots file that let it be
 * indexed would fail silently -- no error anywhere, just a second site in search results. The
 * sitemap is checked here too because it is the other half of what a crawler reads, and a
 * relative URL in it is invalid without being an error.
 */
const env = { rootDomain: 'staging.guestnote.be', appSubdomain: 'app', devPort: 3000 }
vi.mock('../env.ts', () => ({ env }))

const { default: robots } = await import('./robots.ts')
const { default: sitemap } = await import('./sitemap.ts')

beforeEach(() => {
  env.rootDomain = 'staging.guestnote.be'
})

describe('robots.txt', () => {
  it('disallows everything, and names no sitemap, anywhere but production', () => {
    for (const root of ['staging.guestnote.be', 'joren.guestnote.be', 'guestnote.localhost']) {
      env.rootDomain = root
      expect(robots(), root).toEqual({ rules: { userAgent: '*', disallow: '/' } })
    }
  })

  it('allows crawling and points at the sitemap on guestnote.be only', () => {
    env.rootDomain = 'guestnote.be'
    expect(robots()).toEqual({
      rules: { userAgent: '*', allow: '/' },
      sitemap: 'https://guestnote.be/sitemap.xml',
    })
  })
})

describe('sitemap.xml', () => {
  it('lists every page in every locale with absolute URLs and absolute alternates', () => {
    env.rootDomain = 'guestnote.be'
    const entries = sitemap()
    expect(entries).toHaveLength(33)
    const pricingEn = entries.find((e) => e.url === 'https://guestnote.be/en/pricing')
    expect(pricingEn?.alternates?.languages).toEqual({
      nl: 'https://guestnote.be/nl/prijzen',
      en: 'https://guestnote.be/en/pricing',
      fr: 'https://guestnote.be/fr/tarifs',
    })
    for (const e of entries) expect(e.url).toMatch(/^https:\/\/guestnote\.be\//)
  })
})
