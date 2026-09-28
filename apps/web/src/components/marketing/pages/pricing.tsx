import { getTranslations } from 'next-intl/server'
import type { Locale } from '../../../lib/locales.ts'
import { ClosingCta, Container, Faq, PageHead } from '../blocks.tsx'
import { JsonLd } from '../json-ld.tsx'
import { PricingCard } from '../pricing-card.tsx'

const INCLUDED = ['weddings', 'vendors', 'templates', 'languages', 'eu', 'support'] as const
const FAQ = ['planner', 'vat', 'cancel', 'yearly'] as const
const CARD_LABELS = [
  'name',
  'cycle',
  'monthly',
  'yearly',
  'yearlyNote',
  'perMonth',
  'perYear',
  'seats',
  'seatsHelp',
  'fewer',
  'more',
  'base',
  'total',
  'exclVat',
] as const

/**
 * The stepper stops here. Not a product limit -- `quote()` has none -- but a studio bigger than
 * this is a conversation, and the card has to resolve every plural label it can show on the
 * server, because ICU plurals are not shipped to the client island.
 */
const MAX_SEATS = 10

/**
 * `/nl/prijzen` (spec 0006, "Pricing is public").
 *
 * `billingOn` picks the banner: the early-access line while billing is off (demo mode, spec
 * 0005), the one-month trial once it is on. Read at build time through `lib/billing-mode.ts`, so
 * the page stays static and turning billing on takes a deploy to show here -- which it takes
 * anyway, since the variable is read at deploy.
 */
export async function PricingPage({ locale, billingOn }: { locale: Locale; billingOn: boolean }) {
  const t = await getTranslations({ locale, namespace: 'marketing' })
  const labels = Object.fromEntries(CARD_LABELS.map((k) => [k, t(`pricing.card.${k}`)])) as Record<
    (typeof CARD_LABELS)[number],
    string
  >
  const extraLabels = Object.fromEntries(
    Array.from({ length: MAX_SEATS }, (_, i) => [i, t('pricing.card.extra', { count: i })]),
  )

  return (
    <>
      <JsonLd description={t('meta.pricingDescription')} />
      <PageHead title={t('pricing.title')} lede={t('pricing.lede')}>
        <p
          role="note"
          className="mk-glass mx-auto mb-8 w-fit max-w-[62ch] px-5 py-3 text-center text-sm"
        >
          {billingOn ? t('pricing.trial') : t('pricing.earlyAccess')}
        </p>
        <div className="grid items-start gap-6 lg:grid-cols-[1.15fr_1fr]">
          <PricingCard
            locale={locale}
            labels={labels}
            extraLabels={extraLabels}
            maxSeats={MAX_SEATS}
          />
          <div className="mk-glass p-6 sm:p-8">
            <h2 className="mk-display mk-h3">{t('pricing.included.title')}</h2>
            <ul className="mt-4 flex list-disc flex-col gap-2 pl-5">
              {INCLUDED.map((k) => (
                <li key={k}>{t(`pricing.included.items.${k}`)}</li>
              ))}
            </ul>
          </div>
        </div>
      </PageHead>

      <Container className="py-20 sm:py-28">
        <Faq
          title={t('pricing.faq.title')}
          items={FAQ.map((k) => ({
            q: t(`pricing.faq.items.${k}.q`),
            a: t(`pricing.faq.items.${k}.a`),
          }))}
        />
      </Container>

      <ClosingCta locale={locale} />
    </>
  )
}
