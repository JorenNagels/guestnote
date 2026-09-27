import { describe, expect, it } from 'vitest'
import { LOCALES } from './locales.ts'
import { allMarketingPaths, PAGE_IDS, PAGES, pageFromSlug, pagePath } from './marketing-pages.ts'

describe('marketing pages', () => {
  it('gives every page a slug in every locale, lowercase and path-safe', () => {
    for (const id of PAGE_IDS) {
      for (const locale of LOCALES) {
        expect(PAGES[id][locale], `${id}.${locale}`).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
      }
    }
  })

  it('never uses one slug for two pages in the same locale', () => {
    for (const locale of LOCALES) {
      const slugs = PAGE_IDS.map((id) => PAGES[id][locale])
      expect(new Set(slugs).size, locale).toBe(slugs.length)
    }
  })

  it('resolves a slug only in its own locale', () => {
    expect(pageFromSlug('nl', 'prijzen')).toBe('pricing')
    expect(pageFromSlug('en', 'pricing')).toBe('pricing')
    expect(pageFromSlug('en', 'prijzen')).toBeNull()
    expect(pageFromSlug('fr', 'pricing')).toBeNull()
    // Same word in every locale, and still only this page.
    expect(pageFromSlug('fr', 'cookies')).toBe('cookies')
  })

  it('builds the path the browser shows', () => {
    expect(pagePath('home', 'nl')).toBe('/nl')
    expect(pagePath('terms', 'nl')).toBe('/nl/algemene-voorwaarden')
    expect(pagePath('terms', 'fr')).toBe('/fr/conditions-generales')
  })

  it('lists every page in every locale, each pointing at all its counterparts', () => {
    const all = allMarketingPaths()
    expect(all).toHaveLength((PAGE_IDS.length + 1) * LOCALES.length)
    const pricingEn = all.find((p) => p.id === 'pricing' && p.locale === 'en')
    expect(pricingEn?.path).toBe('/en/pricing')
    expect(pricingEn?.alternates).toEqual({
      nl: '/nl/prijzen',
      en: '/en/pricing',
      fr: '/fr/tarifs',
    })
  })
})
