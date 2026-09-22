import { NextIntlClientProvider } from 'next-intl'
import type { ReactNode } from 'react'
import nl from '../../../messages/app/s7.nl.json'

/**
 * Test-only wrapper, the templates twin of `tasks/intl.test-util.tsx`. New York, not Brussels,
 * for the same reason: `formatDate` pins `timeZone: 'UTC'`, and the "Becomes" column would still
 * read correctly under Brussels even if that pin were removed by accident.
 */
export function WithMessages({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale="nl" timeZone="America/New_York" messages={{ app: { s7: nl } }}>
      {children}
    </NextIntlClientProvider>
  )
}
