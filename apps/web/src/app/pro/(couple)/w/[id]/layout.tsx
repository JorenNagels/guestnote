import { notFound } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import type { ReactNode } from 'react'
import { CoupleIntl } from '../../../../../components/couple/portal/intl.tsx'
import { PortalNav } from '../../../../../components/couple/portal/portal-nav.tsx'
import { formatCivilDate } from '../../../../../lib/civil-date.ts'
import { currentCouple } from '../../../../../lib/couple.ts'
import { app } from '../../../../../lib/routes.ts'
import { signOut } from '../../../(app)/actions.ts'

/**
 * One wedding's portal (spec 0008): the header, the modules the planner switched on, and the
 * planner's contact at the foot of every page. `currentCouple` is the gate; its `null` -- not
 * signed in as a couple of this wedding, whatever the reason -- is a 404, never a 403.
 *
 * A `draft` wedding is closed: the header and one sentence, and no module at all, so the child
 * page is not rendered. `archived` is read-only, said once here in a banner; each page hides its
 * write controls and the database refuses the writes regardless.
 */
export default async function WeddingPortalLayout({
  params,
  children,
}: {
  params: Promise<{ id: string }>
  children: ReactNode
}) {
  const [{ id }, t, locale] = await Promise.all([
    params,
    getTranslations('app.couple.portal'),
    getLocale(),
  ])
  const c = await currentCouple(id)
  if (!c) notFound()
  const { home } = c

  const on = new Set(home.modules)
  const nav = [
    { href: app.couple(id), label: t('nav.home') },
    ...(on.has('tasks') ? [{ href: app.couplePlanning(id), label: t('nav.tasks') }] : []),
    ...(on.has('moodboards')
      ? [{ href: app.coupleMoodboards(id), label: t('nav.moodboards') }]
      : []),
    ...(on.has('run_sheet') ? [{ href: app.coupleDay(id), label: t('nav.runSheet') }] : []),
    ...(on.has('vendors') ? [{ href: app.coupleVendors(id), label: t('nav.vendors') }] : []),
    ...(on.has('budget') ? [{ href: app.coupleBudget(id), label: t('nav.budget') }] : []),
  ]

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:py-8">
      <header className="mb-4">
        <p className="text-muted-foreground text-sm">{home.studioName}</p>
        <h1 className="mt-0.5 text-2xl font-semibold tracking-tight">{home.coupleDisplayName}</h1>
        {(home.weddingDate || home.venue) && (
          <p className="text-muted-foreground mt-1 text-sm">
            {[home.weddingDate ? formatCivilDate(locale, home.weddingDate) : null, home.venue]
              .filter(Boolean)
              .join(' · ')}
          </p>
        )}
      </header>

      {home.status === 'draft' ? (
        <p className="border-border bg-background rounded-[var(--radius-container)] border p-5 text-sm leading-relaxed">
          {t('draft', { studio: home.studioName })}
        </p>
      ) : (
        <>
          <PortalNav items={nav} label={t('title')} />
          {home.status === 'archived' && (
            <p
              role="status"
              className="bg-surface-container mt-4 rounded-[var(--radius-container)] px-4 py-3 text-sm"
            >
              {t('archived')}
            </p>
          )}
          <main className="mt-5">
            <CoupleIntl>{children}</CoupleIntl>
          </main>
        </>
      )}

      <footer className="text-muted-foreground mt-10 flex flex-wrap items-center justify-between gap-3 text-sm print:hidden">
        {home.contact ? (
          <p>
            {home.contact.name
              ? t('contact', { name: home.contact.name, email: home.contact.email })
              : t('contactNoName', { email: home.contact.email })}
          </p>
        ) : (
          <span />
        )}
        <form action={signOut}>
          <button type="submit" className="underline underline-offset-2">
            {t('signOut')}
          </button>
        </form>
      </footer>
    </div>
  )
}
