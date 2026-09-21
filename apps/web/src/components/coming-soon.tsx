import { getTranslations } from 'next-intl/server'

/**
 * Every screen a nav item points at that a slice has not built yet.
 *
 * Spec 0003 lists the sidebar's sections up front and builds the screens in parallel, so for a
 * while some links land on nothing. `docs/specs/0001` chose to omit an unbuilt section rather
 * than show it disabled, because a greyed list "reads as a demo". That reasoning was about a
 * nav that would stay unbuilt; this one is a work list with owners, and a link that answers with
 * an honest "not yet" is better than a nav that grows a row per merge. Rejected: a 404 -- it
 * says the address is wrong when the address is right.
 *
 * Each slice **replaces its stub's `page.tsx`** rather than editing this component, so this
 * file never needs a merge. Once every slice has landed it has no callers and goes.
 *
 * `screen` is a key under `app.shell.nav`, so the heading is the same word the sidebar uses.
 * It renders no data and asks no question about the wedding in the URL: a stub cannot leak that
 * a wedding exists, and the real page is where the 404-not-403 rule applies.
 */
export type ComingSoonScreen =
  | 'today'
  | 'templates'
  | 'template'
  | 'vendors'
  | 'team'
  | 'newWedding'
  | 'settings'
  | 'checklist'
  | 'task'
  | 'budget'
  | 'payments'
  | 'runSheet'
  | 'files'
  | 'moodboard'

export async function ComingSoon({ screen }: { screen: ComingSoonScreen }) {
  const t = await getTranslations('app.shell')

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <header>
        <p className="text-muted-foreground text-xs font-semibold tracking-[0.09em] uppercase">
          {t('comingSoon.title')}
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{t(`nav.${screen}`)}</h1>
      </header>
      <p className="text-muted-foreground mt-4 max-w-prose text-sm leading-relaxed">
        {t('comingSoon.body')}
      </p>
    </div>
  )
}
