import type { Metadata } from 'next'
import { setRequestLocale } from 'next-intl/server'
import { HomePage } from '../../../components/marketing/pages/home.tsx'
import { SiteFrame } from '../../../components/marketing/site-frame.tsx'
import { DEFAULT_LOCALE, isLocale, type Locale } from '../../../lib/locales.ts'
import { marketingMetadata } from '../../../lib/marketing-metadata.ts'

type Params = { params: Promise<{ locale: string }> }

/** `proxy.ts` has already 404'd a non-locale first segment; this only narrows the type. */
async function localeOf(params: Params['params']): Promise<Locale> {
  const { locale } = await params
  return isLocale(locale) ? locale : DEFAULT_LOCALE
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  return marketingMetadata('home', await localeOf(params))
}

/**
 * `/nl`, `/en`, `/fr` -- the home page (spec 0006). It replaced the placeholder that held this
 * route from M1 until the public site existed; the placeholder's cross-host login link lives on
 * in the header, as `AppEntryLink` inside `SiteFrame`.
 */
export default async function MarketingHome({ params }: Params) {
  const locale = await localeOf(params)
  setRequestLocale(locale)
  return (
    <SiteFrame locale={locale} page="home">
      <HomePage locale={locale} />
    </SiteFrame>
  )
}
