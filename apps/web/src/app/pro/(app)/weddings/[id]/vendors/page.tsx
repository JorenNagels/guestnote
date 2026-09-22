import { getWedding, getWeddingVendors } from '@guestnote/db'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { weddingLabels } from '../../../../../../components/vendors/labels.ts'
import { WeddingVendorsView } from '../../../../../../components/vendors/wedding-vendors-view.tsx'
import { getDb } from '../../../../../../lib/db.ts'
import { currentMemberships, currentOrgId } from '../../../../../../lib/principal.ts'
import { app } from '../../../../../../lib/routes.ts'

/**
 * One wedding's vendors (spec 0003, S3): who is on this wedding, and where each stands.
 *
 * `null` from either read is a 404, never a 403 (`weddings/[id]/page.tsx` says why). That
 * includes a `couple` or `editor`, who reach none of the planner screens in this build; the
 * repo refuses them rather than returning an empty list that would read as "no vendors".
 */
export default async function WeddingVendorsPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, memberships, orgId, t, t10] = await Promise.all([
    params,
    currentMemberships(),
    currentOrgId(),
    getTranslations('app.s3'),
    // `manageLink` (create/copy/revoke a signed link, spec 0003 S10) lives in S10's own
    // catalogue, not S3's -- see `labels.ts`'s `manageLinkLabels`.
    getTranslations('app.s10'),
  ])
  if (!memberships || !orgId) notFound()

  const db = getDb()
  const [wedding, data] = await Promise.all([
    getWedding(db, memberships, orgId, id),
    getWeddingVendors(db, memberships, orgId, id),
  ])
  if (!wedding || !data) notFound()

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-6">
        <p className="text-muted-foreground text-xs font-semibold tracking-[0.09em] uppercase">
          {wedding.coupleDisplayName}
        </p>
        <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-4">
          <h1 className="text-2xl font-semibold tracking-tight">{t('wedding.title')}</h1>
          <Link
            href={app.vendors()}
            className="text-muted-foreground text-xs underline underline-offset-[3px] hover:text-foreground"
          >
            {t('wedding.directoryLink')}
          </Link>
        </div>
        <p className="text-muted-foreground mt-1 text-sm">
          {t('wedding.subtitle', { count: data.linked.length })}
        </p>
      </header>
      <WeddingVendorsView
        weddingId={id}
        linked={data.linked}
        directory={data.directory}
        canCreate={data.canCreate}
        labels={weddingLabels(t, t10)}
      />
    </div>
  )
}
