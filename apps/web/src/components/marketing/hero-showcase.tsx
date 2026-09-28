'use client'

import { type ReactNode, useEffect, useState } from 'react'

const SCENES = ['tasks', 'runSheet', 'budget', 'couple'] as const
type Scene = (typeof SCENES)[number]

export type ShowcaseLabels = Readonly<{
  scenes: Readonly<Record<Scene, string>>
  wedding: string
  dateLabel: string
  moved: string
  tasks: ReadonlyArray<Readonly<{ name: string; offset: string; days: number }>>
  runSheet: Readonly<{
    title: string
    items: ReadonlyArray<Readonly<{ time: string; what: string; where: string; who: string }>>
    added: Readonly<{ time: string; what: string; where: string; who: string }>
    note: string
  }>
  budget: Readonly<{
    title: string
    spent: string
    of: string
    lines: ReadonlyArray<Readonly<{ name: string; spent: number; allocated: number }>>
    paidLine: number
    paidAmount: number
    note: string
  }>
  couple: Readonly<{
    internal: string
    shared: string
    tasks: ReadonlyArray<Readonly<{ name: string; shared: boolean }>>
    flips: number
    note: string
  }>
}>

/** Two real Saturdays a week apart, so the demo never shows a date that does not exist. */
const DATES = [Date.UTC(2027, 5, 12), Date.UTC(2027, 5, 19)] as const
const DAY = 86_400_000
/** How long each scene plays, and when inside it the change happens. */
const SCENE_MS = 6500
const CHANGE_MS = 2000

/**
 * The hero's showcase (2026-09-28): four scenes of the product, one change each, played in turn.
 *
 *   tasks     the wedding date moves a week and every deadline recalculates
 *   runSheet  a new item slides into the day
 *   budget    a payment lands and the totals update
 *   couple    a task goes from internal to shared with the couple
 *
 * Each scene starts in its "before" state and changes once, so a visitor sees cause and effect
 * rather than a slideshow. The tabs are real buttons; clicking one jumps there and restarts the
 * clock. Under `prefers-reduced-motion` nothing plays by itself and every scene shows its
 * "after" state, so the content is all there without motion.
 */
export function HeroShowcase({ locale, labels }: { locale: string; labels: ShowcaseLabels }) {
  const [scene, setScene] = useState<Scene>('tasks')
  const [changed, setChanged] = useState(false)
  const [reduced, setReduced] = useState(false)
  const [round, setRound] = useState(0)

  useEffect(() => {
    setReduced(window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  }, [])

  useEffect(() => {
    if (reduced) {
      setChanged(true)
      return
    }
    setChanged(false)
    const change = window.setTimeout(() => setChanged(true), CHANGE_MS)
    const next = window.setTimeout(() => {
      setScene(SCENES[(SCENES.indexOf(scene) + 1) % SCENES.length] ?? 'tasks')
      setRound((r) => r + 1)
    }, SCENE_MS)
    return () => {
      window.clearTimeout(change)
      window.clearTimeout(next)
    }
  }, [scene, reduced])

  const pick = (s: Scene) => {
    setScene(s)
    setRound((r) => r + 1)
  }

  return (
    <div className="w-full max-w-xl">
      <div role="tablist" className="mk-glass mx-auto mb-4 flex w-fit gap-1 p-1 text-sm">
        {SCENES.map((s) => (
          <button
            key={s}
            type="button"
            role="tab"
            aria-selected={s === scene}
            onClick={() => pick(s)}
            className="relative cursor-pointer overflow-hidden rounded-[14px] px-3.5 py-1.5 font-medium aria-selected:bg-white aria-selected:shadow-sm"
          >
            {labels.scenes[s]}
            {s === scene && !reduced ? (
              <span
                key={round}
                aria-hidden="true"
                className="mk-progress bg-primary absolute bottom-0 left-0 h-0.5"
              />
            ) : null}
          </button>
        ))}
      </div>
      <div aria-hidden="true" className="mk-glass min-h-[400px] p-5 text-left sm:p-6">
        <div key={`${scene}-${round}`} className="mk-roll">
          {scene === 'tasks' ? <Tasks locale={locale} labels={labels} changed={changed} /> : null}
          {scene === 'runSheet' ? <RunSheet labels={labels.runSheet} changed={changed} /> : null}
          {scene === 'budget' ? (
            <Budget locale={locale} labels={labels.budget} changed={changed} />
          ) : null}
          {scene === 'couple' ? <Couple labels={labels.couple} changed={changed} /> : null}
        </div>
      </div>
    </div>
  )
}

function Note({ show, children }: { show: boolean; children: ReactNode }) {
  return (
    <p className={`mt-3 text-xs ${show ? 'mk-roll text-primary' : 'text-transparent'}`}>
      {children}
    </p>
  )
}

function Tasks({
  locale,
  labels,
  changed,
}: {
  locale: string
  labels: ShowcaseLabels
  changed: boolean
}) {
  const wedding = DATES[changed ? 1 : 0]
  const short = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' })
  const long = new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  })
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-muted-foreground text-xs">{labels.dateLabel}</p>
          <p className="font-semibold">{labels.wedding}</p>
        </div>
        <span
          key={wedding}
          className="mk-flash bg-card border-border rounded-full border px-3 py-1 font-mono text-sm font-semibold tabular-nums"
        >
          {long.format(wedding)}
        </span>
      </div>
      <ul className="mt-4 divide-y divide-[var(--border)]">
        {labels.tasks.map((task) => (
          <li key={task.name} className="flex items-center gap-3 py-2.5 text-sm">
            <span className="border-border size-4 shrink-0 rounded border" />
            <span className="flex-1">{task.name}</span>
            <span className="text-muted-foreground hidden text-xs sm:inline">{task.offset}</span>
            <span className="w-16 overflow-hidden text-right">
              <span
                key={wedding}
                className="mk-roll inline-block font-mono text-xs font-semibold tabular-nums"
              >
                {short.format(wedding - task.days * DAY)}
              </span>
            </span>
          </li>
        ))}
      </ul>
      <Note show={changed}>{labels.moved}</Note>
    </>
  )
}

function RunSheet({ labels, changed }: { labels: ShowcaseLabels['runSheet']; changed: boolean }) {
  const rows = changed ? [...labels.items, labels.added] : labels.items
  return (
    <>
      <p className="font-semibold">{labels.title}</p>
      <ol className="mt-3 flex flex-col gap-2">
        {rows.map((r) => (
          <li
            key={r.what}
            className={`${r === labels.added ? 'mk-roll border-primary/40' : 'border-border'} bg-background grid grid-cols-[3.5rem_1fr_auto] items-center gap-3 rounded-[var(--radius)] border px-3 py-2 text-sm`}
          >
            <span className="font-mono font-semibold tabular-nums">{r.time}</span>
            <span>
              <span className="block font-medium">{r.what}</span>
              <span className="text-muted-foreground text-xs">{r.where}</span>
            </span>
            <span className="bg-muted rounded-full px-2 py-0.5 text-[11px] font-medium">
              {r.who}
            </span>
          </li>
        ))}
      </ol>
      <Note show={changed}>{labels.note}</Note>
    </>
  )
}

function Budget({
  locale,
  labels,
  changed,
}: {
  locale: string
  labels: ShowcaseLabels['budget']
  changed: boolean
}) {
  const eur = (n: number) =>
    new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 0,
    }).format(n)
  const lines = labels.lines.map((l, i) =>
    changed && i === labels.paidLine ? { ...l, spent: l.spent + labels.paidAmount } : l,
  )
  const spent = lines.reduce((s, l) => s + l.spent, 0)
  const allocated = lines.reduce((s, l) => s + l.allocated, 0)
  return (
    <>
      <div className="flex items-baseline justify-between">
        <span className="font-semibold">{labels.title}</span>
        <span key={spent} className="mk-roll font-mono text-lg font-semibold tabular-nums">
          {eur(spent)}{' '}
          <span className="text-muted-foreground text-xs font-normal">
            {labels.of.replace('{amount}', eur(allocated))}
          </span>
        </span>
      </div>
      <ul className="mt-4 flex flex-col gap-3">
        {lines.map((l) => (
          <li key={l.name}>
            <div className="flex justify-between text-xs">
              <span>{l.name}</span>
              <span className="text-muted-foreground font-mono tabular-nums">
                {eur(l.spent)} / {eur(l.allocated)}
              </span>
            </div>
            <div className="bg-muted mt-1.5 h-2 overflow-hidden rounded-full">
              <div
                className="bg-primary h-full rounded-full transition-[width] duration-700 ease-out"
                style={{ width: `${Math.round((l.spent / l.allocated) * 100)}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
      <Note show={changed}>{labels.note}</Note>
    </>
  )
}

function Couple({ labels, changed }: { labels: ShowcaseLabels['couple']; changed: boolean }) {
  return (
    <>
      <ul className="divide-y divide-[var(--border)]">
        {labels.tasks.map((t, i) => {
          const shared = i === labels.flips ? changed : t.shared
          return (
            <li key={t.name} className="flex items-center gap-3 py-3 text-sm">
              <span className="border-border size-4 shrink-0 rounded border" />
              <span className="flex-1">{t.name}</span>
              <span
                key={String(shared)}
                className={`${i === labels.flips ? 'mk-flash' : ''} rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                  shared
                    ? 'bg-[var(--teal-100)] text-[var(--teal-900)]'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {shared ? labels.shared : labels.internal}
              </span>
            </li>
          )
        })}
      </ul>
      <p className="text-muted-foreground mt-4 text-xs">{labels.note}</p>
    </>
  )
}
