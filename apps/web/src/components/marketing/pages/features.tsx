import { getTranslations } from 'next-intl/server'
import type { Locale } from '../../../lib/locales.ts'
import { ClosingCta, Container, PageHead } from '../blocks.tsx'
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
      <PageHead
        eyebrow={t('features.eyebrow')}
        title={t('features.title')}
        lede={t('features.lede')}
      />

      <Container className="grid gap-6 pb-16 md:grid-cols-3">
        <ChecklistDemo locale={locale} />
        <RunSheetDemo locale={locale} />
        <VendorLinkDemo locale={locale} />
      </Container>

      <Container className="pb-20 sm:pb-28">
        <ul className="grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          {ITEMS.map((item) => (
            <li key={item} className="border-border border-t pt-5">
              <h2 className="mk-display mk-h3">{t(`features.items.${item}.title`)}</h2>
              <p className="text-muted-foreground mt-2">{t(`features.items.${item}.body`)}</p>
            </li>
          ))}
        </ul>

        <aside className="bg-accent text-accent-foreground mt-16 rounded-[calc(var(--radius)+6px)] p-6 sm:p-8">
          <h2 className="font-semibold">{t('features.later.title')}</h2>
          <p className="mt-2 max-w-[62ch]">{t('features.later.body')}</p>
        </aside>
      </Container>

      <ClosingCta locale={locale} />
    </>
  )
}
