import { getTranslations } from 'next-intl/server'

/**
 * The fallback for every dashboard page with no nearer skeleton: Today, the weddings list, a new
 * wedding, team. It sits inside the shell, so the sidebar stays put and only the content pulses.
 *
 * The reason is prefetching, as in `weddings/[id]/loading.tsx`: a dynamic route with no loading
 * boundary gets nothing prefetched, so a sidebar click would wait on the full server render.
 */
export default async function Loading() {
  const t = await getTranslations('app.shell')
  return (
    <div aria-busy="true" className="mx-auto max-w-5xl px-6 py-8">
      <p role="status" className="sr-only">
        {t('loading')}
      </p>
      <div aria-hidden="true" className="animate-pulse">
        <div className="bg-muted h-7 w-48 rounded" />
        <div className="bg-muted mt-2 h-4 w-72 rounded" />
        <div className="border-border bg-card mt-7 divide-y overflow-hidden rounded-[var(--radius)] border">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-14 px-4 py-3">
              <div className="bg-muted h-4 w-1/2 rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
