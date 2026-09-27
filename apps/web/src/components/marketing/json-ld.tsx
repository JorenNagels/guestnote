import { PRICING } from '@guestnote/billing'
import { apexOrigin } from '../../lib/app-url.ts'
import { CONTACT_EMAIL } from '../../lib/operator.ts'

/**
 * Structured data for search engines on home and pricing (spec 0006, "SEO"): the organisation,
 * and the product with its starting price from `PRICING` -- never a typed number, so a price
 * change cannot leave Google quoting the old one.
 *
 * `<` is escaped in the serialised JSON so no string in it can close the script element early.
 */
export function JsonLd({ description }: { description: string }) {
  const origin = apexOrigin()
  const data = [
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: 'Guestnote',
      url: origin,
      email: CONTACT_EMAIL,
    },
    {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: 'Guestnote',
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      description,
      offers: {
        '@type': 'Offer',
        price: (PRICING.baseMonthlyCents / 100).toFixed(2),
        priceCurrency: 'EUR',
        url: origin,
      },
    },
  ]
  return (
    <script
      type="application/ld+json"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: server-built JSON, `<` escaped
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }}
    />
  )
}
