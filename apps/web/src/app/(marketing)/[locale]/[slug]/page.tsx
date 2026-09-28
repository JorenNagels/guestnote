import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { setRequestLocale } from 'next-intl/server'
import { isLegalTextId } from '../../../../components/marketing/legal/index.ts'
import { AboutPage } from '../../../../components/marketing/pages/about.tsx'
import { LegalNoticePage, LegalTextPage } from '../../../../components/marketing/pages/legal.tsx'
import { PricingPage } from '../../../../components/marketing/pages/pricing.tsx'
import { SiteFrame } from '../../../../components/marketing/site-frame.tsx'
import { billingMode } from '../../../../lib/billing-mode.ts'
import { isLocale, type Locale } from '../../../../lib/locales.ts'
import { marketingMetadata } from '../../../../lib/marketing-metadata.ts'
import { PAGE_IDS, PAGES, type PageId, pageFromSlug } from '../../../../lib/marketing-pages.ts'

/**
 * Every marketing page but home, at its translated slug (spec 0006, "URLs are translated per
 * locale"). ONE dynamic segment validated against `lib/marketing-pages.ts`, rather than a folder
 * per slug: thirty folders would be thirty places for a page to exist in one locale and not in
 * the other two, which the slug map's test already forbids in one.
 *
 * `dynamicParams = false` makes a slug outside the map a 404 -- including one that belongs to
 * another locale (`/en/prijzen`). The 404 happens at this PAGE, below the root layout, so it
 * renders `[locale]/not-found.tsx` with a 404 status. Validation in the root layout would be a
 * 500 instead (its own comment records the measurement).
 */
export const dynamicParams = false

export function generateStaticParams({ params }: { params: { locale: string } }) {
  const { locale } = params
  if (!isLocale(locale)) return []
  return PAGE_IDS.map((id) => ({ slug: PAGES[id][locale] }))
}

type Params = { params: Promise<{ locale: string; slug: string }> }

async function resolve(params: Params['params']): Promise<{ locale: Locale; id: PageId }> {
  const { locale, slug } = await params
  const id = isLocale(locale) ? pageFromSlug(locale, slug) : null
  if (!isLocale(locale) || !id) notFound()
  return { locale, id }
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale, id } = await resolve(params)
  return marketingMetadata(id, locale)
}

export default async function MarketingPage({ params }: Params) {
  const { locale, id } = await resolve(params)
  setRequestLocale(locale)
  return (
    <SiteFrame locale={locale} page={id}>
      <Body locale={locale} id={id} />
    </SiteFrame>
  )
}

function Body({ locale, id }: { locale: Locale; id: PageId }) {
  if (id === 'pricing') return <PricingPage locale={locale} billingOn={billingMode().on} />
  if (id === 'about') return <AboutPage locale={locale} />
  if (id === 'legal') return <LegalNoticePage locale={locale} />
  if (isLegalTextId(id)) return <LegalTextPage locale={locale} id={id} />
  // Unreachable while every PageId is handled above; the type check keeps it that way.
  const unhandled: never = id
  throw new Error(`marketing page without a body: ${String(unhandled)}`)
}
