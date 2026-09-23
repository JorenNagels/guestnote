import { render } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import type { ReactElement } from 'react'
import money from '../../../messages/app/money.en.json'

/**
 * English copy for the money views' tests, so an assertion reads like what the planner sees.
 * Only the `app.money` tree is loaded: the views use nothing else, and the real
 * `i18n/messages.test.ts` is what keeps the three locales aligned.
 */
export function renderWithCopy(ui: ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ app: { money } }}>
      {ui}
    </NextIntlClientProvider>,
  )
}
