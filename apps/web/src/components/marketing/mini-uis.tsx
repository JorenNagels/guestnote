import { Badge } from '@guestnote/ui/badge'
import { Pill } from '@guestnote/ui/pill'
import { getFormatter, getTranslations } from 'next-intl/server'
import type { CSSProperties, ReactNode } from 'react'
import type { Locale } from '../../lib/locales.ts'
import { InView } from './in-view.tsx'

/**
 * Small recreations of real Guestnote screens for the marketing pages (spec 0006, "Product
 * visuals are coded mini-UIs"). Built from `@guestnote/ui` and the dashboard tokens at the
 * dashboard's own sizes, so they are what a trial user will actually see -- and when the app
 * changes, these are the thing to change, never the other way round.
 *
 * Illustrations, not controls: the window is `aria-hidden`, and the page beside it carries the
 * same point in words. A screen reader tabbing through a fake checklist would be a trap.
 *
 * Every mini-UI is a server component inside one `InView`, and all motion is CSS in
 * `marketing.css` keyed off `data-inview` -- see `in-view.tsx`.
 */

type Props = { readonly locale: Locale }

const step = (i: number) => ({ '--i': i }) as CSSProperties

function Window({ title, children }: { title: string; children: ReactNode }) {
  return (
    <InView>
      <div aria-hidden="true" className="mk-window text-sm">
        <div className="mk-window-bar">
          <i />
          <i />
          <i />
          <span className="text-muted-foreground ml-2 text-xs font-medium">{title}</span>
        </div>
        <div className="p-4 sm:p-5">{children}</div>
      </div>
    </InView>
  )
}

export async function TodayDemo({ locale }: Props) {
  const t = await getTranslations({ locale, namespace: 'marketing.demo' })
  const rows = [
    { label: t('today.one'), wedding: t('wedding') },
    { label: t('today.two'), wedding: 'Sara & Tom' },
  ]
  return (
    <Window title={t('today.title')}>
      <p className="text-muted-foreground mk-step text-xs">{t('today.weddings')}</p>
      <h3 className="mk-step mt-3 flex items-center gap-2 font-semibold" style={step(1)}>
        {t('today.needsYou')} <Badge tone="accent">2</Badge>
      </h3>
      <ul className="mt-2 divide-y divide-[var(--border)]">
        {rows.map((r, i) => (
          <li key={r.label} className="mk-step flex items-center gap-3 py-2.5" style={step(i + 2)}>
            <span className="border-border size-4 shrink-0 rounded border" />
            <span className="flex-1">{r.label}</span>
            <span className="text-muted-foreground text-xs">{r.wedding}</span>
          </li>
        ))}
      </ul>
    </Window>
  )
}

export async function ChecklistDemo({ locale }: Props) {
  const t = await getTranslations({ locale, namespace: 'marketing.demo' })
  const rows = [
    { key: 'one', shared: false },
    { key: 'two', shared: false },
    { key: 'three', shared: true },
    { key: 'four', shared: true },
  ] as const
  return (
    <Window title={`${t('checklist.title')} · ${t('wedding')}`}>
      <ul className="divide-y divide-[var(--border)]">
        {rows.map((r, i) => (
          <li key={r.key} className="mk-step flex items-center gap-3 py-2.5" style={step(i)}>
            {i === 0 ? (
              <span className="mk-tick-box bg-primary border-primary flex size-4 shrink-0 items-center justify-center rounded border">
                <svg viewBox="0 0 16 16" className="size-3" fill="none" aria-hidden="true">
                  <path
                    className="mk-tick-path"
                    d="M3.5 8.5 6.5 11.5 12.5 5"
                    stroke="var(--primary-foreground)"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
            ) : (
              <span className="border-border size-4 shrink-0 rounded border" />
            )}
            <span
              className={
                i === 0 ? 'mk-tick-label text-muted-foreground flex-1 line-through' : 'flex-1'
              }
            >
              {t(`checklist.${r.key}`)}
            </span>
            {r.shared ? <Pill tone="info">{t('checklist.shared')}</Pill> : null}
            <span className="text-muted-foreground hidden w-28 text-right text-xs sm:inline">
              {t(`checklist.${r.key}Due`)}
            </span>
          </li>
        ))}
      </ul>
    </Window>
  )
}

export async function RunSheetDemo({ locale }: Props) {
  const t = await getTranslations({ locale, namespace: 'marketing.demo' })
  const rows = [
    {
      time: '14:00',
      length: '45 min',
      what: t('runSheet.one'),
      where: t('runSheet.oneWhere'),
      who: t('runSheet.planner'),
    },
    {
      time: '15:00',
      length: '2 h',
      what: t('runSheet.two'),
      where: t('runSheet.twoWhere'),
      who: t('runSheet.planner'),
    },
    {
      time: '22:30',
      length: '15 min',
      what: t('runSheet.three'),
      where: t('runSheet.threeWhere'),
      who: t('runSheet.dj'),
    },
  ]
  return (
    <Window title={`${t('runSheet.title')} · ${t('wedding')}`}>
      <ol className="flex flex-col gap-2">
        {rows.map((r, i) => (
          <li
            key={r.time}
            className={`${i === rows.length - 1 ? 'mk-slide' : 'mk-step'} border-border bg-background grid grid-cols-[3.5rem_1fr_auto] items-center gap-3 rounded-[var(--radius)] border px-3 py-2.5`}
            style={step(i)}
          >
            <span className="font-mono text-sm font-semibold tabular-nums">{r.time}</span>
            <span>
              <span className="block font-medium">{r.what}</span>
              <span className="text-muted-foreground text-xs">
                {r.length} · {r.where}
              </span>
            </span>
            <Pill tone={r.who === t('runSheet.dj') ? 'accent' : 'neutral'}>{r.who}</Pill>
          </li>
        ))}
      </ol>
    </Window>
  )
}

export async function BudgetDemo({ locale }: Props) {
  const t = await getTranslations({ locale, namespace: 'marketing.demo' })
  const format = await getFormatter({ locale })
  const eur = (n: number) =>
    format.number(n, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
  const lines = [
    { key: 'venue', spent: 8500, allocated: 9000 },
    { key: 'catering', spent: 12400, allocated: 14000 },
    { key: 'photo', spent: 2800, allocated: 2800 },
    { key: 'flowers', spent: 1450, allocated: 2000 },
  ] as const
  const spent = lines.reduce((s, l) => s + l.spent, 0)
  const allocated = lines.reduce((s, l) => s + l.allocated, 0)
  return (
    <Window title={`${t('budget.title')} · ${t('wedding')}`}>
      <div className="mk-step flex items-baseline justify-between">
        <span className="text-muted-foreground text-xs">{t('budget.spent')}</span>
        <span className="font-mono text-lg font-semibold tabular-nums">
          {eur(spent)}{' '}
          <span className="text-muted-foreground text-xs font-normal">
            {t('budget.of', { amount: eur(allocated) })}
          </span>
        </span>
      </div>
      <ul className="mt-4 flex flex-col gap-3">
        {lines.map((l, i) => (
          <li key={l.key} className="mk-step" style={step(i + 1)}>
            <div className="flex justify-between text-xs">
              <span>{t(`budget.${l.key}`)}</span>
              <span className="text-muted-foreground font-mono tabular-nums">
                {eur(l.spent)} / {eur(l.allocated)}
              </span>
            </div>
            <div className="bg-muted mt-1.5 h-2 overflow-hidden rounded-full">
              <div
                className="mk-bar bg-primary h-full rounded-full"
                style={{ width: `${Math.round((l.spent / l.allocated) * 100)}%`, ...step(i) }}
              />
            </div>
          </li>
        ))}
      </ul>
    </Window>
  )
}

export async function VendorLinkDemo({ locale }: Props) {
  const t = await getTranslations({ locale, namespace: 'marketing.demo' })
  return (
    <Window title="app.guestnote.be/vendor/…">
      <p className="text-muted-foreground mk-step text-xs">{t('vendor.shared')}</p>
      <div className="mk-step mt-2 flex items-center justify-between" style={step(1)}>
        <span className="font-semibold">
          {t('wedding')} · {t('date')}
        </span>
        <span className="text-xs">
          {t('vendor.guests')} <Badge tone="primary">120</Badge>
        </span>
      </div>
      <h3 className="mk-step mt-4 text-xs font-semibold uppercase tracking-wide" style={step(2)}>
        {t('vendor.title')}
      </h3>
      <div
        className="mk-step border-border mt-2 grid grid-cols-[3.5rem_1fr] gap-3 rounded-[var(--radius)] border px-3 py-2.5"
        style={step(3)}
      >
        <span className="font-mono font-semibold tabular-nums">13:30</span>
        <span>
          {t('runSheet.one')} · {t('runSheet.oneWhere')}
        </span>
      </div>
      <div className="mk-slide bg-accent text-accent-foreground mt-3 rounded-[var(--radius)] px-3 py-2.5 text-xs">
        <span className="font-semibold">{t('vendor.needs')}</span>
        <br />
        {t('vendor.need')}
      </div>
    </Window>
  )
}
