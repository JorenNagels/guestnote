import { getWeddingDetail, listWeddingEvents } from '@guestnote/db'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { EventsEditor } from '../../../../../../components/wedding/events-editor.tsx'
import { eventsLabels, weddingFormLabels } from '../../../../../../components/wedding/labels.ts'
import { asStatus } from '../../../../../../components/wedding/parse.ts'
import { WeddingForm } from '../../../../../../components/wedding/wedding-form.tsx'
import { WeddingHeader } from '../../../../../../components/wedding/wedding-header.tsx'
import { WeddingTabs } from '../../../../../../components/wedding/wedding-tabs.tsx'
import { getDb } from '../../../../../../lib/db.ts'
import { currentMemberships, currentOrgId } from '../../../../../../lib/principal.ts'
import { isUuid } from '../../../../../../lib/uuid.ts'
import { saveEventAction, updateWeddingAction } from './actions.ts'

/**
 * Editing one wedding: its fields, its colour, and its events. Spec 0003, slice S1.
 *
 * Same 404 rule as the overview -- `getWeddingDetail` is the gate and its `null` covers every
 * reason the caller may not be here. The two Server Functions are bound to this wedding's id
 * on the server, and each re-derives standing itself when it runs.
 */
export default async function SettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, memberships, orgId, t, status, nav] = await Promise.all([
    params,
    currentMemberships(),
    currentOrgId(),
    getTranslations('app.weddingPages'),
    getTranslations('app.weddings.status'),
    getTranslations('app.shell.nav'),
  ])
  // A malformed id is a 404 like any other unknown one: Postgres would raise on the uuid cast
  // and the planner would get a 500 for a mistyped URL.
  if (!memberships || !orgId || !isUuid(id)) notFound()

  const db = getDb()
  const wedding = await getWeddingDetail(db, memberships, orgId, id)
  if (!wedding) notFound()
  const events = await listWeddingEvents(db, memberships, orgId, id)

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <WeddingHeader wedding={wedding} eyebrow={nav('settings')} />
      <WeddingTabs weddingId={id} current="settings" />
      <p className="text-muted-foreground mt-4 mb-5 text-sm">{t('settings.intro')}</p>

      <div className="flex max-w-3xl flex-col gap-4">
        <WeddingForm
          mode="edit"
          action={updateWeddingAction.bind(null, id)}
          labels={weddingFormLabels(t, status, t('form.save'))}
          initial={{
            coupleDisplayName: wedding.coupleDisplayName,
            weddingDate: wedding.weddingDate ?? '',
            venue: wedding.venue ?? '',
            headcount: wedding.headcount === null ? '' : String(wedding.headcount),
            notes: wedding.notes ?? '',
            color: wedding.color,
            status: asStatus(wedding.status),
          }}
        />
        <EventsEditor
          action={saveEventAction.bind(null, id)}
          events={events}
          labels={eventsLabels(t)}
        />
      </div>
    </div>
  )
}
