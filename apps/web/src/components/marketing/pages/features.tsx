import { getTranslations } from 'next-intl/server'
import type { Locale } from '../../../lib/locales.ts'
import { ClosingCta, Container, PageHead, TiltedScreen } from '../blocks.tsx'
import { ChecklistDemo, RunSheetDemo, VendorLinkDemo } from '../mini-uis.tsx'

/**
 * Every capability a trial user can find today, and one line for what comes later (spec 0006,
 * "Only built features are sold"). A feature is added here when it ships, not when it is planned.
 */
const ITEMS = [
  'today',
  'weddings',
  'checklist',
  'templates',
  'runSheet',
  'vendorLink',
  'budget',
  'files',
  'team',
  'studio',
  'languages',
  'passkeys',
] as const

export async function FeaturesPage({ locale }: { locale: Locale }) {
  const t = await getTranslations({ locale, namespace: 'marketing' })
  return (
    <>
      <PageHead title={t('features.title')} lede={t('features.lede')} />

      <Container className="grid gap-12 py-20 lg:grid-cols-3 lg:gap-6">
        <TiltedScreen
          tone="teal"
          angle={-10}
          stageClassName="lg:!p-3"
          chips={[t('home.deep.checklist.chips.one'), t('home.deep.checklist.chips.two')]}
        >
          <ChecklistDemo locale={locale} />
        </TiltedScreen>
        <TiltedScreen
          tone="gold"
          angle={0}
          stageClassName="lg:!p-3"
          chips={[t('home.deep.runSheet.chips.one'), t('home.deep.runSheet.chips.two')]}
        >
          <RunSheetDemo locale={locale} />
        </TiltedScreen>
        <TiltedScreen
          tone="sage"
          angle={10}
          stageClassName="lg:!p-3"
          chips={[t('features.vendorChips.one'), t('features.vendorChips.two')]}
        >
          <VendorLinkDemo locale={locale} />
        </TiltedScreen>
      </Container>

      <Container className="pb-20 sm:pb-28">
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ITEMS.map((item) => (
            <li
              key={item}
              className="bg-card border-border rounded-[20px] border p-6 transition-transform duration-300 hover:-translate-y-1 hover:shadow-[0_24px_50px_-28px_rgb(6_33_31/0.35)]"
            >
              <h2 className="mk-display text-xl leading-tight">
                {t(`features.items.${item}.title`)}
              </h2>
              <p className="text-muted-foreground mt-2 text-[15px] leading-relaxed">
                {t(`features.items.${item}.body`)}
              </p>
            </li>
          ))}
        </ul>

        <aside className="mk-stage mk-stage-gold mt-12">
          <h2 className="font-semibold">{t('features.later.title')}</h2>
          <p className="text-foreground/80 mt-2 max-w-[62ch]">{t('features.later.body')}</p>
        </aside>
      </Container>

      <ClosingCta locale={locale} />
    </>
  )
}
