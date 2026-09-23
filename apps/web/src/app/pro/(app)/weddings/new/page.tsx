import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { weddingFormLabels } from '../../../../../components/wedding/labels.ts'
import { BLANK_WEDDING, WeddingForm } from '../../../../../components/wedding/wedding-form.tsx'
import { currentMemberships, currentOrgId } from '../../../../../lib/principal.ts'
import { app } from '../../../../../lib/routes.ts'
import { canCreateWedding } from '../../../../../lib/wedding-form-state.ts'
import { createWeddingAction } from './actions.ts'

/**
 * Where a wedding starts. Spec 0003, slice S1.
 *
 * Owner and admin only. A `member` who reaches this URL gets a sentence and no form -- not a
 * 404, because this page is not about a wedding that might not exist: there is nothing to
 * conceal, and "ask whoever invited you" is the useful answer. The action refuses them too.
 *
 * The prototype's "Starting plan" block (pick a template, get a dated checklist) is S7's and is
 * not here; a wedding is created empty and the checklist arrives with that slice.
 */
export default async function NewWeddingPage() {
  const [memberships, orgId, t, status] = await Promise.all([
    currentMemberships(),
    currentOrgId(),
    getTranslations('app.weddingPages'),
    getTranslations('app.weddings.status'),
  ])
  if (!memberships || !orgId) notFound()

  const allowed = canCreateWedding(memberships, orgId)

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <header>
        <p className="text-muted-foreground text-xs font-semibold tracking-[0.09em] uppercase">
          {t('new.eyebrow')}
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{t('new.title')}</h1>
        <p className="text-muted-foreground mt-1.5 text-sm">{t('new.intro')}</p>
      </header>

      <div className="mt-6">
        {allowed ? (
          <WeddingForm
            mode="create"
            action={createWeddingAction}
            initial={BLANK_WEDDING}
            labels={weddingFormLabels(t, status, t('form.create'))}
            cancelHref={app.weddings()}
          />
        ) : (
          <p role="status" className="text-muted-foreground max-w-prose text-sm">
            {t('new.forbidden')}
          </p>
        )}
      </div>
    </div>
  )
}
