import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'
import { DEFAULT_LOCALE, isLocale } from '../../../lib/locales.ts'
import { pagePath } from '../../../lib/marketing-pages.ts'

/**
 * The marketing 404 (spec 0006). Rendered for an unknown slug under a real locale -- `[slug]`'s
 * `dynamicParams = false` -- inside the root layout, so it gets the fonts and tokens. An unknown
 * FIRST segment never reaches here: `proxy.ts` 404s it before routing, which is the only place
 * that can (a root layout's `notFound()` renders a 500).
 *
 * No `SiteFrame`: `not-found` receives no params, and the header's language switcher needs the
 * page it is on. A single link home in the request's language is the whole job.
 */
export default async function MarketingNotFound() {
  const requested = await getLocale()
  const locale = isLocale(requested) ? requested : DEFAULT_LOCALE
  const t = await getTranslations({ locale, namespace: 'marketing.notFound' })
  return (
    <main className="bg-background text-foreground flex min-h-dvh flex-col items-start justify-center gap-5 px-6 sm:px-16">
      <p className="text-primary font-mono text-sm">404</p>
      <h1 className="mk-display mk-h2 max-w-[18ch]">{t('title')}</h1>
      <p className="text-muted-foreground">{t('body')}</p>
      <Link
        href={pagePath('home', locale)}
        className="text-primary font-semibold underline underline-offset-4"
      >
        {t('home')}
      </Link>
    </main>
  )
}
