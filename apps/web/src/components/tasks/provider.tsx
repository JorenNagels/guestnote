import { type AbstractIntlMessages, NextIntlClientProvider } from 'next-intl'
import { getMessages } from 'next-intl/server'
import type { ReactNode } from 'react'

/**
 * Gives the client components of this slice their copy, and nothing else.
 *
 * The dashboard's layout mounts no client provider (the shell passes its labels down as props),
 * and a checklist has too many strings, several of them ICU plurals, to thread through props.
 * `NextIntlClientProvider` inherits the locale and time zone from the request config; only the
 * messages are narrowed here, to `app.tasks`, so the payload does not carry the other nine slices'
 * catalogues to the browser.
 */
export async function TasksIntl({ children }: { children: ReactNode }) {
  const messages = await getMessages()
  const app = messages.app as AbstractIntlMessages
  return (
    <NextIntlClientProvider messages={{ app: { tasks: app.tasks as AbstractIntlMessages } }}>
      {children}
    </NextIntlClientProvider>
  )
}
