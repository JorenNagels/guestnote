import { getFormatter, getTranslations } from 'next-intl/server'
import type { ReactNode } from 'react'
import { LEGAL_UPDATED, TERMS_VERSION } from '../../../lib/legal.ts'
import type { Locale } from '../../../lib/locales.ts'
import { CONTACT_EMAIL, completeOperator } from '../../../lib/operator.ts'
import { Container } from '../blocks.tsx'
import { Imprint } from '../imprint.tsx'
import { LEGAL_TEXTS, type LegalTextId } from '../legal/index.ts'
import { imprintLabels } from '../site-frame.tsx'

async function LegalShell({
  locale,
  title,
  showVersion,
  toc,
  children,
}: {
  locale: Locale
  title: string
  showVersion: boolean
  toc?: ReadonlyArray<{ id: string; title: string }>
  children: ReactNode
}) {
  const t = await getTranslations({ locale, namespace: 'marketing.legalPages' })
  const format = await getFormatter({ locale })
  const updated = format.dateTime(new Date(`${LEGAL_UPDATED}T12:00:00Z`), {
    dateStyle: 'long',
    timeZone: 'Europe/Brussels',
  })
  return (
    <>
      {/* A calm strip of the hero gradient -- no floor grid, no motion: these pages are read. */}
      <section className="mk-hero-live mk-hero-still">
        <Container className="py-14 sm:py-16">
          <h1 className="mk-display mk-h2">{title}</h1>
          <p className="text-foreground/70 mt-3 text-sm">
            {t('updated', { date: updated })}
            {showVersion ? ` · ${t('version', { version: TERMS_VERSION })}` : null}
          </p>
        </Container>
      </section>
      <Container className="grid gap-12 pt-12 pb-24 lg:grid-cols-[220px_1fr]">
        {toc && toc.length > 1 ? (
          <nav aria-labelledby="toc-title" className="mk-no-print hidden lg:block">
            <div className="sticky top-24">
              <h2
                id="toc-title"
                className="text-muted-foreground text-xs font-semibold uppercase tracking-wide"
              >
                {t('contents')}
              </h2>
              <ol className="mt-3 flex flex-col gap-2 text-sm">
                {toc.map((s) => (
                  <li key={s.id}>
                    <a href={`#${s.id}`} className="text-muted-foreground hover:text-foreground">
                      {s.title}
                    </a>
                  </li>
                ))}
              </ol>
            </div>
          </nav>
        ) : (
          <div className="hidden lg:block" />
        )}
        <article className="mk-prose">{children}</article>
      </Container>
    </>
  )
}

/** Terms, privacy, DPA, subprocessors, cookies, accessibility (spec 0006, "Legal pages"). */
export async function LegalTextPage({ locale, id }: { locale: Locale; id: LegalTextId }) {
  const t = await getTranslations({ locale, namespace: 'marketing.legalPages' })
  const doc = LEGAL_TEXTS[id][locale]
  return (
    <LegalShell
      locale={locale}
      title={t(id)}
      // The version string is what `create_studio` stores; it names the terms and the DPA
      // (the DPA is part of the terms), so it appears on exactly those two.
      showVersion={id === 'terms' || id === 'dpa'}
      toc={doc.sections}
    >
      {doc.intro}
      {doc.sections.map((s) => (
        <section key={s.id} aria-labelledby={s.id}>
          <h2 id={s.id}>{s.title}</h2>
          {s.body}
        </section>
      ))}
    </LegalShell>
  )
}

/**
 * The legal notice (WER art. XII.6). Built from `lib/operator.ts`, and until the operator is
 * complete it says the details will follow and gives the contact address -- the one element of
 * XII.6 that already exists.
 */
export async function LegalNoticePage({ locale }: { locale: Locale }) {
  const t = await getTranslations({ locale, namespace: 'marketing' })
  const operator = completeOperator()
  return (
    <LegalShell locale={locale} title={t('legalPages.legal')} showVersion={false}>
      {operator ? (
        <Imprint operator={operator} labels={imprintLabels(t)} variant="list" />
      ) : (
        <p>{t('imprint.pending', { email: CONTACT_EMAIL })}</p>
      )}
    </LegalShell>
  )
}
