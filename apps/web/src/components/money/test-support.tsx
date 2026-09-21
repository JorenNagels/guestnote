import { render } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import type { ReactElement } from 'react'
import s4 from '../../../messages/app/s4.en.json'

/**
 * English copy for the money views' tests, so an assertion reads like what the planner sees.
 * Only the `app.s4` tree is loaded: the views use nothing else, and the real
 * `i18n/messages.test.ts` is what keeps the three locales aligned.
 */
export function renderWithCopy(ui: ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ app: { s4 } }}>
      {ui}
    </NextIntlClientProvider>,
  )
}
