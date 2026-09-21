import { NextIntlClientProvider } from 'next-intl'
import type { ReactNode } from 'react'
import nl from '../../../messages/app/s2.nl.json'

/**
 * Test-only wrapper. The time zone is New York on purpose: `formatDate` pins `timeZone: 'UTC'`,
 * and under the app's real `Europe/Brussels` a UTC midnight renders as the same day at 01:00,
 * so deleting the pin would change nothing a test could see. West of Greenwich it renders the
 * day before, which is the failure the pin exists to prevent (`weddings/[id]/page.test.tsx`
 * has the measurement).
 */
export function WithMessages({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale="nl" timeZone="America/New_York" messages={{ app: { s2: nl } }}>
      {children}
    </NextIntlClientProvider>
  )
}
