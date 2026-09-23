import { listVendors } from '@guestnote/db'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { DirectoryView } from '../../../../components/vendors/directory-view.tsx'
import { directoryLabels } from '../../../../components/vendors/labels.ts'
import { getDb } from '../../../../lib/db.ts'
import { currentMemberships, currentOrgId } from '../../../../lib/principal.ts'

/**
 * The studio's vendor directory (spec 0003, S3). Every wedding's vendor list picks from it.
 *
 * `null` from `listVendors` is a 404 and not a 403: no standing in the org, and a `member`
 * assigned to no wedding, look the same from here on purpose. The write test is the repo's
 * `vendorDirectoryAccess`, the same function the actions call, so what this draws and what an
 * action allows cannot be two opinions.
 */
export default async function VendorsPage() {
  const [memberships, orgId, t] = await Promise.all([
    currentMemberships(),
    currentOrgId(),
    getTranslations('app.vendors'),
  ])
  if (!memberships || !orgId) notFound()

  const directory = await listVendors(getDb(), memberships, orgId)
  if (!directory) notFound()

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">{t('directory.title')}</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {t('directory.subtitle', { count: directory.vendors.length })}
        </p>
      </header>
      <DirectoryView
        vendors={directory.vendors}
        canWrite={directory.canWrite}
        labels={directoryLabels(t)}
      />
    </div>
  )
}
