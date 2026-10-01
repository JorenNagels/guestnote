import { coupleVendors } from '@guestnote/db'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { coupleModule } from '../../../../../../lib/couple.ts'
import { getDb } from '../../../../../../lib/db.ts'

/**
 * Booked vendors, name and category (spec 0008). No contact details and no notes: the planner
 * stays the couple's one point of contact, which is the planner's call and the spec's.
 */
export default async function CoupleVendorsPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, t] = await Promise.all([params, getTranslations('app.couple.portal')])
  const c = await coupleModule(id, 'vendors')
  if (!c) notFound()
  const vendors = await coupleVendors(getDb(), c.principal)
  if (vendors.length === 0) {
    return <p className="text-muted-foreground text-sm">{t('vendorsEmpty')}</p>
  }
  return (
    <ul className="border-border bg-background divide-border m-0 list-none divide-y overflow-hidden rounded-[var(--radius-container)] border p-0">
      {vendors.map((v) => (
        <li key={v.id} className="flex items-baseline justify-between gap-3 p-3.5">
          <span className="font-medium">{v.name}</span>
          <span className="text-muted-foreground text-sm">{v.category}</span>
        </li>
      ))}
    </ul>
  )
}
