import { getTranslations } from 'next-intl/server'
import type { CSSProperties, ReactNode } from 'react'
import type { Locale } from '../../lib/locales.ts'
import { CONTACT_EMAIL } from '../../lib/operator.ts'
import { StartLink } from './site-frame.tsx'

/** Shared building blocks for the marketing pages. Presentational; copy comes from the caller. */

export type StageTone = 'teal' | 'gold' | 'sage'

/** A tinted panel a product preview stands on (`marketing.css`, `.mk-stage`). */
export function Stage({
  tone,
  children,
  className = '',
}: {
  tone: StageTone
  children: ReactNode
  className?: string
}) {
  return <div className={`mk-stage mk-stage-${tone} ${className}`}>{children}</div>
}

export function Container({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return <div className={`mx-auto max-w-[1120px] px-4 sm:px-6 ${className}`}>{children}</div>
}

/**
 * The page header on every marketing page but home: the hero's warm gradient and floor grid
 * (spec 0006, revised 2026-09-28), centred title and lede, and optional content that should sit
 * on the gradient too -- the pricing calculator does.
 */
export function PageHead({
  title,
  lede,
  children,
}: {
  title: string
  lede?: string
  children?: ReactNode
}) {
  return (
    <section className="mk-hero-live">
      <div className="mk-floor" />
      <Container className="relative pt-16 pb-16 text-center sm:pt-24 sm:pb-20">
        <h1 className="mk-display mx-auto max-w-[20ch] text-[clamp(2.2rem,5vw,3.6rem)] leading-[1.05]">
          {title}
        </h1>
        {lede ? <p className="mk-lede text-foreground/75 mx-auto mt-5">{lede}</p> : null}
        {children ? <div className="mt-12 text-left">{children}</div> : null}
      </Container>
    </section>
  )
}

/**
 * A product screen on a tinted stage, turned in 3D, with up to two glass chips floating off it at
 * their own depth -- the homepage's deep-dive look.
 */
export function TiltedScreen({
  tone,
  angle,
  chips = [],
  children,
}: {
  tone: StageTone
  /** Degrees around the vertical axis; negative turns the screen toward the right. */
  angle: number
  chips?: readonly string[]
  children: ReactNode
}) {
  const [first, second] = chips
  return (
    <div className="flex justify-center" style={{ perspective: '1400px' }}>
      <div
        className="relative w-full max-w-[460px]"
        style={{ transformStyle: 'preserve-3d', transform: `rotateY(${angle}deg) rotateX(10deg)` }}
      >
        <Stage tone={tone} className="mk-pr3d">
          {children}
        </Stage>
        {first ? (
          <span
            aria-hidden="true"
            className="mk-pop mk-glass -top-5 right-2 px-3.5 py-2 text-sm font-semibold max-sm:hidden sm:-right-6"
            style={{ '--z': '90px' } as CSSProperties}
          >
            {first}
          </span>
        ) : null}
        {second ? (
          <span
            aria-hidden="true"
            className="mk-pop mk-glass -bottom-5 left-2 px-3.5 py-2 font-mono text-sm max-sm:hidden sm:-left-6"
            style={{ '--z': '120px', animationDelay: '1.6s' } as CSSProperties}
          >
            {second}
          </span>
        ) : null}
      </div>
    </div>
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

/** The closing call to action on every sales page: the hero gradient, as on home. */
export async function ClosingCta({ locale }: { locale: Locale }) {
  const t = await getTranslations({ locale, namespace: 'marketing' })
  return (
    <section className="mk-hero-live">
      <Container className="py-20 text-center sm:py-24">
        <h2 className="mk-display mk-h2">{t('home.closing.title')}</h2>
        <p className="mk-lede text-foreground/75 mx-auto mt-4">{t('home.closing.body')}</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <StartLink label={t('cta.start')} />
          <DemoLink label={t('cta.demo')} subject={t('cta.demoSubject')} />
        </div>
      </Container>
    </section>
  )
}

export function DemoLink({ label, subject }: { label: string; subject: string }) {
  return (
    <a
      href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}`}
      className="border-border hover:border-foreground inline-flex h-11 items-center justify-center rounded-[var(--radius)] border px-5 text-sm font-semibold"
    >
      {label}
    </a>
  )
}
