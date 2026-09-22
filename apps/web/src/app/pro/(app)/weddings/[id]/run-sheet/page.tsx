import { getRunSheet, getWedding, listWeddingEvents } from '@guestnote/db'
import { notFound } from 'next/navigation'
import { getLocale } from 'next-intl/server'
import { RunSheetView } from '../../../../../../components/run-sheet/run-sheet-view.tsx'
import { isUuid } from '../../../../../../components/wedding/form-state.ts'
import { getDb } from '../../../../../../lib/db.ts'
import { currentMemberships, currentOrgId } from '../../../../../../lib/principal.ts'

/**
 * The run sheet of one wedding, one event at a time. Slice S9 of docs/specs/0003.
 *
 * `getWedding` gives the 404 (a couple, an outside editor and a wedding that does not exist
 * must be indistinguishable, as `../page.tsx` argues); `listWeddingEvents` (S1) gives the tab
 * strip's own days, including one with no run sheet items yet; `getRunSheet` (S9) gives every
 * live event's items in one round trip plus the wedding's vendor list. Three repo calls where
 * one might do, but `getRunSheet` alone cannot draw a tab for an event that has no items.
 */
export default async function RunSheetPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ event?: string | string[] }>
}) {
  const [{ id }, { event }, memberships, orgId, locale] = await Promise.all([
    params,
    searchParams,
    currentMemberships(),
    currentOrgId(),
    getLocale(),
  ])
  if (!memberships || !orgId || !isUuid(id)) notFound()

  const db = getDb()
  const [wedding, events, sheet] = await Promise.all([
    getWedding(db, memberships, orgId, id),
    listWeddingEvents(db, memberships, orgId, id),
    getRunSheet(db, memberships, orgId, id),
  ])
  if (!wedding || !sheet) notFound()

  const requested = Array.isArray(event) ? event[0] : event
  const selected = events.find((e) => e.id === requested) ?? events[0] ?? null

  return (
    <RunSheetView
      weddingId={id}
      coupleName={wedding.coupleDisplayName}
      locale={locale}
      events={events}
      selectedEventId={selected?.id ?? null}
      items={selected ? sheet.items.filter((i) => i.eventId === selected.id) : []}
      vendors={sheet.vendors}
    />
  )
}
