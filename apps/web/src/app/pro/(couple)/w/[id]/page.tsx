import {
  coupleBudget,
  coupleMoodboards,
  coupleRunSheet,
  coupleTasks,
  coupleVendors,
} from '@guestnote/db'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { formatCivilDate } from '../../../../../lib/civil-date.ts'
import { currentCouple, dueCivil } from '../../../../../lib/couple.ts'
import { getDb } from '../../../../../lib/db.ts'
import { app } from '../../../../../lib/routes.ts'

/** How many of "Voor jullie" the home shows before "Alle taken" (spec 0008). */
const FOR_YOU = 5

/**
 * The portal's home (spec 0008): what is theirs to do, then a card per enabled module with its
 * count. Every read is for an enabled module only, in parallel. When nothing is shared yet --
 * every enabled module empty -- the page is the welcome sentence alone, which the planner's
 * contact in the footer completes.
 */
export default async function CoupleHomePage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, t, locale] = await Promise.all([
    params,
    getTranslations('app.couple.portal'),
    getLocale(),
  ])
  const c = await currentCouple(id)
  if (!c) notFound()
  // The layout shows a draft wedding's sentence and not this page; skip five empty reads.
  if (c.home.status === 'draft') return null
  const { principal, home } = c
  const on = new Set(home.modules)
  const db = getDb()

  const [tasks, boards, day, vendors, budget] = await Promise.all([
    on.has('tasks') ? coupleTasks(db, principal, home.coupleUserIds) : [],
    on.has('moodboards') ? coupleMoodboards(db, principal) : [],
    on.has('run_sheet') ? coupleRunSheet(db, principal) : [],
    on.has('vendors') ? coupleVendors(db, principal) : [],
    on.has('budget') ? coupleBudget(db, principal) : { lines: [], payments: [] },
  ])

  const cards = [
    on.has('tasks') && { href: app.couplePlanning(id), label: t('nav.tasks'), n: tasks.length },
    on.has('moodboards') && {
      href: app.coupleMoodboards(id),
      label: t('nav.moodboards'),
      n: boards.length,
    },
    on.has('run_sheet') && { href: app.coupleDay(id), label: t('nav.runSheet'), n: day.length },
    on.has('vendors') && {
      href: app.coupleVendors(id),
      label: t('nav.vendors'),
      n: vendors.length,
    },
    on.has('budget') && {
      href: app.coupleBudget(id),
      label: t('nav.budget'),
      n: budget.lines.length,
    },
  ].filter((x): x is { href: string; label: string; n: number } => Boolean(x))

  if (cards.every((card) => card.n === 0)) {
    return (
      <p className="border-border bg-background rounded-[var(--radius-container)] border p-5 text-sm leading-relaxed">
        {t('welcome', { couple: home.coupleDisplayName, studio: home.studioName })}
      </p>
    )
  }

  const forYou = tasks.filter((task) => task.ours && !task.done)

  return (
    <div className="space-y-6">
      {on.has('tasks') && (
        <section>
          <h2 className="mb-2 text-sm font-semibold tracking-tight">{t('forYou')}</h2>
          <div className="border-border bg-background rounded-[var(--radius-container)] border">
            {forYou.length === 0 ? (
              <p className="text-muted-foreground p-4 text-sm">{t('forYouEmpty')}</p>
            ) : (
              <ul className="divide-border m-0 list-none divide-y p-0">
                {forYou.slice(0, FOR_YOU).map((task) => {
                  const due = dueCivil(task.dueAt)
                  return (
                    <li key={task.id} className="flex items-baseline gap-3 p-3.5">
                      <span className="min-w-0 flex-1">{task.title}</span>
                      {due && (
                        <time dateTime={due} className="text-muted-foreground flex-none text-xs">
                          {formatCivilDate(locale, due)}
                        </time>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
          <Link
            href={app.couplePlanning(id)}
            className="text-primary mt-2 inline-block text-sm underline underline-offset-[3px]"
          >
            {t('allTasks')}
          </Link>
        </section>
      )}

      <ul className="m-0 grid list-none grid-cols-2 gap-2.5 p-0">
        {cards.map((card) => (
          <li key={card.href}>
            <Link
              href={card.href}
              className="border-border bg-background hover:bg-muted block rounded-[var(--radius-container)] border p-4"
            >
              <span className="block font-mono text-2xl font-semibold tabular-nums">{card.n}</span>
              <span className="text-muted-foreground text-sm">{card.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
