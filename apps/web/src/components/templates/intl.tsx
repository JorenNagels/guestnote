import { type AbstractIntlMessages, NextIntlClientProvider } from 'next-intl'
import { getMessages } from 'next-intl/server'
import type { ReactNode } from 'react'

/**
 * Gives the template screens' client components their copy, and nothing else. The app has no
 * `NextIntlClientProvider` above the routes (the shell takes its labels as props), and these
 * forms have too many strings, several of them ICU plurals, to thread through props. Only
 * `app.s7` is sent to the browser. Locale and time zone come from the request config.
 */
export async function TemplatesIntl({ children }: { children: ReactNode }) {
  const messages = await getMessages()
  const app = messages.app as AbstractIntlMessages
  return (
    <NextIntlClientProvider messages={{ app: { s7: app.s7 as AbstractIntlMessages } }}>
      {children}
    </NextIntlClientProvider>
  )
}
