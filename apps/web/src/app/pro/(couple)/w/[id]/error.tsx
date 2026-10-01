'use client'

import { Button } from '@guestnote/ui/button'
import { useTranslations } from 'next-intl'

/**
 * A portal page that failed to load -- most often a phone at a venue with one bar (spec 0008).
 * A page render writes nothing, so trying again is always safe.
 */
export default function ErrorBoundary({ reset }: { error: Error; reset: () => void }) {
  const t = useTranslations('app.couple.portal')
  return (
    <div role="alert">
      <p className="text-sm">{t('loadError')}</p>
      <div className="mt-3 w-fit min-w-48">
        <Button onClick={reset}>{t('retry')}</Button>
      </div>
    </div>
  )
}
