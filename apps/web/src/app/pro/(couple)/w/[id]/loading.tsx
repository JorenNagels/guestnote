import { getTranslations } from 'next-intl/server'

/**
 * A skeleton of a portal page (spec 0008: "a skeleton, not a spinner"). Inside the wedding layout,
 * so the header and navigation stay put and only the content pulses -- and, as for the planner's
 * screens, a dynamic route with a loading boundary is one the router can prefetch.
 */
export default async function Loading() {
  const t = await getTranslations('app.shell')
  return (
    <div aria-busy="true">
      <p role="status" className="sr-only">
        {t('loading')}
      </p>
      <div
        aria-hidden="true"
        className="border-border bg-background animate-pulse divide-y overflow-hidden rounded-[var(--radius-container)] border"
      >
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-14 px-4 py-4">
            <div className="bg-muted h-4 w-2/3 rounded" />
          </div>
        ))}
      </div>
    </div>
  )
}
