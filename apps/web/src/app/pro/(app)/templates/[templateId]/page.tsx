import { getTemplate, listWeddings } from '@guestnote/db'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { todayCivil } from '../../../../../components/tasks/buckets.ts'
import { TemplateEditor, type WeddingOption } from '../../../../../components/templates/editor.tsx'
import { TemplatesIntl } from '../../../../../components/templates/intl.tsx'
import { getDb } from '../../../../../lib/db.ts'
import { currentMemberships, currentOrgId } from '../../../../../lib/principal.ts'
import { app } from '../../../../../lib/routes.ts'
import { isUuid } from '../../../../../lib/uuid.ts'

/**
 * One template and the apply panel. Slice S7 of docs/specs/0003.
 *
 * A malformed id is a 404 here and not left to Postgres, whose uuid cast would throw and render
 * a 500. A template that is missing, deleted, or another organisation's is the same 404 from
 * `getTemplate`: telling somebody it exists but is not theirs is itself the leak.
 *
 * The weddings offered for applying are the ones this person can reach (`listWeddings` narrows a
 * `member` to their assignments); archived ones are left out, because nobody applies a plan to a
 * finished wedding by picking it from a dropdown. `applyTemplate` re-checks reach regardless.
 */
export default async function TemplatePage({
  params,
}: {
  params: Promise<{ templateId: string }>
}) {
  const [{ templateId }, memberships, orgId, t] = await Promise.all([
    params,
    currentMemberships(),
    currentOrgId(),
    getTranslations('app.s7'),
  ])
  if (!memberships || !orgId || !isUuid(templateId)) notFound()

  const db = getDb()
  const [found, all] = await Promise.all([
    getTemplate(db, memberships, orgId, templateId),
    listWeddings(db, memberships, orgId),
  ])
  if (!found) notFound()

  const weddings: WeddingOption[] = all
    .filter((w) => w.status !== 'archived')
    .map((w) => ({ id: w.id, name: w.coupleDisplayName, date: w.weddingDate }))
  // The next wedding still to come is the likeliest target; the list is oldest first, so the
  // first one is usually in the past.
  const today = todayCivil()
  const upcoming = weddings.find((w) => w.date !== null && w.date >= today)

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <Link
        href={app.templates()}
        className="text-muted-foreground hover:text-foreground mb-3 inline-block text-xs underline-offset-2 hover:underline"
      >
        {t('editor.back')}
      </Link>
      <TemplatesIntl>
        <TemplateEditor
          template={found.template}
          canWrite={found.canWrite}
          weddings={weddings}
          defaultWeddingId={(upcoming ?? weddings[0])?.id ?? null}
        />
      </TemplatesIntl>
    </div>
  )
}
