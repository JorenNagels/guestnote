import type { ReactNode } from 'react'

/**
 * ROOT LAYOUT C -- guest wedding sites, one per tenant subdomain.
 *
 * A separate root layout rather than a shared one because a shared root layout would
 * ship the planner dashboard's design tokens to every guest's phone, and because the
 * `lang` here comes from the wedding's own configuration
 * (`weddings.locale_default` / `weddings.locales`), not from the app's.
 *
 * PH4. See the page for why this cannot be more than a stub yet.
 */
export default function SiteRootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="nl">
      <body>{children}</body>
    </html>
  )
}
