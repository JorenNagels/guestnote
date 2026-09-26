import { principalForOrg, studioSettings } from '@guestnote/db'
import { Card } from '@guestnote/ui/card'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { RenameForm } from '../../../../components/studio/rename-form.tsx'
import { StudioLogo } from '../../../../components/studio/studio-logo.tsx'
import { getDb } from '../../../../lib/db.ts'
import { currentCaller } from '../../../../lib/principal.ts'
import { logoUrl } from '../../../../lib/studio-logo.ts'
import {
  confirmStudioLogo,
  removeStudioLogo,
  renameStudioAction,
  startStudioLogoUpload,
} from './actions.ts'

/**
 * `/studio` -- spec 0005, "Studio page": the studio's logo and its name. Owner and admin only,
 * and **a 404 for a member**, unlike Team's explanatory notice: a member has no Studio item in
 * their sidebar (`shell.tsx`), so the only way here is a typed URL, and the 404-not-403 rule
 * `getWedding` follows applies -- nothing distinguishes a page you may not use from one that
 * does not exist.
 *
 * `principalForOrg` here is that courtesy and not the gate: the Server Functions in
 * `actions.ts` resolve the caller and ask the same question for themselves (invariant 7).
 */
export default async function StudioPage() {
  const [caller, t] = await Promise.all([currentCaller(), getTranslations('app.studio')])
  if (!caller || !principalForOrg(caller.memberships, caller.orgId)) notFound()

  const settings = await studioSettings(getDb(), caller.memberships, caller.orgId)
  if (!settings) notFound()
  const url = await logoUrl(caller.orgId, settings.logoKey)

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t('subtitle')}</p>
      </header>

      <div className="mt-7 flex flex-col gap-5">
        <Card as="section" aria-label={t('logo.label')} className="px-5 py-5">
          <StudioLogo
            url={url}
            labels={{
              label: t('logo.label'),
              upload: t('logo.upload'),
              replace: t('logo.replace'),
              remove: t('logo.remove'),
              uploading: t('logo.uploading'),
              removing: t('logo.removing'),
              help: t('logo.help'),
              added: t('logo.added'),
              removed: t('logo.removed'),
              errors: {
                notImage: t('logo.errors.notImage'),
                tooLarge: t('logo.errors.tooLarge'),
                failed: t('logo.errors.failed'),
              },
            }}
            actions={{
              start: startStudioLogoUpload,
              confirm: confirmStudioLogo,
              remove: removeStudioLogo,
            }}
          />
        </Card>

        <Card as="section" aria-labelledby="studio-name-title" className="px-5 py-5">
          <h2 id="studio-name-title" className="mb-3 text-base font-semibold">
            {t('name.title')}
          </h2>
          <RenameForm
            initialName={settings.name}
            action={renameStudioAction}
            labels={{
              label: t('name.label'),
              save: t('name.save'),
              saving: t('name.saving'),
              saved: t('name.saved'),
              errors: {
                required: t('name.errors.required'),
                tooLong: t('name.errors.tooLong'),
                failed: t('name.errors.failed'),
              },
            }}
          />
        </Card>
      </div>
    </div>
  )
}
