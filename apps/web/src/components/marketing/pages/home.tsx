import { PRICING } from '@guestnote/billing'
import { getFormatter, getTranslations } from 'next-intl/server'
import type { ReactNode } from 'react'
import type { Locale } from '../../../lib/locales.ts'
import { Container, DemoLink, Faq, type StageTone, TiltedScreen } from '../blocks.tsx'
import { HeroShowcase, type ShowcaseLabels } from '../hero-showcase.tsx'
import { JsonLd } from '../json-ld.tsx'
import { BudgetChip, BudgetDemo, ChecklistDemo, CoupleDemo, RunSheetDemo } from '../mini-uis.tsx'
import { StartLink } from '../site-frame.tsx'
import { TiltCard } from '../tilt-card.tsx'

/**
 * `/nl`, `/en`, `/fr` (spec 0006, "Home"; revised 2026-09-28 from the user's pick of the variant
 * rounds: the showcase hero, the layer-by-layer 3D deep dives, the orbit, the 3D price card and
 * the closing on the hero's gradient).
 *
 *   hero       warm moving gradient, a floor grid, and four product scenes that play in turn
 *   deep dive  one row per feature: title, four concrete points, its screen turned in 3D with
 *              two detail chips floating off it
 *   together   the wedding at the centre, the people and parts around it on a slow orbit
 *   price      a card that tilts toward the pointer, beside what it costs
 *   close      the early-access line and the FAQ, on the hero's gradient
 *
 * No illustrations and no "why we make it" section -- both removed at the user's request. And
 * no small numbered label above each deep-dive heading ("01 · Takenlijst"): the same AI-made
 * tell the first rewrite removed, and it crept back in with the variants (2026-09-28).
 */

const FEATURES = ['checklist', 'runSheet', 'couple', 'budget'] as const
type Feature = (typeof FEATURES)[number]
const DEMO: Record<Feature, (p: { locale: Locale }) => Promise<ReactNode>> = {
  checklist: ChecklistDemo,
  runSheet: RunSheetDemo,
  couple: CoupleDemo,
  budget: BudgetDemo,
}
const TONE: Record<Feature, StageTone> = {
  checklist: 'teal',
  runSheet: 'gold',
  couple: 'sage',
  budget: 'teal',
}
const POINTS = ['one', 'two', 'three', 'four'] as const
const ORBIT = [
  'couple',
  'photographer',
  'caterer',
  'dj',
  'team',
  'runSheet',
  'budget',
  'florist',
] as const
const FAQ = ['free', 'data', 'couples', 'languages', 'leave'] as const
/** A real Saturday, the same wedding the hero and the mini-UIs use. */
const WEDDING = Date.UTC(2027, 5, 12)

export async function HomePage({ locale }: { locale: Locale }) {
  const t = await getTranslations({ locale, namespace: 'marketing' })
  const d = await getTranslations({ locale, namespace: 'marketing.demo' })
  const format = await getFormatter({ locale })
  const eur = (cents: number) =>
    format.number(cents / 100, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })

  return (
    <>
      <JsonLd description={t('meta.homeDescription')} />
      <Hero locale={locale} />

      <section aria-labelledby="deep-title" className="border-border border-t">
        <h2 id="deep-title" className="sr-only">
          {t('features.title')}
        </h2>
        <Container className="flex flex-col gap-28 py-28">
          {FEATURES.map((f, i) => {
            const Demo = DEMO[f]
            return (
              <div key={f} className="grid items-center gap-14 lg:grid-cols-2">
                <div className={i % 2 ? 'lg:order-2' : ''}>
                  <h3 className="mk-display text-[clamp(1.8rem,3.5vw,2.8rem)] leading-[1.06]">
                    {t(`home.bands.${f}.title`)}
                  </h3>
                  <ul className="mt-6 flex flex-col gap-3">
                    {POINTS.map((k) => (
                      <li key={k} className="flex gap-3 text-[15px]">
                        <span
                          aria-hidden="true"
                          className="bg-primary mt-2 size-1.5 shrink-0 rounded-full"
                        />
                        {t(`home.deep.${f}.points.${k}`)}
                      </li>
                    ))}
                  </ul>
                </div>
                <TiltedScreen
                  tone={TONE[f]}
                  angle={i % 2 ? 16 : -16}
                  chips={[t(`home.deep.${f}.chips.one`), t(`home.deep.${f}.chips.two`)]}
                >
                  <Demo locale={locale} />
                </TiltedScreen>
              </div>
            )
          })}
        </Container>
      </section>

      <section aria-labelledby="together-title" className="overflow-hidden bg-[#0d1b1a] text-white">
        <Container className="grid items-center gap-10 py-28 lg:grid-cols-[1fr_1.3fr]">
          <div>
            <h2
              id="together-title"
              className="mk-display text-[clamp(2rem,4vw,3rem)] leading-[1.05] text-white"
            >
              {t('home.together.title')}
            </h2>
            <p className="mt-5 max-w-[48ch] leading-relaxed text-[var(--teal-100)]/80">
              {t('home.together.body')}
            </p>
          </div>
          <div aria-hidden="true" className="relative mx-auto aspect-[1.4] w-full max-w-[620px]">
            <div className="absolute inset-[18%_22%] rounded-[50%] border border-white/10" />
            <div className="absolute top-1/2 left-1/2 z-[5] -translate-x-1/2 -translate-y-1/2 rounded-[22px] bg-white p-5 text-[var(--foreground)] shadow-[0_30px_80px_-20px_rgb(89_176_168/0.6)]">
              <p className="text-muted-foreground text-xs">{d('live.dateLabel')}</p>
              <p className="font-semibold">{d('wedding')}</p>
              <p className="mt-1 font-mono text-sm font-semibold">
                {format.dateTime(new Date(WEDDING), {
                  weekday: 'short',
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                  timeZone: 'UTC',
                })}
              </p>
            </div>
            {ORBIT.map((o, k) => (
              <span
                key={o}
                className="mk-orbit-item rounded-full border border-white/15 bg-white/10 px-3.5 py-1.5 text-sm whitespace-nowrap text-white backdrop-blur"
                style={{ animationDelay: `${(-36 / ORBIT.length) * k}s` }}
              >
                {t(`home.together.orbit.${o}`)}
              </span>
            ))}
          </div>
        </Container>
      </section>

      <section aria-labelledby="price-title">
        <Container className="grid items-center gap-12 py-28 lg:grid-cols-2">
          <TiltCard className="rounded-[28px]">
            <div className="mk-pr3d rounded-[28px] bg-[var(--teal-800)] p-10 text-white">
              <p className="text-[var(--teal-100)]">{t('pricing.card.name')}</p>
              <p className="mk-display mk-lift mt-2 text-7xl">{eur(PRICING.baseMonthlyCents)}</p>
              <p className="mt-2 text-[var(--teal-100)]">
                {t('pricing.card.perMonth')} · {t('pricing.card.exclVat')} ·{' '}
                {t('home.price.perSeat', { amount: eur(PRICING.seatMonthlyCents) })}
              </p>
              <div className="mk-lift mt-8 w-60">
                <BudgetChip locale={locale} />
              </div>
            </div>
          </TiltCard>
          <div>
            <h2 id="price-title" className="mk-display mk-h2">
              {t('home.pricingTeaser.title')}
            </h2>
            <p className="text-muted-foreground mt-4 leading-relaxed">{t('home.price.body')}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <StartLink label={t('cta.start')} />
              <DemoLink label={t('cta.demo')} subject={t('cta.demoSubject')} />
            </div>
          </div>
        </Container>
      </section>

      <section aria-labelledby="close-title" className="mk-hero-live">
        <Container className="grid gap-12 py-24 lg:grid-cols-[1fr_1.4fr]">
          <div>
            <h2 id="close-title" className="mk-display mk-h2">
              {t('home.closing.title')}
            </h2>
            <p className="text-foreground/75 mt-4 leading-relaxed">{t('home.closing.body')}</p>
            <div className="mt-8">
              <StartLink label={t('cta.start')} />
            </div>
          </div>
          <Faq
            title={t('home.faq.title')}
            items={FAQ.map((k) => ({
              q: t(`home.faq.items.${k}.q`),
              a: t(`home.faq.items.${k}.a`),
            }))}
          />
        </Container>
      </section>
    </>
  )
}

/** The hero: headline, buttons, and the four-scene showcase (`hero-showcase.tsx`). */
async function Hero({ locale }: { locale: Locale }) {
  const t = await getTranslations({ locale, namespace: 'marketing' })
  const d = await getTranslations({ locale, namespace: 'marketing.demo' })
  const labels: ShowcaseLabels = {
    scenes: {
      tasks: d('live.scenes.tasks'),
      runSheet: d('live.scenes.runSheet'),
      budget: d('live.scenes.budget'),
      couple: d('live.scenes.couple'),
    },
    wedding: d('wedding'),
    dateLabel: d('live.dateLabel'),
    moved: d('live.moved'),
    tasks: (
      [
        ['one', 90],
        ['two', 14],
        ['four', 10],
        ['three', 7],
      ] as const
    ).map(([k, days]) => ({ name: d(`checklist.${k}`), offset: d(`checklist.${k}Due`), days })),
    runSheet: {
      title: `${d('runSheet.title')} · ${d('wedding')}`,
      items: [
        {
          time: '14:00',
          what: d('runSheet.one'),
          where: d('runSheet.oneWhere'),
          who: d('runSheet.planner'),
        },
        {
          time: '15:00',
          what: d('runSheet.two'),
          where: d('runSheet.twoWhere'),
          who: d('runSheet.planner'),
        },
        {
          time: '22:30',
          what: d('runSheet.three'),
          where: d('runSheet.threeWhere'),
          who: d('runSheet.dj'),
        },
      ],
      added: {
        time: '23:00',
        what: d('live.rsNew'),
        where: d('live.rsNewWhere'),
        who: d('live.rsCaterer'),
      },
      note: d('live.rsAdded'),
    },
    budget: {
      title: `${d('budget.title')} · ${d('wedding')}`,
      spent: d('budget.spent'),
      of: d.raw('budget.of') as string,
      lines: [
        { name: d('budget.venue'), spent: 8500, allocated: 9000 },
        { name: d('budget.catering'), spent: 12400, allocated: 14000 },
        { name: d('budget.photo'), spent: 2800, allocated: 2800 },
        { name: d('budget.flowers'), spent: 1450, allocated: 2000 },
      ],
      paidLine: 3,
      paidAmount: 500,
      note: d('live.paidNote'),
    },
    couple: {
      internal: d('live.internal'),
      shared: d('live.sharedCouple'),
      tasks: [
        { name: d('live.coupleTasks.one'), shared: false },
        { name: d('live.coupleTasks.two'), shared: false },
        { name: d('live.coupleTasks.three'), shared: true },
      ],
      flips: 0,
      note: d('live.coupleNote'),
    },
  }
  return (
    <section className="mk-hero-live">
      <div className="mk-floor" />
      <Container className="relative flex flex-col items-center pt-16 pb-24 text-center sm:pt-24">
        <h1 className="mk-display mx-auto max-w-[18ch] text-[clamp(2.4rem,5.5vw,4rem)] leading-[1.04]">
          {t('home.headline')}
        </h1>
        <p className="mk-lede text-foreground/75 mx-auto mt-6">{t('home.lede')}</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <StartLink label={t('cta.start')} />
          <DemoLink label={t('cta.demo')} subject={t('cta.demoSubject')} />
        </div>
        <div className="mt-14 flex w-full justify-center">
          <HeroShowcase locale={locale} labels={labels} />
        </div>
      </Container>
    </section>
  )
}
