import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import type { ReactNode } from 'react'
import { appHomeUrl, appLoginUrl, appSignupUrl, sessionHintUrl } from '../../lib/app-url.ts'
import { LOCALES, type Locale } from '../../lib/locales.ts'
import { type MarketingPageId, PAGE_IDS, pagePath } from '../../lib/marketing-pages.ts'
import { CONTACT_EMAIL, completeOperator } from '../../lib/operator.ts'
import { Wordmark } from '../brand/wordmark.tsx'
import { AppEntryLink } from './app-entry-link.tsx'
import { Imprint } from './imprint.tsx'

/**
 * Home, pricing, about. A features page existed until 2026-09-28 and was removed at the user's
 * request: its list repeated the homepage, which already shows each main feature in depth.
 */
const NAV = ['pricing', 'about'] as const
const LEGAL = PAGE_IDS.filter((id) => !(NAV as readonly string[]).includes(id))

type Props = {
  readonly locale: Locale
  /** Which page this is, so the language switcher lands on its counterpart, not on home. */
  readonly page: MarketingPageId
  readonly children: ReactNode
}

/** The solid "Start free" button. A plain `<a>`: it crosses to the app host (`app-url.ts`). */
export function StartLink({ label, className = '' }: { label: string; className?: string }) {
  return (
    <a
      href={appSignupUrl()}
      className={`bg-primary text-primary-foreground inline-flex h-11 items-center justify-center rounded-[var(--radius)] px-5 text-sm font-semibold hover:brightness-110 ${className}`}
    >
      {label}
    </a>
  )
}

/**
 * Header, main and footer around every marketing page (spec 0006, "Every page").
 *
 * A server component, and every link in it is known at build time, so the page stays static.
 * The only client code is `AppEntryLink`'s label swap. Under 720px the nav folds into a
 * `<details>` disclosure, which needs no JavaScript to open.
 *
 * Internal links are `next/link` (same host); anything that leaves for `app.` is a plain `<a>`
 * built by `lib/app-url.ts`, because the session cookie can only be minted there.
 */
export async function SiteFrame({ locale, page, children }: Props) {
  const t = await getTranslations({ locale, namespace: 'marketing' })
  const operator = completeOperator()

  const navLinks = NAV.map((id) => (
    <Link
      key={id}
      href={pagePath(id, locale)}
      aria-current={id === page ? 'page' : undefined}
      className="hover:text-foreground aria-[current=page]:text-foreground rounded px-2 py-1 aria-[current=page]:font-semibold"
    >
      {t(`nav.${id}`)}
    </Link>
  ))

  const switcher = (
    <nav aria-label={t('language')} className="flex gap-0.5 font-mono text-xs">
      {LOCALES.map((l) =>
        l === locale ? (
          <span
            key={l}
            aria-current="true"
            className="border-border rounded border px-1.5 py-1 font-semibold"
          >
            {l.toUpperCase()}
          </span>
        ) : (
          <Link
            key={l}
            href={pagePath(page, l)}
            hrefLang={l}
            lang={l}
            className="text-muted-foreground hover:text-foreground rounded border border-transparent px-1.5 py-1"
          >
            {l.toUpperCase()}
          </Link>
        ),
      )}
    </nav>
  )

  return (
    <div className="bg-background text-foreground flex min-h-dvh flex-col">
      <a
        href="#main"
        className="bg-card sr-only z-50 rounded px-3 py-2 focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        {t('nav.skip')}
      </a>

      <header className="bg-background/85 border-border sticky top-0 z-40 border-b backdrop-blur mk-no-print">
        <div className="mx-auto flex h-16 max-w-[1120px] items-center gap-4 px-4 sm:px-6">
          <Link
            href={pagePath('home', locale)}
            aria-label={t('nav.home')}
            className="flex items-center gap-2 rounded"
          >
            <Wordmark className="h-7 w-auto" />
            <span className="text-[0.95rem] font-semibold tracking-tight">Guestnote</span>
          </Link>

          <nav
            aria-label={t('nav.label')}
            className="text-muted-foreground ml-4 hidden gap-1 text-sm md:flex"
          >
            {navLinks}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <div className="hidden sm:block">{switcher}</div>
            <AppEntryLink
              hintUrl={sessionHintUrl()}
              loginHref={appLoginUrl()}
              loginLabel={t('login')}
              dashboardHref={appHomeUrl()}
              dashboardLabel={t('dashboard')}
              className="text-muted-foreground hover:text-foreground hidden text-sm font-medium sm:inline"
            />
            <StartLink label={t('cta.start')} className="h-9 px-4" />
            <details className="relative md:hidden">
              <summary className="border-border flex h-9 cursor-pointer list-none items-center rounded-[var(--radius)] border px-3 text-sm [&::-webkit-details-marker]:hidden">
                {t('nav.menu')}
              </summary>
              <div className="bg-card border-border absolute right-0 mt-2 flex w-56 flex-col gap-1 rounded-[var(--radius)] border p-3 text-sm shadow-lg">
                {navLinks}
                <AppEntryLink
                  hintUrl={sessionHintUrl()}
                  loginHref={appLoginUrl()}
                  loginLabel={t('login')}
                  dashboardHref={appHomeUrl()}
                  dashboardLabel={t('dashboard')}
                  className="rounded px-2 py-1"
                />
                <div className="border-border mt-2 border-t pt-3">{switcher}</div>
              </div>
            </details>
          </div>
        </div>
      </header>

      <main id="main" className="flex-1">
        {children}
      </main>

      <footer className="border-border bg-muted/40 border-t text-sm mk-no-print">
        <div className="mx-auto grid max-w-[1120px] gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <Link href={pagePath('home', locale)} className="flex items-center gap-2 rounded">
              <Wordmark className="h-6 w-auto" />
              <span className="font-semibold">Guestnote</span>
            </Link>
            <p className="text-muted-foreground mt-3 max-w-[32ch]">{t('tagline')}</p>
          </div>
          <FooterColumn title={t('footer.product')}>
            {NAV.map((id) => (
              <Link key={id} href={pagePath(id, locale)} className="hover:text-foreground">
                {t(`nav.${id}`)}
              </Link>
            ))}
            <a href={appSignupUrl()} className="hover:text-foreground">
              {t('cta.start')}
            </a>
          </FooterColumn>
          <FooterColumn title={t('footer.legal')}>
            {LEGAL.map((id) => (
              <Link key={id} href={pagePath(id, locale)} className="hover:text-foreground">
                {t(`legalPages.${id}`)}
              </Link>
            ))}
          </FooterColumn>
          <FooterColumn title={t('footer.contact')}>
            <a href={`mailto:${CONTACT_EMAIL}`} className="hover:text-foreground">
              {CONTACT_EMAIL}
            </a>
            <div className="mt-2">{switcher}</div>
          </FooterColumn>
        </div>
        <div className="text-muted-foreground border-border mx-auto max-w-[1120px] border-t px-4 py-6 text-xs sm:px-6">
          <Imprint operator={operator} labels={imprintLabels(t)} variant="line" />
          <p className="mt-1">
            © {new Date().getFullYear()} Guestnote. {t('footer.madeIn')}
          </p>
        </div>
      </footer>
    </div>
  )
}

function FooterColumn({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h2 className="text-foreground mb-3 font-semibold">{title}</h2>
      <div className="text-muted-foreground flex flex-col gap-2">{children}</div>
    </div>
  )
}

/** The imprint's labels from the catalogue, shared by the footer and the legal-notice page. */
export function imprintLabels(t: (key: string) => string) {
  return {
    name: t('imprint.name'),
    tradeName: t('imprint.tradeName'),
    form: t('imprint.form'),
    formValue: t('imprint.formValue'),
    address: t('imprint.address'),
    kbo: t('imprint.kbo'),
    vat: t('imprint.vat'),
    vatExempt: t('imprint.vatExempt'),
    email: t('imprint.email'),
  }
}
