import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { setRequestLocale } from 'next-intl/server'
import type { ReactNode } from 'react'
import { apexOrigin } from '../../../lib/app-url.ts'
import { googleSans } from '../../../lib/fonts.ts'
import { isLocale, LOCALES } from '../../../lib/locales.ts'
import '../../globals.css'
import '../marketing.css'

// Fraunces was the display face here from spec 0006 until 2026-09-28, when the Modern refresh
// in Claude Design made Google Sans Flex the one face for every surface, headlines included
// (`lib/fonts.ts`). The marketing brief records the change.

/**
 * Before first paint, mark the page as having JavaScript, so the in-view animations may start
 * from their hidden frame (`marketing.css`, `.mk-js`). Inline and synchronous on purpose: set
 * after hydration, every mini-UI above the fold would flash its final frame and then hide.
 *
 * The timeout is the way back out: if no `InView` has mounted within four seconds -- a chunk
 * that failed to load, stale HTML behind the CDN's stale-while-revalidate pointing at assets a
 * deploy removed -- the flag comes off and every final frame shows. Without it, the hidden start
 * states would have hidden the product screens for good on exactly the page load that went
 * wrong (review panel, 2026-09-27).
 */
const JS_FLAG =
  "document.documentElement.classList.add('mk-js');" +
  "setTimeout(function(){if(!window.__mkInView)document.documentElement.classList.remove('mk-js')},4000)"

/**
 * `metadataBase` for the whole marketing tree, so the file-based `opengraph-image.tsx` in this
 * segment gets an absolute URL on the apex. Not verifiable under `next dev`: there Next always
 * resolves social images against `http://localhost:<PORT>` whatever the base says (read in
 * `next/dist/lib/metadata/resolvers/resolve-url.js`, 2026-09-27) -- only a production build
 * shows the real host. A function because `apexOrigin()` reads the environment.
 */
export function generateMetadata(): Metadata {
  return {
    metadataBase: new URL(apexOrigin()),
    title: { template: '%s · Guestnote', default: 'Guestnote' },
  }
}

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
 * This used to predict that an editorial scale would make this import a second entry point.
 * **2026-09-27, spec 0006: the scale arrived and did not** -- it is `../marketing.css`,
 * imported above: the display face, the type ramp, the hero ground and the motion. It adds;
 * it redefines no token, so the one contrast-verified colour layer is still the only one, and
 * `tokens.css`'s scope line now names both consumers.
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
    // `suppressHydrationWarning` because JS_FLAG adds `mk-js` to this element before React
    // hydrates, so the class list the server sent and the one React finds differ by design.
    // It silences this one element's attributes only, not its children.
    <html lang={locale} className={googleSans.variable} suppressHydrationWarning>
      <head>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: a constant, see JS_FLAG */}
        <script dangerouslySetInnerHTML={{ __html: JS_FLAG }} />
      </head>
      <body>{children}</body>
    </html>
  )
}
