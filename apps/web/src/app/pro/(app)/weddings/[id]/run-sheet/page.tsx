import { getRunSheet, getWedding, listWeddingEvents, WeddingScope } from '@guestnote/db'
import { notFound } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { RunSheetView } from '../../../../../../components/run-sheet/run-sheet-view.tsx'
import { getDb } from '../../../../../../lib/db.ts'
import { DEFAULT_LOCALE, isLocale } from '../../../../../../lib/locales.ts'
import { currentMemberships, currentOrgId, currentOrgs } from '../../../../../../lib/principal.ts'
import { isUuid } from '../../../../../../lib/uuid.ts'

/**
 * The run sheet of one wedding, one event at a time. Slice S9 of docs/specs/0003.
 *
 * `getWedding` gives the 404 (a couple, an outside editor and a wedding that does not exist
 * must be indistinguishable, as `../page.tsx` argues); `listWeddingEvents` (S1) gives the tab
 * strip's own days, including one with no run sheet items yet; `getRunSheet` (S9) gives every
 * live event's items in one round trip plus the wedding's vendor list. Three repo calls where
 * one might do, but `getRunSheet` alone cannot draw a tab for an event that has no items.
 *
 * Spec 0009 A2: with no events this page still writes nothing. It hands the view the main day's
 * name and date, and the planner's click creates the event -- a GET that created one would make
 * a prefetch or a crawler a writer, and the main day and an event are separate facts.
 */
export default async function RunSheetPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ event?: string | string[] }>
}) {
  const [{ id }, { event }, memberships, orgId, orgs, locale] = await Promise.all([
    params,
    searchParams,
    currentMemberships(),
    currentOrgId(),
    // Request-cached: the shell layout has already asked, so this is the studio name for the
    // printed header (A3) at no extra query.
    currentOrgs(),
    getLocale(),
  ])
  if (!memberships || !orgId || !isUuid(id)) notFound()

  const scope = WeddingScope.of(getDb(), memberships, orgId, id)
  const [wedding, events, sheet] = await Promise.all([
    getWedding(scope),
    listWeddingEvents(scope),
    getRunSheet(scope),
  ])
  if (!wedding || !sheet) notFound()

  // The main day is named in the WEDDING's language, not the planner's screen: the event label is
  // what the couple's portal and the vendors' links show. A locale the app does not ship (the
  // column is free text) falls back to Dutch, as everything else does.
  const mainDay = await getTranslations({
    locale: isLocale(sheet.locale) ? sheet.locale : DEFAULT_LOCALE,
    namespace: 'app.runSheet.event',
  })

  const requested = Array.isArray(event) ? event[0] : event
  const selected = events.find((e) => e.id === requested) ?? events[0] ?? null

  return (
    <RunSheetView
      weddingId={id}
      locale={locale}
      events={events}
      selectedEventId={selected?.id ?? null}
      items={selected ? sheet.items.filter((i) => i.eventId === selected.id) : []}
      vendors={sheet.vendors}
      owners={sheet.owners}
      viewerId={memberships.userId}
      color={wedding.color}
      mainDay={{ label: mainDay('mainDay'), date: wedding.weddingDate }}
      coupleName={wedding.coupleDisplayName}
      studioName={orgs.find((o) => o.id === orgId)?.name ?? ''}
    />
  )
}
