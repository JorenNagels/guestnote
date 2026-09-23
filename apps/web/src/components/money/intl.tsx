import { NextIntlClientProvider } from 'next-intl'
import { getMessages } from 'next-intl/server'
import type { ReactNode } from 'react'

/**
 * Hands the money views their copy. The app has no `NextIntlClientProvider` above the routes
 * (the shell takes its labels as props), so a client component that calls `useTranslations`
 * finds no context and the page dies -- measured on the first browser run, 2026-09-21.
 *
 * It is mounted in each route's `layout.tsx` and not in the page, so `error.tsx` sits inside it
 * too: an error boundary renders BELOW the layout and ABOVE the page. Only `app.money` is sent to
 * the browser; the other slices' copy would be dead weight in the payload. Rejected: a provider
 * in the shared `(app)/layout.tsx`, which this slice may not edit and which would ship every
 * slice's copy to every screen.
 */
export async function MoneyIntl({ children }: { children: ReactNode }) {
  const messages = await getMessages()
  const app = messages.app as Record<string, unknown> | undefined
  return (
    <NextIntlClientProvider messages={{ app: { money: app?.money } }}>
      {children}
    </NextIntlClientProvider>
  )
}
