'use client'

import { cx } from '@guestnote/ui/cx'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { app } from '../../lib/routes.ts'

/**
 * Budget | Betalingen, at the top of both money pages (spec 0009 A1).
 *
 * The wedding's tab strip shows one Geld tab for the two routes, so something on the page has to
 * say which of the two you are on and take you to the other. Links with `aria-current="page"`,
 * not a segmented control or ARIA tabs, for the reason `wedding-tabs-view.tsx` gives: these are
 * two routes, and Back should step between them like any other link.
 *
 * It replaces the outlined "Betaalschema" and "Budget" buttons each page had in its header. Those
 * said the same thing as one-way links and sat beside the page's primary action, where they read
 * as a second action; one switch in one place is both directions and is visibly navigation.
 * `current` is a prop and not read from the URL, unlike the tab strip's: the strip lives in a
 * layout that survives navigation, while this is rendered by each page's own view, which knows
 * which page it is.
 */
export function MoneySwitch({
  weddingId,
  current,
}: {
  weddingId: string
  current: 'budget' | 'payments'
}) {
  const t = useTranslations('app.money.switch')
  const links = [
    { key: 'budget', href: app.weddingBudget(weddingId), label: t('budget') },
    { key: 'payments', href: app.weddingPayments(weddingId), label: t('payments') },
  ] as const
  return (
    <nav aria-label={t('label')}>
      <ul className="m-0 flex list-none items-center gap-1 p-0 text-sm">
        {links.map(({ key, href, label }, i) => (
          <li key={key} className="flex items-center gap-1">
            {/* The bar is drawn, not a character: a screen reader would read "vertical line". */}
            {i > 0 ? <span aria-hidden="true" className="bg-border mx-1 h-4 w-px" /> : null}
            <Link
              href={href}
              aria-current={key === current ? 'page' : undefined}
              className={cx(
                'rounded-sm px-1.5 py-1 outline-none focus-visible:outline-ring focus-visible:outline-2',
                key === current
                  ? 'text-foreground font-semibold'
                  : 'text-muted-foreground hover:text-foreground underline-offset-4 hover:underline',
              )}
            >
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
