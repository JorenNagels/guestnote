import { getTranslations } from 'next-intl/server'

/**
 * One skeleton for every wedding screen that has no closer one of its own: the overview, the
 * checklist and a task, files, moodboard and settings. Budget, payments, run sheet and vendors
 * keep their own, which are nearer and shaped like their page.
 *
 * It exists for prefetching more than for looks. Every page here is dynamic (session plus
 * `withTenant`), and without Cache Components Next prefetches a dynamic route only as far as its
 * first loading boundary -- with none, a `<Link>` prefetches nothing and the click waits on the
 * whole server render before the screen moves. With this one the skeleton is already in the
 * client cache and paints on click. See node_modules/next/dist/docs/01-app/02-guides/prefetching.md.
 *
 * Generic rather than one per screen: shaped as a title and a list, which is what all six share.
 * A per-screen skeleton would be closer for a moment and six more files to keep in step.
 *
 * **Content only.** It renders inside `layout.tsx`, below the wedding's header and tab strip,
 * which stay on screen through a tab switch. It used to draw grey bars for the header and the
 * strip too, so every tab click blanked the title the planner was already reading (2026-09-24).
 */
export default async function Loading() {
  const t = await getTranslations('app.shell')
  return (
    <div aria-busy="true" className="mx-auto max-w-5xl px-6 pt-6 pb-8">
      <p role="status" className="sr-only">
        {t('loading')}
      </p>
      <div aria-hidden="true" className="animate-pulse">
        <div className="bg-muted h-6 w-40 rounded" />
        <div className="border-border bg-card mt-6 divide-y overflow-hidden rounded-[var(--radius)] border">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-12 px-4 py-3">
              <div className="bg-muted h-4 w-2/3 rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
