import { coupleMoodboards } from '@guestnote/db'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { coupleModule } from '../../../../../../lib/couple.ts'
import { getDb } from '../../../../../../lib/db.ts'
import { app } from '../../../../../../lib/routes.ts'

/** The boards the planner shared with the couple (spec 0008), each with its image count. */
export default async function CoupleBoardsPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, t] = await Promise.all([params, getTranslations('app.couple.portal')])
  const c = await coupleModule(id, 'moodboards')
  if (!c) notFound()
  const boards = await coupleMoodboards(getDb(), c.principal)
  if (boards.length === 0) {
    return <p className="text-muted-foreground text-sm">{t('boardsEmpty')}</p>
  }
  return (
    <ul className="m-0 grid list-none grid-cols-2 gap-2.5 p-0">
      {boards.map((b) => (
        <li key={b.id}>
          <Link
            href={app.coupleBoard(id, b.id)}
            className="border-border bg-background hover:bg-muted block rounded-[var(--radius-container)] border p-4"
          >
            <span className="block font-medium">{b.name}</span>
            <span className="text-muted-foreground text-sm">
              {t('images', { n: b.imageCount })}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}
