import Link from 'next/link'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { AppEntryLink } from '../../../components/marketing/app-entry-link.tsx'
import { appHomeUrl, appLoginUrl, sessionHintUrl } from '../../../lib/app-url.ts'
import { isLocale, LOCALES } from '../../../lib/locales.ts'
import { marketing } from '../../../lib/routes.ts'

/**
 * Placeholder. The deployed holding page in coming-soon/ keeps serving guestnote.be until
 * there is real copy; this exists so the apex branch of proxy.ts is a real, testable route
 * rather than something bolted on later.
 *
 * The language switcher is plain `<Link>`s, not a client component: the locale IS the URL
 * on this surface, so switching language is a navigation, and there is nothing to hydrate.
 */
export default async function MarketingHome({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (isLocale(locale)) setRequestLocale(locale)

  const t = await getTranslations('marketing')

  return (
    <div className="bg-background text-foreground min-h-dvh">
      <header className="flex items-center justify-between gap-6 px-6 py-5">
        <span className="text-sm font-semibold tracking-tight">Guestnote</span>

        <div className="flex items-center gap-5">
          <nav aria-label={t('language')} className="flex gap-1 text-xs">
            {LOCALES.map((l) => (
              <span key={l}>
                {l === locale ? (
                  <strong className="rounded px-1.5 py-1 font-semibold">{l.toUpperCase()}</strong>
                ) : (
                  <Link
                    href={marketing.home(l)}
                    className="text-muted-foreground hover:text-foreground rounded px-1.5 py-1"
                  >
                    {l.toUpperCase()}
                  </Link>
                )}
              </span>
            ))}
          </nav>

          {/*
            A plain anchor, and NOT next/link, because this crosses hosts: `guestnote.be`
            to `app.guestnote.be`. next/link would try to client-navigate within this app's
            router, and neither the login route nor the dashboard exists on the apex.

            It navigates rather than opening an overlay, which is what every product with a
            separate app subdomain does -- and here it is also the only thing that can
            work. The session cookie is `__Host-` prefixed, so it can only be minted on the
            host that will read it. See lib/app-url.ts.

            Which of the two labels it shows is decided in the browser, because this page is
            prerendered behind a SHARED CloudFront cache and the apex cannot read a
            `__Host-` cookie anyway. Both URLs are computed here, on the server, so the
            client component never builds a cross-host URL of its own.
          */}
          <AppEntryLink
            hintUrl={sessionHintUrl()}
            loginHref={appLoginUrl()}
            loginLabel={t('login')}
            dashboardHref={appHomeUrl()}
            dashboardLabel={t('dashboard')}
            className="border-input hover:border-foreground inline-flex h-9 items-center rounded-[var(--radius)] border px-3.5 text-sm font-medium"
          />
        </div>
      </header>

      <main className="px-6 py-16">
        <h1 className="text-3xl font-semibold tracking-tight">Guestnote</h1>
        <p className="mt-2 max-w-prose text-base">{t('tagline')}</p>
        <p className="text-muted-foreground mt-4 max-w-prose text-sm">{t('placeholder')}</p>
      </main>
    </div>
  )
}
