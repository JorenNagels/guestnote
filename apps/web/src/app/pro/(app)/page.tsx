import { listAssignedTasks, listWeddings, principalForOrg } from '@guestnote/db'
import { getFormatter, getTranslations } from 'next-intl/server'
import { todayCivil } from '../../../components/tasks/buckets.ts'
import { TasksIntl } from '../../../components/tasks/provider.tsx'
import { orderWeddings, todaySections, weddingLoads } from '../../../components/today/sections.ts'
import { TaskList } from '../../../components/today/task-list.tsx'
import { WeddingCard } from '../../../components/today/wedding-card.tsx'
import { getDb } from '../../../lib/db.ts'
import { currentMemberships, currentOrgId } from '../../../lib/principal.ts'
import { app } from '../../../lib/routes.ts'

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
 * ## Two reads in parallel
 *
 * `listWeddings` and `listAssignedTasks` are independent, and for a member each is one
 * transaction per assigned wedding, in turn. Running the two at once puts two transactions in
 * flight, not `2N`: the sequencing INSIDE each is what `repos/weddings.ts` argues for and is left
 * alone. The layout is running `listWeddings` for the sidebar at the same moment, so three at
 * most.
 */
export default async function TodayPage() {
  const [memberships, orgId, t, format] = await Promise.all([
    currentMemberships(),
    currentOrgId(),
    getTranslations('app.s8'),
    getFormatter(),
  ])

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
  const [allWeddings, assigned] = await Promise.all([
    listWeddings(db, memberships, orgId),
    listAssignedTasks(db, memberships, orgId),
  ])

  const weddings = orderWeddings(allWeddings, today)
  const loads = weddingLoads(assigned, today)
  const sections = todaySections(assigned, today)
  const canCreate = principalForOrg(memberships, orgId) !== null
  const allClear = sections.needsYou.length + sections.dueWeek.length + sections.next.length === 0

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
        <section className="border-border bg-card mt-7 rounded-[var(--radius)] border px-5 py-6">
          <h2 className="text-base font-semibold tracking-tight">
            {t(canCreate ? 'noWeddings.title' : 'noAssignments.title')}
          </h2>
          <p className="text-muted-foreground mt-1.5 max-w-prose text-sm leading-relaxed">
            {t(canCreate ? 'noWeddings.body' : 'noAssignments.body')}
          </p>
          {canCreate && (
            <a
              href={app.weddingNew()}
              className="bg-primary text-primary-foreground focus-visible:outline-ring mt-4 inline-flex h-9 items-center rounded-[var(--radius)] px-4 text-sm font-semibold hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              {t('noWeddings.create')}
            </a>
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

          {allClear ? (
            // One sentence instead of three empty boxes: with nothing in any list, three headings
            // that each say "nothing" is the same answer given three times.
            <section className="border-border bg-card mt-7 rounded-[var(--radius)] border px-5 py-5">
              <p role="status" className="text-sm">
                {t('allClear')}
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
        </>
      )}
    </div>
  )
}
