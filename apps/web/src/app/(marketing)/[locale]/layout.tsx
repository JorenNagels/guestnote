import { notFound } from 'next/navigation'
import { setRequestLocale } from 'next-intl/server'
import type { ReactNode } from 'react'
import { isLocale, LOCALES } from '../../../lib/locales.ts'
import '../../globals.css'

/**
 * ROOT LAYOUT A -- marketing, on the apex host.
 *
 * There is deliberately no app/layout.tsx. Next supports multiple root layouts by omitting
 * the top-level one and giving each surface its own, and this app needs that: marketing,
 * the dashboard and guest wedding sites have different `lang`, different fonts and
 * different token scopes. A shared root layout would ship the dashboard's design tokens to
 * every guest's phone.
 *
 * Marketing is the surface that keeps its literal paths -- no rewrite -- because it is the
 * public/SEO surface whose URLs are canonical and whose file-based metadata conventions
 * (sitemap.ts, robots.ts, opengraph-image) must resolve against real paths.
 *
 * ## On importing globals.css here
 *
 * Until this page had a control on it, it had no stylesheet at all -- it rendered as bare
 * HTML. It now shares the dashboard's token layer, which is a deliberate call and not the
 * thing the paragraph above warns about: that warning is about GUEST SITES, where a
 * per-wedding theme must not inherit a data tool's palette. Marketing and the dashboard
 * are the same brand talking to the same person.
 *
 * design-system/tokens.css still says "Scope: the planner dashboard only". When marketing
 * grows a real editorial scale -- a larger type ramp, a different radius -- that scope
 * note becomes true again and this import becomes a second entry point. Not yet: one
 * token layer with one verified contrast run beats two that drift.
 */

/** Prerenders /nl, /en and /fr as static HTML rather than rendering them per request. */
export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

export default async function MarketingRootLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ locale: string }>
}) {
  // Next 16 removed synchronous `params` access.
  const { locale } = await params

  // Unreachable in practice: `[locale]` is a top-level dynamic segment and therefore a
  // catch-all, so proxy.ts 404s a non-locale first segment before it ever gets here (a
  // `notFound()` thrown from a ROOT layout has no boundary above it and produces a 500,
  // not a 404 -- measured). Kept as defence in depth for direct renders and tests.
  if (!isLocale(locale)) notFound()

  // Opts these pages into static rendering. Without it next-intl treats the locale as
  // dynamic and all three pages become server-rendered per request, which for a marketing
  // page revalidated on deploy is pure waste.
  setRequestLocale(locale)

  return (
    <html lang={locale}>
      <body>{children}</body>
    </html>
  )
}
