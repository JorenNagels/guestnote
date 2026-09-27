import { PRICING } from '@guestnote/billing'
import Link from 'next/link'
import { getFormatter, getTranslations } from 'next-intl/server'
import type { ReactNode } from 'react'
import type { Locale } from '../../../lib/locales.ts'
import { pagePath } from '../../../lib/marketing-pages.ts'
import { AnimatedMark } from '../animated-mark.tsx'
import { ClosingCta, Container, DemoLink, Faq, Stage, type StageTone } from '../blocks.tsx'
import { Envelope, Rings } from '../illustrations.tsx'
import { JsonLd } from '../json-ld.tsx'
import {
  BudgetChip,
  BudgetDemo,
  ChecklistDemo,
  RunSheetDemo,
  TodayDemo,
  VendorLinkDemo,
} from '../mini-uis.tsx'
import { StartLink } from '../site-frame.tsx'

const BANDS = ['checklist', 'runSheet', 'vendors', 'budget'] as const
const DEMOS = {
  checklist: ChecklistDemo,
  runSheet: RunSheetDemo,
  vendors: VendorLinkDemo,
  budget: BudgetDemo,
} as const
const TONES: Record<(typeof BANDS)[number], StageTone> = {
  checklist: 'teal',
  runSheet: 'gold',
  vendors: 'sage',
  budget: 'teal',
}
const FAQ = ['free', 'data', 'couples', 'languages', 'leave'] as const

/**
 * `/nl`, `/en`, `/fr` (spec 0006, "Home").
 *
 * Rewritten 2026-09-27 to drop the patterns that read as AI-made (the user's request, checked
 * against Wikipedia's "Signs of AI writing" and the AI-design-slop lists): no uppercase label
 * above each heading, no italic accent word in the headline, no dark hero with a glow, no
 * numbered 01/02/03 steps, no before/after cards. A plain descriptive headline, prose where
 * there was a list, and the product screens carrying the page.
 */
export async function HomePage({ locale }: { locale: Locale }) {
  const t = await getTranslations({ locale, namespace: 'marketing' })
  const format = await getFormatter({ locale })
  const eur = (cents: number) =>
    format.number(cents / 100, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })

  return (
    <>
      <JsonLd description={t('meta.homeDescription')} />
      <section className="border-border border-b">
        <Container className="grid items-center gap-12 py-14 sm:py-20 lg:grid-cols-[1.1fr_1fr]">
          <div>
            <AnimatedMark className="h-auto w-12 sm:w-14" />
            <h1 className="mk-display mk-h1 mk-rise mk-rise-1 mt-8 max-w-[20ch]">
              {t('home.headline')}
            </h1>
            <p className="mk-lede text-muted-foreground mk-rise mk-rise-2 mt-5">{t('home.lede')}</p>
            <div className="mk-rise mk-rise-3 mt-8 flex flex-wrap items-center gap-3">
              <StartLink label={t('cta.start')} />
              <DemoLink label={t('cta.demo')} subject={t('cta.demoSubject')} />
            </div>
            <p className="text-muted-foreground mk-rise mk-rise-3 mt-4 text-sm">
              {t('cta.noCard')}
            </p>
          </div>
          {/* The collage: Today on a teal stage, a budget card overlapping its corner, rings in
              gold -- two screens of the product and one mark of what it is for. */}
          <div className="mk-rise mk-rise-2 relative pb-10 lg:pb-0">
            <Stage tone="teal" deco={false} className="pb-16 sm:pb-20">
              <Rings
                className="mk-stage-deco -top-2 right-4 h-20 w-28 text-[var(--gold-500)]"
                accent="var(--teal-600)"
              />
              <div className="relative z-10 pt-10">
                <TodayDemo locale={locale} />
              </div>
            </Stage>
            <div className="absolute -bottom-2 left-4 z-20 sm:left-8 lg:-bottom-6">
              <BudgetChip locale={locale} />
            </div>
          </div>
        </Container>
      </section>

      <section aria-labelledby="problem-title" className="mk-band-gold">
        <Container className="grid items-center gap-10 py-16 sm:py-20 lg:grid-cols-[1.5fr_1fr]">
          <div>
            <h2 id="problem-title" className="mk-display mk-h2">
              {t('home.problem.title')}
            </h2>
            <p className="mk-lede text-muted-foreground mt-4">{t('home.problem.body')}</p>
          </div>
          <Envelope
            className="mx-auto h-auto w-48 text-[var(--teal-700)] sm:w-60"
            accent="var(--gold-600)"
          />
        </Container>
      </section>

      {BANDS.map((band, i) => {
        const Demo = DEMOS[band]
        return (
          <section key={band} aria-labelledby={`band-${band}`} className="border-border border-t">
            <Container className="grid items-center gap-10 py-16 sm:py-20 lg:grid-cols-2 lg:gap-16">
              <div className={i % 2 === 1 ? 'lg:order-2' : ''}>
                <h2 id={`band-${band}`} className="mk-display mk-h2">
                  {t(`home.bands.${band}.title`)}
                </h2>
                <p className="mk-lede text-muted-foreground mt-4">{t(`home.bands.${band}.body`)}</p>
              </div>
              <Stage tone={TONES[band]}>
                <Demo locale={locale} />
              </Stage>
            </Container>
          </section>
        )
      })}

      <Prose id="how" title={t('home.how.title')} body={t('home.how.body')} border />

      <Prose
        id="price"
        title={t('home.pricingTeaser.title')}
        body={t('home.pricingTeaser.body', {
          base: eur(PRICING.baseMonthlyCents),
          seat: eur(PRICING.seatMonthlyCents),
        })}
        border
      >
        <Link
          href={pagePath('pricing', locale)}
          className="text-primary mt-4 inline-block font-semibold underline underline-offset-4"
        >
          {t('home.pricingTeaser.link')}
        </Link>
      </Prose>

      <section className="border-border border-t">
        <Container className="py-16 sm:py-20">
          <Faq
            title={t('home.faq.title')}
            items={FAQ.map((k) => ({
              q: t(`home.faq.items.${k}.q`),
              a: t(`home.faq.items.${k}.a`),
            }))}
          />
        </Container>
      </section>

      <ClosingCta locale={locale} />
    </>
  )
}

/** A heading and a paragraph. The plain alternative to a card grid. */
function Prose({
  id,
  title,
  body,
  border = false,
  children,
}: {
  id: string
  title: string
  body: string
  border?: boolean
  children?: ReactNode
}) {
  return (
    <section aria-labelledby={`${id}-title`} className={border ? 'border-border border-t' : ''}>
      <Container className="py-16 sm:py-20">
        <h2 id={`${id}-title`} className="mk-display mk-h2">
          {title}
        </h2>
        <p className="mk-lede text-muted-foreground mt-4">{body}</p>
        {children}
      </Container>
    </section>
  )
}
