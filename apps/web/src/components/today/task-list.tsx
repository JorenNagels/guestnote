import type { AssignedTaskRow } from '@guestnote/db'
import { getTranslations } from 'next-intl/server'
import { TodayTaskRow } from './today-task-row.tsx'

/**
 * One titled list on the Today screen. The heading carries the count in words ("3 taken") and
 * not a bare number: `aria-labelledby` makes the region's name the heading, and a screen reader
 * that lands on the list hears how long it is before it starts reading rows.
 *
 * An empty list keeps its heading and says so in a sentence, rather than disappearing: the
 * planner is scanning for "is anything due today", and a missing block reads as a broken page
 * where "Nothing needs you today" reads as the answer.
 */
export async function TaskList({
  id,
  title,
  emptyText,
  tasks,
  today,
}: {
  id: string
  title: string
  emptyText: string
  tasks: readonly AssignedTaskRow[]
  today: string
}) {
  const t = await getTranslations('app.today')
  return (
    <section aria-labelledby={id} className="mt-7">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h2 id={id} className="text-[0.95rem] font-semibold tracking-tight">
          {title}
        </h2>
        <span className="text-muted-foreground font-mono text-[0.72rem] tabular-nums">
          {t('count', { count: tasks.length })}
        </span>
      </div>
      {tasks.length === 0 ? (
        <p className="text-muted-foreground border-border bg-card rounded-[var(--radius)] border px-3.5 py-3 text-sm">
          {emptyText}
        </p>
      ) : (
        <ul className="border-border bg-card overflow-hidden rounded-[var(--radius)] border">
          {tasks.map((task) => (
            <TodayTaskRow key={task.id} task={task} today={today} />
          ))}
        </ul>
      )}
    </section>
  )
}
