import { listAssignedTasks, listDuePayments, listWeddings, principalForOrg } from '@guestnote/db'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getFormatter, getTranslations } from 'next-intl/server'
import { addDays } from '../../../components/tasks/buckets.ts'
import { TasksIntl } from '../../../components/tasks/provider.tsx'
import { PaymentList } from '../../../components/today/payment-list.tsx'
import {
  orderWeddings,
  todayQuiet,
  todaySections,
  WEEK_DAYS,
  weddingLoads,
} from '../../../components/today/sections.ts'
import { TaskList } from '../../../components/today/task-list.tsx'
import { WeddingCard } from '../../../components/today/wedding-card.tsx'
import { getDb } from '../../../lib/db.ts'
import { currentMemberships, currentOrgId } from '../../../lib/principal.ts'
import { app } from '../../../lib/routes.ts'
import { todayCivil } from '../../../lib/tminus.ts'

/**
 * Today: the dashboard root, across every wedding. Slice S8 of docs/specs/0003, P16 of
 * `research/09-planner-app.md`.
 *
 * It replaced a redirect to `/weddings`, which existed because this screen did not (spec 0001
 * refused a nav item that would point at a redirect and light up the wrong thing).
 *
 * ## Where authorization happens, and where it does not
 *
 * Not here, same as `/weddings`. Both reads re-derive their principal from the membership rows:
 * an owner or admin gets the whole book, a `member` gets the weddings they are assigned to, and
 * this file never sees a role. The one thing it asks of the memberships is `principalForOrg`, to
 * decide whether to OFFER "new wedding" to an empty list. That is a button, not a permission:
 * `createWedding` checks for itself and returns `null` for a member.
 *
 * ## Three reads in parallel
 *
 * `listWeddings`, `listAssignedTasks` and `listDuePayments` (spec 0009 C2) are independent, and
 * for a member each is one transaction per assigned wedding, in turn. Running the three at once
 * puts three transactions in flight, not `3N`: the sequencing INSIDE each is what
 * `repos/weddings.ts` argues for and is left alone. The layout is running `listWeddings` for the
 * sidebar at the same moment, so four at most.
 */
export default async function TodayPage() {
  const [memberships, orgId, t, format] = await Promise.all([
    currentMemberships(),
    currentOrgId(),
    getTranslations('app.today'),
    getFormatter(),
  ])

  // Spec 0008: someone who is staff nowhere but a couple somewhere belongs in their portal, one
  // wedding straight in and several through the picker. After the org check fails, not before:
  // a planner who is also somebody's partner lands on their dashboard and reaches the portal
  // from the account menu.
  // Always the picker, never `/w/<id>` directly: these rows are read without the wedding's or
  // studio's `deleted_at`, and the picker asks `my_couple_weddings()`, which checks both -- it
  // goes straight in for exactly one wedding (a draft one then shows its closed sentence) and
  // says so plainly for none.
  if (memberships && !orgId && memberships.weddings.some((w) => w.role === 'couple')) {
    redirect(app.couplePicker())
  }

  // The layout renders no shell for this state, so the page has to stand on its own. The words
  // are the wedding list's, reused rather than written twice: it is the same fact.
  if (!memberships || !orgId) {
    const base = await getTranslations('app')
    return (
      <main className="mx-auto grid min-h-dvh max-w-md place-items-center px-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{t('title')}</h1>
          <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
            {base('weddings.noOrg')}
          </p>
          <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
            {base('weddings.noOrgHint')}
          </p>
        </div>
      </main>
    )
  }

  const db = getDb()
  const today = todayCivil()
  const [allWeddings, assigned, duePayments] = await Promise.all([
    listWeddings(db, memberships, orgId),
    listAssignedTasks(db, memberships, orgId),
    // Late, or due by the end of the same week the task list's "Deze week" reaches.
    listDuePayments(db, memberships, orgId, addDays(today, WEEK_DAYS)),
  ])

  const weddings = orderWeddings(allWeddings, today)
  const loads = weddingLoads(assigned, today)
  const sections = todaySections(assigned, today)
  const canCreate = principalForOrg(memberships, orgId) !== null
  const quiet = todayQuiet(sections, duePayments.length)

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground mt-1.5 text-sm">
          {t('subtitle', {
            date: format.dateTime(new Date(`${today}T00:00:00Z`), {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              year: 'numeric',
              // The Brussels civil date read as UTC midnight; any other zone shows its neighbour.
              timeZone: 'UTC',
            }),
            count: weddings.length,
          })}
        </p>
      </header>

      {weddings.length === 0 ? (
        <section className="border-border bg-card mt-7 rounded-[var(--radius-container)] border px-5 py-6">
          <h2 className="text-base font-semibold tracking-tight">
            {t(canCreate ? 'noWeddings.title' : 'noAssignments.title')}
          </h2>
          <p className="text-muted-foreground mt-1.5 max-w-prose text-sm leading-relaxed">
            {t(canCreate ? 'noWeddings.body' : 'noAssignments.body')}
          </p>
          {canCreate && (
            <Link
              href={app.weddingNew()}
              className="bg-primary text-primary-foreground focus-visible:outline-ring mt-4 inline-flex h-9 items-center rounded-[var(--radius)] px-4 text-sm font-semibold hover:shadow-[inset_0_0_0_100px_color-mix(in_srgb,currentColor_12%,transparent)] focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              {t('noWeddings.create')}
            </Link>
          )}
        </section>
      ) : (
        <>
          <ul
            aria-label={t('weddingsLabel')}
            className="mt-6 grid grid-cols-[repeat(auto-fill,minmax(12.25rem,1fr))] gap-2.5"
          >
            {weddings.map((w) => (
              <li key={w.id}>
                <WeddingCard wedding={w} load={loads[w.id]} />
              </li>
            ))}
          </ul>

          {quiet !== 'none' ? (
            // One sentence instead of three empty boxes: with nothing in any list, three headings
            // that each say "nothing" is the same answer given three times. With a payment due,
            // the sentence speaks for the tasks only (`todayQuiet` has the reason).
            <section className="border-border bg-card mt-7 rounded-[var(--radius-container)] border px-5 py-5">
              <p role="status" className="text-sm">
                {t(quiet === 'all' ? 'allClear' : 'tasksClear')}
              </p>
            </section>
          ) : (
            <TasksIntl>
              <TaskList
                id="today-needs-you"
                title={t('sections.needsYou')}
                emptyText={t('empty.needsYou')}
                tasks={sections.needsYou}
                today={today}
              />
              <TaskList
                id="today-week"
                title={t('sections.dueWeek')}
                emptyText={t('empty.dueWeek')}
                tasks={sections.dueWeek}
                today={today}
              />
              <TaskList
                id="today-next"
                title={t('sections.next')}
                emptyText={t('empty.next')}
                tasks={sections.next}
                today={today}
              />
            </TasksIntl>
          )}

          {sections.undated > 0 && (
            <p className="text-muted-foreground mt-3 text-xs">
              {t('undated', { count: sections.undated })}
            </p>
          )}

          {/* After the task lists, not above them: those are the reader's own work, and this is
              the book's money -- an owner sees every wedding's here. Renders nothing when empty. */}
          <PaymentList payments={duePayments} today={today} />
        </>
      )}
    </div>
  )
}
