import type { MetadataRoute } from 'next'
import { apexOrigin } from '../lib/app-url.ts'
import { isIndexable } from '../lib/indexing.ts'

/**
 * `robots.txt` on the APEX only (spec 0006, "SEO"). The app host and tenant hosts never reach
 * this file: `proxy.ts` answers them with a constant disallow-all, because it is the one reader
 * of the hostname and this handler cannot tell hosts apart without becoming a second.
 *
 * Production allows everything and points at the sitemap. Every other environment -- staging,
 * a personal stage, local -- disallows everything, so a staging page never outranks the real
 * one. Static, built once per deploy.
 */
export default function robots(): MetadataRoute.Robots {
  if (!isIndexable()) return { rules: { userAgent: '*', disallow: '/' } }
  return {
    rules: { userAgent: '*', allow: '/' },
    sitemap: `${apexOrigin()}/sitemap.xml`,
  }
}
