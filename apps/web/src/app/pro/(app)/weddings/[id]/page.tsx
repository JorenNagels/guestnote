import { getWeddingDetail, getWeddingTaskCounts, listWeddingEvents } from '@guestnote/db'
import { Card } from '@guestnote/ui/card'
import { notFound } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import {
  formatCivilDate,
  WeddingHeader,
} from '../../../../../components/wedding/wedding-header.tsx'
import { WeddingTabs } from '../../../../../components/wedding/wedding-tabs.tsx'
import { getDb } from '../../../../../lib/db.ts'
import { currentMemberships, currentOrgId } from '../../../../../lib/principal.ts'
import { app } from '../../../../../lib/routes.ts'
import { daysUntil } from '../../../../../lib/tminus.ts'

/**
 * A wedding's landing screen: four figures, the next events, and the planner's own notes.
 * Spec 0003, slice S1.
 *
 * ## `null` is a 404, and never a 403
 *
 * `getWeddingDetail` returns `null` for no such wedding, a wedding in another organisation, a
 * wedding this `member` is not assigned to, and a `couple` or outside `editor` (who can read the
 * row under RLS and must not read the notes). They are deliberately indistinguishable here, and
 * `notFound()` is what keeps them so. research/07 section 3: "neither -> 404 (not 403 -- don't
 * confirm the wedding exists)".
 *
 * ## What is not here
 *
 * The prototype's "next five tasks" list. S2 owns the tasks repo; this screen counts tasks and
 * does not list them, so it does not reach into a table another slice is about to define reads for.
 */
const NEXT_EVENTS = 5

export default async function WeddingPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, memberships, orgId, t, locale] = await Promise.all([
    params,
    currentMemberships(),
    currentOrgId(),
    getTranslations('app.s1.overview'),
    getLocale(),
  ])

  if (!memberships || !orgId) notFound()

  const db = getDb()
  const wedding = await getWeddingDetail(db, memberships, orgId, id)
  if (!wedding) notFound()

  const [counts, events] = await Promise.all([
    getWeddingTaskCounts(db, memberships, orgId, id),
    listWeddingEvents(db, memberships, orgId, id),
  ])

  const days = daysUntil(wedding.weddingDate)
  const upcoming = events.filter((e) => (daysUntil(e.startsOn) ?? -1) >= 0)
  const shown = upcoming.slice(0, NEXT_EVENTS)
  const percent = counts.total === 0 ? 0 : Math.round((counts.done / counts.total) * 100)

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <WeddingHeader wedding={wedding} />
      <WeddingTabs weddingId={id} current="overview" />

      <div className="mt-6 flex flex-wrap items-start gap-6">
        <div className="min-w-[min(100%,520px)] flex-[1_1_520px]">
          <dl className="mb-6 grid grid-cols-[repeat(auto-fit,minmax(11rem,1fr))] gap-2.5">
            <Stat
              label={days !== null && days < 0 ? t('stats.daysSince') : t('stats.daysToGo')}
              value={days === null ? '–' : days === 0 ? t('stats.today') : String(Math.abs(days))}
              sub={
                wedding.weddingDate
                  ? formatCivilDate(locale, wedding.weddingDate)
                  : t('stats.noDate')
              }
            />
            <Stat
              label={t('stats.openTasks')}
              value={String(counts.open)}
              sub={
                counts.overdue === 0
                  ? t('stats.lateNone')
                  : t('stats.lateSome', { count: counts.overdue })
              }
              warn={counts.overdue > 0}
            />
            <Stat
              label={t('stats.done')}
              value={`${counts.done}/${counts.total}`}
              sub={counts.total === 0 ? t('stats.noTasks') : t('stats.donePercent', { percent })}
              percent={counts.total === 0 ? undefined : percent}
            />
            <Stat
              label={t('stats.guests')}
              value={wedding.headcount === null ? '–' : String(wedding.headcount)}
              sub={wedding.headcount === null ? t('stats.guestsUnknown') : t('stats.guestsKnown')}
            />
          </dl>

          <section aria-labelledby="events-h">
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <h2 id="events-h" className="text-[15px] font-semibold tracking-tight">
                {t('events.title')}
              </h2>
              <a
                href={app.weddingSettings(id)}
                className="text-primary text-xs underline underline-offset-[3px]"
              >
                {t('events.manage')}
              </a>
            </div>
            {shown.length === 0 ? (
              <Card>
                <p className="text-muted-foreground text-sm">{t('events.empty')}</p>
              </Card>
            ) : (
              <Card as="div" padding="none">
                <ul className="divide-border m-0 list-none divide-y p-0">
                  {shown.map((e) => (
                    <li
                      key={e.id}
                      className="flex flex-wrap items-baseline gap-x-4 gap-y-0.5 px-3.5 py-2.5"
                    >
                      <span className="min-w-0 flex-1 text-sm">
                        <span className="font-medium">{e.label}</span>
                        {e.venue ? (
                          <span className="text-muted-foreground"> · {e.venue}</span>
                        ) : null}
                      </span>
                      <time
                        dateTime={e.startsOn}
                        className="text-muted-foreground font-mono text-xs tabular-nums"
                      >
                        {formatCivilDate(locale, e.startsOn)} · {e.startsAt ?? t('events.noTime')}
                      </time>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
            {upcoming.length > shown.length ? (
              <p className="text-muted-foreground mt-2 text-xs">
                {t('events.more', { count: upcoming.length - shown.length })}
              </p>
            ) : null}
          </section>
        </div>

        {wedding.notes ? (
          <aside className="min-w-[min(100%,260px)] flex-[1_1_260px]">
            <Card>
              <h2 className="text-muted-foreground mb-1.5 text-[10.5px] font-semibold tracking-[0.09em] uppercase">
                {t('notes.title')}
              </h2>
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{wedding.notes}</p>
              <p className="text-muted-foreground mt-2 text-xs">{t('notes.hint')}</p>
            </Card>
          </aside>
        ) : null}
      </div>
    </div>
  )
}

function Stat({
  label,
  value,
  sub,
  percent,
  warn = false,
}: {
  label: string
  value: string
  sub: string
  percent?: number | undefined
  warn?: boolean
}) {
  return (
    <Card className="px-[15px] py-[13px]">
      <dt className="text-muted-foreground text-[11px] font-semibold tracking-[0.08em] uppercase">
        {label}
      </dt>
      <dd className="m-0">
        <span className="mt-2 block font-mono text-[21px] font-semibold tracking-tight tabular-nums">
          {value}
        </span>
        {percent === undefined ? null : (
          <span
            aria-hidden="true"
            className="bg-muted mt-2 block h-1.5 overflow-hidden rounded-full"
          >
            <span
              className="bg-primary block h-1.5 rounded-full"
              style={{ width: `${percent}%` }}
            />
          </span>
        )}
        <span
          className={`mt-0.5 block text-[11.5px] ${warn ? 'text-destructive font-medium' : 'text-muted-foreground'}`}
        >
          {sub}
        </span>
      </dd>
    </Card>
  )
}
