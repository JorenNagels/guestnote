import { coupleRunSheet } from '@guestnote/db'
import { notFound } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { PrintButton } from '../../../../../../components/couple/portal/print-button.tsx'
import { formatCivilDate } from '../../../../../../lib/civil-date.ts'
import { coupleModule } from '../../../../../../lib/couple.ts'
import { getDb } from '../../../../../../lib/db.ts'
import { formatDuration } from '../../../../../../lib/run-sheet.ts'

/**
 * The whole day (spec 0008): every run-sheet row, by event, read-only -- the columns
 * `vendor_link_run_sheet` gives a vendor, from `couple_run_sheet`. A table rather than cards,
 * because it prints: black on white, no chrome, for a venue with no signal.
 */
export default async function CoupleDayPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, t, locale] = await Promise.all([
    params,
    getTranslations('app.couple.portal'),
    getLocale(),
  ])
  const c = await coupleModule(id, 'run_sheet')
  if (!c) notFound()
  const rows = await coupleRunSheet(getDb(), c.principal)
  if (rows.length === 0) {
    return <p className="text-muted-foreground text-sm">{t('runSheetEmpty')}</p>
  }

  const events: { id: string; label: string; on: string; rows: typeof rows }[] = []
  for (const r of rows) {
    const last = events.at(-1)
    if (last?.id === r.eventId) last.rows.push(r)
    else events.push({ id: r.eventId, label: r.eventLabel, on: r.eventStartsOn, rows: [r] })
  }

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <PrintButton label={t('print')} />
      </div>
      {events.map((e) => (
        <section key={e.id} className="mb-6 break-inside-avoid">
          <h2 className="mb-2 text-sm font-semibold tracking-tight">
            {e.label} · {formatCivilDate(locale, e.on)}
          </h2>
          <table className="border-border bg-background w-full border-collapse overflow-hidden rounded-[var(--radius-container)] border text-sm print:rounded-none">
            <tbody>
              {e.rows.map((r) => (
                <tr key={r.id} className="border-border border-t first:border-t-0">
                  <td className="w-16 p-3 align-top font-mono font-semibold tabular-nums">
                    {r.startsAt}
                  </td>
                  <td className="p-3 align-top">
                    {r.title}
                    <span className="text-muted-foreground block text-xs">
                      {[formatDuration(r.durationMin, (k, v) => t(k, v)), r.place, r.vendorName]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  )
}
