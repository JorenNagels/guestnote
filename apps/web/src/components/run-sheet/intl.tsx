import { NextIntlClientProvider } from 'next-intl'
import { getMessages } from 'next-intl/server'
import type { ReactNode } from 'react'

/**
 * Hands the run sheet's client components their copy. The app has no `NextIntlClientProvider`
 * above the routes, so `useTranslations` in a client component finds no context and the page
 * dies (measured for S4, 2026-09-21; `components/money/intl.tsx` has the story).
 *
 * Mounted in the route's `layout.tsx` and not the page, so `error.tsx` sits inside it as well:
 * an error boundary renders below the layout and above the page. Only `app.s9` is sent to the
 * browser. Not shared with the money slice's provider: that one carries `app.s4`, and a shared
 * file is not this slice's to edit.
 */
export async function RunSheetIntl({ children }: { children: ReactNode }) {
  const messages = await getMessages()
  const app = messages.app as Record<string, unknown> | undefined
  return (
    <NextIntlClientProvider messages={{ app: { s9: app?.s9 } }}>{children}</NextIntlClientProvider>
  )
}
