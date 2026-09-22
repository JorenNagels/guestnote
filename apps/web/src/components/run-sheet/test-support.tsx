import { render } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import type { ReactElement } from 'react'
import s9 from '../../../messages/app/s9.en.json'

/**
 * English copy for the run sheet's tests, so an assertion reads like what the planner sees.
 * Only the `app.s9` tree is loaded, as `components/money/test-support.tsx` does for S4: the
 * view uses nothing else, and `i18n/messages.test.ts` is what keeps the three locales aligned.
 */
export function renderWithCopy(ui: ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ app: { s9 } }}>
      {ui}
    </NextIntlClientProvider>,
  )
}
