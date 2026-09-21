import { getTranslations } from 'next-intl/server'

/** The skeleton. `aria-busy` and a visible-to-AT word, because a grey box says nothing. */
export default async function Loading() {
  const t = await getTranslations('app.s4')
  return (
    <div aria-busy="true" className="mx-auto max-w-5xl px-6 py-8">
      <p role="status" className="sr-only">
        {t('loading')}
      </p>
      <div className="bg-muted h-7 w-40 animate-pulse rounded" />
      <div className="mt-7 grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-2.5">
        <div className="bg-muted h-20 animate-pulse rounded-[var(--radius)]" />
        <div className="bg-muted h-20 animate-pulse rounded-[var(--radius)]" />
        <div className="bg-muted h-20 animate-pulse rounded-[var(--radius)]" />
      </div>
      <div className="bg-muted mt-5 h-64 animate-pulse rounded-[var(--radius)]" />
    </div>
  )
}
