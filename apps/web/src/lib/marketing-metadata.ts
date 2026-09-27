import 'server-only'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { apexOrigin } from './app-url.ts'
import { DEFAULT_LOCALE, LOCALES, type Locale } from './locales.ts'
import { type MarketingPageId, pagePath } from './marketing-pages.ts'

/**
 * `<head>` for one marketing page in one locale (spec 0006, "SEO"): title, description, the
 * canonical URL and an hreflang alternate for every locale plus `x-default` (Dutch, the default
 * locale -- never a guess from the request, as `lib/locales.ts` settles).
 *
 * Absolute URLs from `apexOrigin()`, the same source the session-hint CORS header uses, so the
 * canonical host is `guestnote.be` in production and `staging.guestnote.be` on staging -- each
 * environment's own apex. Staging is kept out of search results by `app/robots.ts`, not by
 * pointing its canonical at production.
 */
export async function marketingMetadata(id: MarketingPageId, locale: Locale): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: 'marketing' })
  const { title, description } = copyFor(id, t)
  const languages: Record<string, string> = Object.fromEntries(
    LOCALES.map((l) => [l, pagePath(id, l)]),
  )
  languages['x-default'] = pagePath(id, DEFAULT_LOCALE)

  return {
    metadataBase: new URL(apexOrigin()),
    title: id === 'home' ? { absolute: title } : title,
    description,
    alternates: { canonical: pagePath(id, locale), languages },
    openGraph: {
      type: 'website',
      siteName: 'Guestnote',
      locale,
      url: pagePath(id, locale),
      title,
      description,
      // Named on every page rather than left to the file convention -- see `[locale]/og.png`.
      images: [{ url: `/${locale}/og.png`, width: 1200, height: 630, alt: 'Guestnote' }],
    },
  }
}

function copyFor(id: MarketingPageId, t: (key: string) => string) {
  switch (id) {
    case 'home':
      return { title: t('meta.homeTitle'), description: t('meta.homeDescription') }
    case 'features':
    case 'pricing':
    case 'about':
      return { title: t(`meta.${id}Title`), description: t(`meta.${id}Description`) }
    default:
      // Legal pages: the page name is the title, and the tagline is a truthful description of
      // the site they belong to. A per-page description was rejected as copy nobody searches for.
      return { title: t(`legalPages.${id}`), description: t('tagline') }
  }
}
