import type { MetadataRoute } from 'next'
import { apexOrigin } from '../lib/app-url.ts'
import { allMarketingPaths } from '../lib/marketing-pages.ts'

/**
 * `sitemap.xml` on the apex (spec 0006, "SEO"): every marketing page in every locale, each with
 * its hreflang alternates -- the same table the routes and the language switcher read, so a page
 * cannot be routable and missing here. Off the apex, `proxy.ts` 404s this path.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const origin = apexOrigin()
  return allMarketingPaths().map((p) => ({
    url: `${origin}${p.path}`,
    alternates: {
      languages: Object.fromEntries(
        Object.entries(p.alternates).map(([l, path]) => [l, `${origin}${path}`]),
      ),
    },
    changeFrequency: p.id === 'home' || p.id === 'pricing' ? 'weekly' : 'monthly',
    priority: p.id === 'home' ? 1 : p.id === 'features' || p.id === 'pricing' ? 0.8 : 0.3,
  }))
}
