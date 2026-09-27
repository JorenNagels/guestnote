import { getTranslations } from 'next-intl/server'
import type { ReactNode } from 'react'
import type { Locale } from '../../lib/locales.ts'
import { CONTACT_EMAIL } from '../../lib/operator.ts'
import { StartLink } from './site-frame.tsx'

/** Shared building blocks for the marketing pages. Presentational; copy comes from the caller. */

export function Container({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return <div className={`mx-auto max-w-[1120px] px-4 sm:px-6 ${className}`}>{children}</div>
}

export function PageHead({
  eyebrow,
  title,
  lede,
}: {
  eyebrow: string
  title: string
  lede?: string
}) {
  return (
    <Container className="pt-16 pb-10 sm:pt-24">
      <p className="mk-eyebrow text-primary">{eyebrow}</p>
      <h1 className="mk-display mk-h1 mt-4 max-w-[18ch]">{title}</h1>
      {lede ? <p className="mk-lede text-muted-foreground mt-5">{lede}</p> : null}
    </Container>
  )
}

/** `<details>` rows: open without JavaScript, and each question is its own heading-less button. */
export function Faq({
  title,
  items,
}: {
  title: string
  items: ReadonlyArray<{ readonly q: string; readonly a: string }>
}) {
  return (
    <section aria-labelledby="faq-title">
      <h2 id="faq-title" className="mk-display mk-h2">
        {title}
      </h2>
      <div className="border-border mt-8 divide-y divide-[var(--border)] border-y">
        {items.map((item) => (
          <details key={item.q} className="group py-5">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-6 font-medium [&::-webkit-details-marker]:hidden">
              {item.q}
              <span
                aria-hidden="true"
                className="text-muted-foreground text-xl transition-transform group-open:rotate-45"
              >
                +
              </span>
            </summary>
            <p className="text-muted-foreground mt-3 max-w-[62ch]">{item.a}</p>
          </details>
        ))}
      </div>
    </section>
  )
}

/** The closing call to action on every sales page. */
export async function ClosingCta({ locale }: { locale: Locale }) {
  const t = await getTranslations({ locale, namespace: 'marketing' })
  return (
    <section className="mk-hero">
      <Container className="flex flex-col items-start gap-6 py-20 sm:py-24">
        <h2 className="mk-display mk-h2 max-w-[20ch]">{t('home.closing.title')}</h2>
        <p className="mk-lede">{t('home.closing.body')}</p>
        <div className="flex flex-wrap items-center gap-3">
          <StartLink label={t('cta.start')} tone="gold" />
          <DemoLink label={t('cta.demo')} subject={t('cta.demoSubject')} dark />
        </div>
        <p className="text-sm opacity-80">{t('cta.noCard')}</p>
      </Container>
    </section>
  )
}

export function DemoLink({
  label,
  subject,
  dark = false,
}: {
  label: string
  subject: string
  dark?: boolean
}) {
  return (
    <a
      href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}`}
      className={`inline-flex h-11 items-center justify-center rounded-[var(--radius)] border px-5 text-sm font-semibold ${
        dark
          ? 'border-[#94cfc9]/40 text-[#ecfaf9] hover:border-[#94cfc9]'
          : 'border-border hover:border-foreground'
      }`}
    >
      {label}
    </a>
  )
}
