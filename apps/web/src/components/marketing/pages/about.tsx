import { getTranslations } from 'next-intl/server'
import type { Locale } from '../../../lib/locales.ts'
import { CONTACT_EMAIL, completeOperator } from '../../../lib/operator.ts'
import { Container, PageHead } from '../blocks.tsx'
import { Imprint } from '../imprint.tsx'
import { imprintLabels } from '../site-frame.tsx'

/** `/nl/over-ons` (spec 0006, "About + contact"). */
export async function AboutPage({ locale }: { locale: Locale }) {
  const t = await getTranslations({ locale, namespace: 'marketing' })
  const operator = completeOperator()
  return (
    <>
      <PageHead title={t('about.title')} />
      <Container className="grid gap-16 py-20 lg:grid-cols-[1.4fr_1fr]">
        <div className="mk-lede flex flex-col gap-5">
          <p>{t('about.body1')}</p>
          <p>{t('about.body2')}</p>
        </div>
        <aside className="flex flex-col gap-10">
          <section className="mk-stage mk-stage-teal">
            <h2 className="mk-display mk-h3">{t('about.contactTitle')}</h2>
            <p className="text-foreground/80 mt-2">{t('about.contactBody')}</p>
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="text-primary mt-3 inline-block font-semibold underline underline-offset-4"
            >
              {CONTACT_EMAIL}
            </a>
          </section>
          {operator ? (
            <section className="text-sm">
              <h2 className="mk-display mk-h3 mb-4">{t('about.legalTitle')}</h2>
              <Imprint operator={operator} labels={imprintLabels(t)} variant="list" />
            </section>
          ) : null}
        </aside>
      </Container>
    </>
  )
}
