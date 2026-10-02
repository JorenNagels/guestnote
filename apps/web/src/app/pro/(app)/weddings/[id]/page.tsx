import {
  COUPLE_MAX,
  getCoupleAccess,
  getWeddingDetail,
  getWeddingGlance,
  getWeddingTaskCounts,
  listTasks,
  listWeddingEvents,
  WeddingScope,
} from '@guestnote/db'
import { Card } from '@guestnote/ui/card'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { InviteCard } from '../../../../../components/couple/invite-card.tsx'
import { inviteCardCopy } from '../../../../../components/couple/labels.ts'
import { TasksIntl } from '../../../../../components/tasks/provider.tsx'
import { TaskRowView } from '../../../../../components/tasks/task-row.tsx'
import { vendorProgress } from '../../../../../components/wedding/glance.ts'
import { formatCivilDate } from '../../../../../lib/civil-date.ts'
import { getDb } from '../../../../../lib/db.ts'
import { budgetTotals, civilToday, daysBetween, formatCents } from '../../../../../lib/money.ts'
import { currentMemberships, currentOrgId } from '../../../../../lib/principal.ts'
import { app } from '../../../../../lib/routes.ts'
import { daysUntil, todayCivil } from '../../../../../lib/tminus.ts'
import { isUuid } from '../../../../../lib/uuid.ts'
import { inviteCoupleAction, resendCoupleInviteAction } from './couple/actions.ts'

/**
 * A wedding's landing screen: seven figures, the next events, and the planner's own notes.
 * Spec 0003, slice S1; the budget, next-payment and vendor figures are spec 0009 C2, and each of
 * those three links to the screen it summarises, so "where are we?" is one click from "why?".
 *
 * ## `null` is a 404, and never a 403
 *
 * `getWeddingDetail` returns `null` for no such wedding, a wedding in another organisation, a
 * wedding this `member` is not assigned to, a `couple` (who since migration 0013 cannot read the
 * row at all), and an outside `editor` (who can, and must not read the notes). They are deliberately indistinguishable here, and
 * `notFound()` is what keeps them so. research/07 section 3: "neither -> 404 (not 403 -- don't
 * confirm the wedding exists)".
 *
 * ## What is not here
 *
 * The prototype's "next five tasks" list. S2 owns the tasks repo; this screen counts tasks and
 * does not list them, so it does not reach into a table another slice is about to define reads for.
 */
const NEXT_EVENTS = 5
/**
 * The prototype's "next five tasks". Five and not the checklist's first bucket: the overview is
 * where a planner lands, and a list that can run to forty rows pushes the events off the screen.
 */
const NEXT_TASKS = 5

export default async function WeddingPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, memberships, orgId, t, ct, locale] = await Promise.all([
    params,
    currentMemberships(),
    currentOrgId(),
    getTranslations('app.weddingPages.overview'),
    getTranslations('app.couple.planner'),
    getLocale(),
  ])

  // A malformed id is a 404 like any other unknown one: Postgres would raise on the uuid cast
  // and the planner would get a 500 for a mistyped URL.
  if (!memberships || !orgId || !isUuid(id)) notFound()

  const scope = WeddingScope.of(getDb(), memberships, orgId, id)
  const wedding = await getWeddingDetail(scope)
  if (!wedding) notFound()

  // The whole list and not a `limit 5` query: `listTasks` already exists, is ordered by the one
  // `compareTasks` the checklist uses, and derives `dueDate` from the offset -- a SQL limit would
  // have to re-derive that order in SQL and could disagree with the checklist about which five
  // come first. Cost: every live task row of one wedding on each overview render, which for a
  // real wedding is tens to low hundreds.
  const [counts, events, tasks, couple, glance] = await Promise.all([
    getWeddingTaskCounts(scope),
    listWeddingEvents(scope),
    listTasks(scope),
    // Spec 0008: the invite card, while no partner has accepted. `null` for anyone who may not
    // invite (the repo decides), which simply leaves the card out.
    getCoupleAccess(scope),
    // Spec 0009 C2: one transaction for the three money and vendor figures. The repo argues
    // why it is a summary read and not the three screens' own reads.
    getWeddingGlance(scope),
  ])
  const nextTasks = tasks.filter((task) => task.status !== 'done').slice(0, NEXT_TASKS)
  const today = todayCivil()

  const days = daysUntil(wedding.weddingDate)
  const upcoming = events.filter((e) => (daysUntil(e.startsOn) ?? -1) >= 0)
  const shown = upcoming.slice(0, NEXT_EVENTS)
  const percent = counts.total === 0 ? 0 : Math.round((counts.done / counts.total) * 100)

  // Amounts in the wedding's own locale, as the budget and payment screens write them, so the
  // figure here and the total one click away read the same.
  const eur = (cents: number) => formatCents(cents, glance?.locale ?? locale)
  const totals = glance ? budgetTotals(glance.lines) : null
  const over = totals !== null && totals.remainingCents < 0
  const vendors = glance ? vendorProgress(glance.vendorStatuses) : null
  const next = glance?.nextPayment ?? null
  // Late in the wedding's zone, the way the payments screen decides it: due today is not late.
  const daysLate = glance && next ? daysBetween(next.dueOn, civilToday(glance.timezone)) : 0

  return (
    <div className="mx-auto max-w-5xl px-6 pb-8">
      <div className="mt-6 flex flex-wrap items-start gap-6">
        <div className="min-w-[min(100%,520px)] flex-[1_1_520px]">
          <dl className="mb-6 grid grid-cols-[repeat(auto-fit,minmax(8.5rem,1fr))] gap-2.5">
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
            {glance && totals && vendors ? (
              <>
                <Stat
                  label={t('stats.budgetLeft')}
                  href={app.weddingBudget(id)}
                  value={
                    glance.lines.length === 0
                      ? '–'
                      : over
                        ? t('stats.budgetTooMuch', { amount: eur(-totals.remainingCents) })
                        : eur(totals.remainingCents)
                  }
                  sub={
                    glance.lines.length === 0
                      ? t('stats.budgetNone')
                      : t('stats.budgetOf', { amount: eur(totals.allocatedCents) })
                  }
                  valueWarn={over}
                  money
                />
                <Stat
                  label={t('stats.nextPayment')}
                  href={app.weddingPayments(id)}
                  value={next ? eur(next.amountCents) : '–'}
                  sub={
                    !next
                      ? t('stats.nextPaymentNone')
                      : daysLate > 0
                        ? t('stats.nextPaymentLate', {
                            date: formatCivilDate(locale, next.dueOn),
                            days: daysLate,
                          })
                        : formatCivilDate(locale, next.dueOn)
                  }
                  warn={daysLate > 0}
                  money
                />
                <Stat
                  label={t('stats.vendorsBooked')}
                  href={app.weddingVendors(id)}
                  value={vendors.counted === 0 ? '–' : `${vendors.booked} / ${vendors.counted}`}
                  sub={
                    vendors.counted === 0
                      ? t('stats.vendorsNone')
                      : vendors.booked === vendors.counted
                        ? t('stats.vendorsAll')
                        : t('stats.vendorsOpen', { count: vendors.counted - vendors.booked })
                  }
                />
              </>
            ) : null}
          </dl>

          {couple && couple.partners.length === 0 ? (
            <div className="mb-6">
              <InviteCard
                tasksHref={app.weddingTasks(id)}
                pending={couple.invites.map((i) => ({
                  id: i.id,
                  email: i.email,
                  sentOn: new Intl.DateTimeFormat(locale, {
                    dateStyle: 'medium',
                    timeZone: 'Europe/Brussels',
                  }).format(i.sentAt),
                  expired: i.expired,
                }))}
                slots={COUPLE_MAX - couple.invites.filter((i) => !i.expired).length}
                invite={inviteCoupleAction.bind(null, id)}
                resend={resendCoupleInviteAction.bind(null, id)}
                copy={inviteCardCopy(ct, couple.sharedTaskCount)}
              />
            </div>
          ) : null}

          <section aria-labelledby="tasks-h" className="mb-6">
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <h2 id="tasks-h" className="text-[15px] font-semibold tracking-tight">
                {t('tasks.title')}
              </h2>
              <Link
                href={app.weddingTasks(id)}
                className="text-primary text-xs underline underline-offset-[3px]"
              >
                {t('tasks.open')}
              </Link>
            </div>
            {nextTasks.length === 0 ? (
              <Card>
                <p className="text-muted-foreground text-sm">{t('tasks.empty')}</p>
              </Card>
            ) : (
              // The checklist's own row, tick box included: ticking one here is the same write
              // through the same action, and its `refresh()` re-renders this page, so the
              // finished task leaves and the sixth moves up.
              <Card as="div" padding="none">
                <TasksIntl>
                  <ul className="m-0 list-none p-0">
                    {nextTasks.map((task) => (
                      <TaskRowView key={task.id} task={task} today={today} />
                    ))}
                  </ul>
                </TasksIntl>
              </Card>
            )}
          </section>

          <section aria-labelledby="events-h">
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <h2 id="events-h" className="text-[15px] font-semibold tracking-tight">
                {t('events.title')}
              </h2>
              <Link
                href={app.weddingSettings(id)}
                className="text-primary text-xs underline underline-offset-[3px]"
              >
                {t('events.manage')}
              </Link>
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
                      <span className="min-w-[10rem] flex-1 text-sm">
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

/**
 * One figure. With `href` the whole card is a link to the screen behind the figure, drawn as a
 * stretched link: the anchor is the label inside `<dt>` and its `::after` covers the card.
 * Rejected: making the card itself the `<a>` -- a `<dl>` may hold only `dt`, `dd` and a wrapping
 * `div`, and an `<a>` around both would cost the term/definition pairing a screen reader uses.
 * The link's name is the label ("Volgende betaling"), which is also where it goes.
 *
 * `money` sets the figure smaller: "€ 11.760,00 te veel" in the 21px mono of a count runs past
 * a 8.5rem card. `valueWarn` colours the figure itself, for a value whose words already say what
 * is wrong ("te veel"), where `warn` colours the line beneath it.
 */
function Stat({
  label,
  value,
  sub,
  percent,
  warn = false,
  valueWarn = false,
  money = false,
  href,
}: {
  label: string
  value: string
  sub: string
  percent?: number | undefined
  warn?: boolean
  valueWarn?: boolean
  money?: boolean
  href?: string
}) {
  return (
    <Card className={`px-[15px] py-[13px] ${href ? 'hover:bg-muted/50 relative' : ''}`}>
      <dt className="text-muted-foreground text-[11px] font-semibold tracking-[0.08em] uppercase">
        {href ? (
          <Link
            href={href}
            className="focus-visible:after:outline-ring after:absolute after:inset-0 after:rounded-[var(--radius-container)] focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:-outline-offset-2"
          >
            {label}
          </Link>
        ) : (
          label
        )}
      </dt>
      <dd className="m-0">
        <span
          className={`mt-2 block font-mono font-semibold tracking-tight tabular-nums ${money ? 'text-[17px] leading-snug' : 'text-[21px]'} ${valueWarn ? 'text-destructive' : ''}`}
        >
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
