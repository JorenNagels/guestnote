import { getWedding, listTasks } from '@guestnote/db'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { parseFilter, todayCivil } from '../../../../../../components/tasks/buckets.ts'
import { Checklist } from '../../../../../../components/tasks/checklist.tsx'
import { isUuid } from '../../../../../../components/tasks/form.ts'
import { TasksIntl } from '../../../../../../components/tasks/provider.tsx'
import { getDb } from '../../../../../../lib/db.ts'
import { currentMemberships, currentOrgId } from '../../../../../../lib/principal.ts'

/**
 * Checklist for one wedding. Slice S2 of docs/specs/0003.
 *
 * `listTasks` returns `[]` for a wedding the caller may not see, which is indistinguishable
 * from a wedding with no tasks, so the 404 comes from `getWedding` first. Same rule as the
 * overview page: telling somebody a wedding exists but is not theirs is itself the leak. It also
 * covers a `couple` or outside editor, for whom `listTasks` refuses on purpose.
 */
export default async function ChecklistPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ filter?: string | string[] }>
}) {
  const [{ id }, { filter }, memberships, orgId, t] = await Promise.all([
    params,
    searchParams,
    currentMemberships(),
    currentOrgId(),
    getTranslations('app.s2'),
  ])
  if (!memberships || !orgId || !isUuid(id)) notFound()

  const db = getDb()
  const wedding = await getWedding(db, memberships, orgId, id)
  if (!wedding) notFound()
  const tasks = await listTasks(db, memberships, orgId, id)

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <header className="mb-5">
        <p className="text-muted-foreground text-xs font-semibold tracking-[0.09em] uppercase">
          {wedding.coupleDisplayName}
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{t('title')}</h1>
      </header>
      <TasksIntl>
        <Checklist
          weddingId={wedding.id}
          weddingDate={wedding.weddingDate}
          tasks={tasks}
          filter={parseFilter(filter)}
          today={todayCivil()}
        />
      </TasksIntl>
    </div>
  )
}
