import {
  anchoredTaskCounts,
  COUPLE_MAX,
  getCoupleAccess,
  getWeddingDetail,
  listWeddingEvents,
  WeddingScope,
} from '@guestnote/db'
import { notFound } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { CoupleSettings } from '../../../../../../components/couple/couple-settings.tsx'
import { InviteCard } from '../../../../../../components/couple/invite-card.tsx'
import { inviteCardCopy } from '../../../../../../components/couple/labels.ts'
import { EventsEditor } from '../../../../../../components/wedding/events-editor.tsx'
import { eventsLabels, weddingFormLabels } from '../../../../../../components/wedding/labels.ts'
import { WeddingForm } from '../../../../../../components/wedding/wedding-form.tsx'
import { getDb } from '../../../../../../lib/db.ts'
import { currentMemberships, currentOrgId } from '../../../../../../lib/principal.ts'
import { app } from '../../../../../../lib/routes.ts'
import { isUuid } from '../../../../../../lib/uuid.ts'
import { asStatus } from '../../../../../../lib/wedding-parse.ts'
import {
  inviteCoupleAction,
  removeCouplePartnerAction,
  resendCoupleInviteAction,
  revokeCoupleInviteAction,
  setCoupleModulesAction,
} from '../couple/actions.ts'
import { saveEventAction, updateWeddingAction } from './actions.ts'

/**
 * Editing one wedding: its fields, its colour, and its events. Spec 0003, slice S1.
 *
 * Same 404 rule as the overview -- `getWeddingDetail` is the gate and its `null` covers every
 * reason the caller may not be here. The two Server Functions are bound to this wedding's id
 * on the server, and each re-derives standing itself when it runs.
 */
export default async function SettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, memberships, orgId, t, status, ct, locale] = await Promise.all([
    params,
    currentMemberships(),
    currentOrgId(),
    getTranslations('app.weddingPages'),
    getTranslations('app.weddings.status'),
    getTranslations('app.couple.planner'),
    getLocale(),
  ])
  // A malformed id is a 404 like any other unknown one: Postgres would raise on the uuid cast
  // and the planner would get a 500 for a mistyped URL.
  if (!memberships || !orgId || !isUuid(id)) notFound()

  const scope = WeddingScope.of(getDb(), memberships, orgId, id)
  const wedding = await getWeddingDetail(scope)
  if (!wedding) notFound()
  const [events, anchored, couple] = await Promise.all([
    listWeddingEvents(scope),
    anchoredTaskCounts(scope),
    getCoupleAccess(scope),
  ])
  // An instant, so the Brussels day it falls on -- not its UTC date read as a civil one.
  const day = (d: Date) =>
    new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'Europe/Brussels' }).format(d)

  return (
    <div className="mx-auto max-w-5xl px-6 pb-8">
      <p className="text-muted-foreground mt-6 mb-5 text-sm">{t('settings.intro')}</p>

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
          anchored={anchored}
          labels={eventsLabels(t)}
        />
        {couple ? (
          <>
            <CoupleSettings
              modules={couple.modules}
              partners={couple.partners.map((p) => ({
                userId: p.userId,
                label: p.name ? `${p.name} · ${p.email}` : p.email,
                email: p.email,
                since: day(p.joinedAt),
              }))}
              invites={couple.invites.map((i) => ({
                id: i.id,
                email: i.email,
                expiresOn: day(i.expiresAt),
                expired: i.expired,
              }))}
              actions={{
                setModules: setCoupleModulesAction.bind(null, id),
                resend: resendCoupleInviteAction.bind(null, id),
                revoke: revokeCoupleInviteAction.bind(null, id),
                remove: removeCouplePartnerAction.bind(null, id),
              }}
              copy={{
                title: ct('settingsTitle'),
                intro: ct('settingsIntro'),
                modulesTitle: ct('modulesTitle'),
                module: {
                  tasks: ct('module.tasks'),
                  moodboards: ct('module.moodboards'),
                  run_sheet: ct('module.run_sheet'),
                  vendors: ct('module.vendors'),
                  budget: ct('module.budget'),
                },
                saved: ct('saved'),
                accessTitle: ct('accessTitle'),
                noPartners: ct('noPartners'),
                pending: ct('pending'),
                expired: ct('expired'),
                joinedOn: String(ct.raw('joinedOn')),
                expiresOn: String(ct.raw('expiresOn')),
                resend: ct('resend'),
                revoke: ct('revoke'),
                remove: ct('remove'),
                cancel: ct('cancel'),
                confirmRemove: String(ct.raw('confirmRemove')),
                confirmRevoke: String(ct.raw('confirmRevoke')),
                sending: ct('sending'),
                sent: ct('sent'),
                mailFailed: ct('mailFailed'),
                errGeneric: ct('errGeneric'),
              }}
            />
            {couple.partners.length + couple.invites.filter((i) => !i.expired).length <
            COUPLE_MAX ? (
              // A second partner can be invited here once the first has accepted and the
              // overview's card is gone. Pending ones are listed above, so none are passed.
              <InviteCard
                tasksHref={app.weddingTasks(id)}
                pending={[]}
                slots={
                  COUPLE_MAX -
                  couple.partners.length -
                  couple.invites.filter((i) => !i.expired).length
                }
                invite={inviteCoupleAction.bind(null, id)}
                resend={resendCoupleInviteAction.bind(null, id)}
                copy={inviteCardCopy(ct, couple.sharedTaskCount)}
              />
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  )
}
