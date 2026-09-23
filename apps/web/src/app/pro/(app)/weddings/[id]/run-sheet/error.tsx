'use client'

import { Button } from '@guestnote/ui/button'
import { useTranslations } from 'next-intl'

/** A failed read. A page render writes nothing, so the copy can say nothing was changed. */
export default function ErrorBoundary({ reset }: { error: Error; reset: () => void }) {
  const t = useTranslations('app.runSheet.error')
  return (
    <div role="alert" className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <h1 className="text-xl font-semibold tracking-tight">{t('title')}</h1>
      <p className="text-muted-foreground mt-2 text-sm">{t('body')}</p>
      <div className="mt-4 max-w-48">
        <Button onClick={reset}>{t('retry')}</Button>
      </div>
    </div>
  )
}
