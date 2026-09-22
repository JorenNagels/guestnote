import { listTemplates } from '@guestnote/db'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { TemplatesIntl } from '../../../../components/templates/intl.tsx'
import { TemplateList } from '../../../../components/templates/list-view.tsx'
import { getDb } from '../../../../lib/db.ts'
import { currentMemberships, currentOrgId } from '../../../../lib/principal.ts'

/**
 * The studio's checklist templates (spec 0003, S7). Applying one to a wedding is on the editor.
 *
 * `null` from `listTemplates` is a 404 and not a 403: no standing in the org, and a `member`
 * assigned to no wedding, look the same from here on purpose. Whether the create button is drawn
 * comes from the repo's own `canWrite`, the same test the actions make, so what this shows and
 * what an action allows cannot be two opinions.
 */
export default async function TemplatesPage() {
  const [memberships, orgId, t] = await Promise.all([
    currentMemberships(),
    currentOrgId(),
    getTranslations('app.s7'),
  ])
  if (!memberships || !orgId) notFound()

  const result = await listTemplates(getDb(), memberships, orgId)
  if (!result) notFound()

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground mt-1 max-w-prose text-sm">{t('subtitle')}</p>
      </header>
      <TemplatesIntl>
        <TemplateList templates={result.templates} canWrite={result.canWrite} />
      </TemplatesIntl>
    </div>
  )
}
