import { NextIntlClientProvider } from 'next-intl'
import { getMessages } from 'next-intl/server'
import type { ReactNode } from 'react'

/**
 * The portal's copy for its client components, `MoneyIntl`'s shape (`components/money/intl.tsx`
 * says why a provider per surface and not one app-wide). Mounted in the wedding layout around the
 * page, so the segment's `error.tsx` sits inside it: without it the error boundary itself throws
 * for want of a context, and the couple gets Next's bare error instead of "try again". Only
 * `app.couple.portal` goes to the browser.
 */
export async function CoupleIntl({ children }: { children: ReactNode }) {
  const messages = await getMessages()
  const app = messages.app as Record<string, { portal?: unknown }> | undefined
  return (
    <NextIntlClientProvider
      messages={{ app: { couple: { portal: app?.couple?.portal } } }}
      timeZone="Europe/Brussels"
    >
      {children}
    </NextIntlClientProvider>
  )
}
