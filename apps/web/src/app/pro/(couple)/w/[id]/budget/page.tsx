import { coupleBudget } from '@guestnote/db'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { formatCivilDate } from '../../../../../../lib/civil-date.ts'
import { coupleModule } from '../../../../../../lib/couple.ts'
import { getDb } from '../../../../../../lib/db.ts'
import { formatCents } from '../../../../../../lib/money.ts'

/**
 * The budget, read-only (spec 0008): lines with estimate and actual, the totals, and the payment
 * schedule. One switch covers both, on or off. Money is formatted in the wedding's own locale,
 * as on the planner's screen, so the couple and the planner read the same figures.
 */
export default async function CoupleBudgetPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, t] = await Promise.all([params, getTranslations('app.couple.portal')])
  const c = await coupleModule(id, 'budget')
  if (!c) notFound()
  const { lines, payments } = await coupleBudget(getDb(), c.principal)
  const loc = c.home.localeDefault
  const money = (cents: number | null) => (cents === null ? '–' : formatCents(cents, loc))

  if (lines.length === 0) {
    return <p className="text-muted-foreground text-sm">{t('budgetEmpty')}</p>
  }
  const estimate = lines.reduce((sum, l) => sum + l.estimateCents, 0)
  const actual = lines.reduce((sum, l) => sum + (l.actualCents ?? 0), 0)

  return (
    <div className="space-y-6">
      <div className="border-border bg-background overflow-x-auto rounded-[var(--radius-container)] border">
        <table className="w-full min-w-[22rem] border-collapse text-sm">
          <thead className="text-muted-foreground text-left text-xs">
            <tr>
              <th className="p-3 font-medium">{t('item')}</th>
              <th className="p-3 text-right font-medium">{t('estimate')}</th>
              <th className="p-3 text-right font-medium">{t('actual')}</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id} className="border-border border-t">
                <td className="p-3">
                  {l.label}
                  <span className="text-muted-foreground block text-xs">{l.category}</span>
                </td>
                <td className="p-3 text-right font-mono tabular-nums">{money(l.estimateCents)}</td>
                <td className="p-3 text-right font-mono tabular-nums">{money(l.actualCents)}</td>
              </tr>
            ))}
            <tr className="border-border border-t font-semibold">
              <td className="p-3">{t('total')}</td>
              <td className="p-3 text-right font-mono tabular-nums">{money(estimate)}</td>
              <td className="p-3 text-right font-mono tabular-nums">{money(actual)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <section>
        <h2 className="mb-2 text-sm font-semibold tracking-tight">{t('payments')}</h2>
        {payments.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t('paymentsEmpty')}</p>
        ) : (
          <ul className="border-border bg-background divide-border m-0 list-none divide-y overflow-hidden rounded-[var(--radius-container)] border p-0">
            {payments.map((p) => (
              <li key={p.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 p-3.5">
                <span className="min-w-0 flex-1">{p.label}</span>
                <time dateTime={p.dueOn} className="text-muted-foreground text-xs">
                  {formatCivilDate(loc, p.dueOn)}
                </time>
                <span className="font-mono tabular-nums">{money(p.amountCents)}</span>
                <span className={p.paid ? 'text-xs' : 'text-muted-foreground text-xs'}>
                  {p.paid ? t('paid') : t('unpaid')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
