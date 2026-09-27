import { PRICING } from '@guestnote/billing'
import Link from 'next/link'
import { getFormatter, getTranslations } from 'next-intl/server'
import type { ReactNode } from 'react'
import type { Locale } from '../../../lib/locales.ts'
import { pagePath } from '../../../lib/marketing-pages.ts'
import { AnimatedMark } from '../animated-mark.tsx'
import { ClosingCta, Container, DemoLink, Faq } from '../blocks.tsx'
import { JsonLd } from '../json-ld.tsx'
import { BudgetDemo, ChecklistDemo, RunSheetDemo, TodayDemo, VendorLinkDemo } from '../mini-uis.tsx'
import { StartLink } from '../site-frame.tsx'

const BANDS = ['checklist', 'runSheet', 'vendors', 'budget'] as const
const DEMOS = {
  checklist: ChecklistDemo,
  runSheet: RunSheetDemo,
  vendors: VendorLinkDemo,
  budget: BudgetDemo,
} as const
const FAQ = ['free', 'data', 'couples', 'languages', 'leave'] as const
const STEPS = ['one', 'two', 'three'] as const
const ITEMS = ['one', 'two', 'three'] as const

/** `/nl`, `/en`, `/fr` (spec 0006, "Home"). */
export async function HomePage({ locale }: { locale: Locale }) {
  const t = await getTranslations({ locale, namespace: 'marketing' })
  const format = await getFormatter({ locale })
  const eur = (cents: number) =>
    format.number(cents / 100, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })

  return (
    <>
      <JsonLd description={t('meta.homeDescription')} />
      <section className="mk-hero overflow-hidden">
        <Container className="grid items-center gap-12 py-16 sm:py-24 lg:grid-cols-[1.05fr_1fr]">
          <div>
            <AnimatedMark className="h-auto w-16 drop-shadow-[0_18px_46px_rgba(0,0,0,0.45)] sm:w-20" />
            <p className="mk-eyebrow mk-rise mk-rise-1 mt-8">{t('home.eyebrow')}</p>
            <h1 className="mk-display mk-h1 mk-rise mk-rise-2 mt-4 max-w-[16ch]">
              {t.rich('home.headline', { em: (c: ReactNode) => <em>{c}</em> })}
            </h1>
            <p className="mk-lede mk-rise mk-rise-3 mt-6">{t('home.lede')}</p>
            <div className="mk-rise mk-rise-4 mt-8 flex flex-wrap items-center gap-3">
              <StartLink label={t('cta.start')} tone="gold" />
              <DemoLink label={t('cta.demo')} subject={t('cta.demoSubject')} dark />
            </div>
            <p className="mk-rise mk-rise-4 mt-4 text-sm opacity-80">{t('cta.noCard')}</p>
          </div>
          <div className="mk-rise mk-rise-3 lg:pl-6">
            <TodayDemo locale={locale} />
          </div>
        </Container>
      </section>

      <section aria-labelledby="problem-title" className="py-20 sm:py-28">
        <Container>
          <h2 id="problem-title" className="mk-display mk-h2 max-w-[22ch]">
            {t('home.problem.title')}
          </h2>
          <p className="mk-lede text-muted-foreground mt-5">{t('home.problem.body')}</p>
          <div className="mt-12 grid gap-6 md:grid-cols-2">
            <Compare
              title={t('home.problem.before')}
              items={ITEMS.map((k) => t(`home.problem.beforeItems.${k}`))}
              tone="before"
            />
            <Compare
              title={t('home.problem.after')}
              items={ITEMS.map((k) => t(`home.problem.afterItems.${k}`))}
              tone="after"
            />
          </div>
        </Container>
      </section>

      {BANDS.map((band, i) => {
        const Demo = DEMOS[band]
        return (
          <section
            key={band}
            aria-labelledby={`band-${band}`}
            className={i % 2 === 0 ? 'bg-muted/50 py-20 sm:py-24' : 'py-20 sm:py-24'}
          >
            <Container className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
              <div className={i % 2 === 1 ? 'lg:order-2' : ''}>
                <p className="mk-eyebrow text-primary">{t(`home.bands.${band}.kicker`)}</p>
                <h2 id={`band-${band}`} className="mk-display mk-h2 mt-3">
                  {t(`home.bands.${band}.title`)}
                </h2>
                <p className="mk-lede text-muted-foreground mt-4">{t(`home.bands.${band}.body`)}</p>
              </div>
              <Demo locale={locale} />
            </Container>
          </section>
        )
      })}

      <section aria-labelledby="how-title" className="py-20 sm:py-28">
        <Container>
          <h2 id="how-title" className="mk-display mk-h2">
            {t('home.how.title')}
          </h2>
          <ol className="mt-10 grid gap-8 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s} className="border-border border-t pt-6">
                <span className="text-primary font-mono text-sm">0{i + 1}</span>
                <h3 className="mk-display mk-h3 mt-2">{t(`home.how.steps.${s}.title`)}</h3>
                <p className="text-muted-foreground mt-2">{t(`home.how.steps.${s}.body`)}</p>
              </li>
            ))}
          </ol>
        </Container>
      </section>

      <section aria-labelledby="price-title" className="bg-muted/50 py-20">
        <Container className="flex flex-col items-start gap-5 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 id="price-title" className="mk-display mk-h2">
              {t('home.pricingTeaser.title')}
            </h2>
            <p className="mk-lede text-muted-foreground mt-4">
              {t('home.pricingTeaser.body', {
                base: eur(PRICING.baseMonthlyCents),
                seat: eur(PRICING.seatMonthlyCents),
              })}
            </p>
          </div>
          <Link
            href={pagePath('pricing', locale)}
            className="text-primary shrink-0 font-semibold underline underline-offset-4"
          >
            {t('home.pricingTeaser.link')} →
          </Link>
        </Container>
      </section>

      <Container className="py-20 sm:py-28">
        <Faq
          title={t('home.faq.title')}
          items={FAQ.map((k) => ({ q: t(`home.faq.items.${k}.q`), a: t(`home.faq.items.${k}.a`) }))}
        />
      </Container>

      <ClosingCta locale={locale} />
    </>
  )
}

function Compare({
  title,
  items,
  tone,
}: {
  title: string
  items: readonly string[]
  tone: 'before' | 'after'
}) {
  return (
    <div
      className={
        tone === 'after'
          ? 'bg-card border-primary/30 rounded-[calc(var(--radius)+6px)] border p-6 shadow-sm'
          : 'border-border rounded-[calc(var(--radius)+6px)] border border-dashed p-6'
      }
    >
      <h3
        className={
          tone === 'after' ? 'text-primary font-semibold' : 'text-muted-foreground font-semibold'
        }
      >
        {title}
      </h3>
      <ul className="mt-4 flex flex-col gap-3">
        {items.map((item) => (
          <li key={item} className="flex gap-3">
            <span
              aria-hidden="true"
              className={tone === 'after' ? 'text-primary' : 'text-muted-foreground'}
            >
              {tone === 'after' ? '✓' : '–'}
            </span>
            {item}
          </li>
        ))}
      </ul>
    </div>
  )
}
