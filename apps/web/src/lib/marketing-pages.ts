import { LOCALES, type Locale } from './locales.ts'

/**
 * The marketing site's pages and their slug in each locale (spec 0006, "URLs are translated per
 * locale"). The one table that the route, the language switcher, the hreflang alternates and the
 * sitemap all read, so a page cannot exist in one of them and not the others.
 *
 * Translated slugs rather than one English slug for all three: a Dutch planner searches in
 * Dutch, and `/nl/pricing` would put an English word in every Dutch URL. The cost is this map
 * and the test beside it, which fails on a missing locale or a slug used twice.
 *
 * The home page is not in here: it is `/<locale>` with no slug, served by `[locale]/page.tsx`.
 * Kept free of imports beyond `locales.ts` so the proxy could read it one day without pulling in
 * anything else.
 */
export const PAGES = {
  pricing: { nl: 'prijzen', en: 'pricing', fr: 'tarifs' },
  about: { nl: 'over-ons', en: 'about', fr: 'a-propos' },
  terms: { nl: 'algemene-voorwaarden', en: 'terms', fr: 'conditions-generales' },
  privacy: { nl: 'privacy', en: 'privacy', fr: 'confidentialite' },
  dpa: { nl: 'verwerkersovereenkomst', en: 'dpa', fr: 'accord-traitement-donnees' },
  subprocessors: { nl: 'subverwerkers', en: 'subprocessors', fr: 'sous-traitants' },
  cookies: { nl: 'cookies', en: 'cookies', fr: 'cookies' },
  accessibility: { nl: 'toegankelijkheid', en: 'accessibility', fr: 'accessibilite' },
  legal: { nl: 'juridisch', en: 'legal', fr: 'mentions-legales' },
} as const satisfies Record<string, Record<Locale, string>>

export type PageId = keyof typeof PAGES

/** `home` is the locale root; every other id has a slug. */
export type MarketingPageId = PageId | 'home'

export const PAGE_IDS = Object.keys(PAGES) as PageId[]

/** The page a slug names in THIS locale. `/en/prijzen` is null: a slug belongs to one locale. */
export function pageFromSlug(locale: Locale, slug: string): PageId | null {
  return PAGE_IDS.find((id) => PAGES[id][locale] === slug) ?? null
}

/** `/nl/prijzen`, `/en`. The path the browser shows, and the only way to build one. */
export function pagePath(id: MarketingPageId, locale: Locale): string {
  return id === 'home' ? `/${locale}` : `/${locale}/${PAGES[id][locale]}`
}

/** Every marketing path, each with its counterparts -- the sitemap's and hreflang's input. */
export function allMarketingPaths(): ReadonlyArray<{
  readonly id: MarketingPageId
  readonly locale: Locale
  readonly path: string
  readonly alternates: Readonly<Record<Locale, string>>
}> {
  const ids: MarketingPageId[] = ['home', ...PAGE_IDS]
  return ids.flatMap((id) => {
    const alternates = Object.fromEntries(LOCALES.map((l) => [l, pagePath(id, l)])) as Record<
      Locale,
      string
    >
    return LOCALES.map((locale) => ({ id, locale, path: alternates[locale], alternates }))
  })
}
