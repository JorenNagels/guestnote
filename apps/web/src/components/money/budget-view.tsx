'use client'

import type { BudgetLine, BudgetPayment, VendorOption } from '@guestnote/db'
import { Button } from '@guestnote/ui/button'
import { Card } from '@guestnote/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableFoot,
  TableHead,
  TableHeaderCell,
} from '@guestnote/ui/table'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Fragment, useState } from 'react'
import { budgetTotals, formatCents, groupByCategory, moneyLocale } from '../../lib/money.ts'
import { app } from '../../lib/routes.ts'
import { LineSheet } from './line-sheet.tsx'

type SheetState = { line: BudgetLine | null; category: string } | null

/**
 * The budget screen: three totals, then one row per category that opens onto its lines.
 *
 * Every figure is derived here from the rows it was given. Nothing is stored (spec 0003), so a
 * total cannot disagree with the lines under it.
 */
export function BudgetView({
  weddingId,
  coupleName,
  locale,
  lines,
  payments,
  vendors,
}: {
  weddingId: string
  coupleName: string
  locale: string
  lines: BudgetLine[]
  payments: BudgetPayment[]
  vendors: VendorOption[]
}) {
  const t = useTranslations('app.money.budget')
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set())
  const [sheet, setSheet] = useState<SheetState>(null)

  const eur = (cents: number) => formatCents(cents, locale)
  const pct = (ratio: number) =>
    new Intl.NumberFormat(moneyLocale(locale), {
      style: 'percent',
      maximumFractionDigits: 0,
    }).format(ratio)
  const groups = groupByCategory(lines, payments)
  const totals = budgetTotals(lines)
  const paidTotal = groups.reduce((sum, g) => sum + g.paidCents, 0)
  const categories = groups.map((g) => g.category)

  const toggle = (category: string) =>
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(category)) next.delete(category)
      else next.add(category)
      return next
    })

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-muted-foreground text-xs font-semibold tracking-[0.09em] uppercase">
            {coupleName}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{t('title')}</h1>
          <p className="text-muted-foreground mt-1 text-sm">{t('subtitle')}</p>
        </div>
        <div className="flex gap-2">
          <Link
            href={app.weddingPayments(weddingId)}
            className="border-input hover:border-foreground inline-flex h-11 items-center rounded-[var(--radius)] border px-4 text-sm font-medium"
          >
            {t('toPayments')}
          </Link>
          {lines.length > 0 && (
            <div className="w-44">
              <Button onClick={() => setSheet({ line: null, category: '' })}>{t('add')}</Button>
            </div>
          )}
        </div>
      </header>

      {lines.length === 0 ? (
        <Card className="mt-7 max-w-xl">
          <h2 className="text-base font-semibold">{t('emptyTitle')}</h2>
          <p className="text-muted-foreground mt-1.5 text-sm leading-relaxed">{t('emptyBody')}</p>
          <div className="mt-4 max-w-56">
            <Button onClick={() => setSheet({ line: null, category: '' })}>
              {t('emptyAction')}
            </Button>
          </div>
        </Card>
      ) : (
        <>
          <dl className="mt-7 grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-2.5">
            <Total label={t('allocated')} value={eur(totals.allocatedCents)} />
            <Total
              label={t('spent')}
              value={eur(totals.spentCents)}
              note={t('spentOfAllocated', {
                pct: pct(totals.allocatedCents > 0 ? totals.spentCents / totals.allocatedCents : 0),
              })}
            />
            <Total
              label={t('remaining')}
              value={eur(totals.remainingCents)}
              note={
                totals.remainingCents < 0
                  ? t('overBy', { amount: eur(-totals.remainingCents) })
                  : undefined
              }
              danger={totals.remainingCents < 0}
            />
          </dl>

          <div className="mt-5">
            <Table caption={t('tableCaption')}>
              <TableHead>
                <tr>
                  <TableHeaderCell>{t('category')}</TableHeaderCell>
                  <TableHeaderCell className="hidden sm:table-cell">
                    {t('spentPaid')}
                  </TableHeaderCell>
                  <TableHeaderCell numeric>{t('allocatedCol')}</TableHeaderCell>
                  <TableHeaderCell numeric>{t('spentCol')}</TableHeaderCell>
                </tr>
              </TableHead>
              <TableBody>
                {groups.map((g) => {
                  const expanded = open.has(g.category)
                  const over = g.totals.remainingCents < 0
                  const spentShare = share(g.totals.spentCents, g.totals.allocatedCents)
                  const paidShare = share(g.paidCents, g.totals.allocatedCents)
                  return (
                    <Fragment key={g.category}>
                      <tr className={expanded ? 'bg-background' : undefined}>
                        <TableCell className="py-2">
                          <button
                            type="button"
                            aria-expanded={expanded}
                            aria-label={t('toggle', { category: g.category })}
                            onClick={() => toggle(g.category)}
                            className="flex w-full min-w-0 cursor-pointer items-center gap-2.5 text-left"
                          >
                            <svg
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.7"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              aria-hidden="true"
                              className="text-muted-foreground size-3.5 shrink-0 transition-transform"
                              style={{ transform: expanded ? 'rotate(90deg)' : undefined }}
                            >
                              <path d="M9 6l6 6-6 6" />
                            </svg>
                            <span className="min-w-0">
                              <span className="block truncate text-[13.5px]">{g.category}</span>
                              <span
                                className={
                                  over
                                    ? 'text-st-alert-fg block text-xs font-semibold'
                                    : 'text-muted-foreground block text-xs'
                                }
                              >
                                {over
                                  ? t('overIn', { amount: eur(-g.totals.remainingCents) })
                                  : t('leftIn', { amount: eur(g.totals.remainingCents) })}
                                {' · '}
                                {g.lines.length === 1
                                  ? t('linesOne', { n: 1 })
                                  : t('linesOther', { n: g.lines.length })}
                              </span>
                            </span>
                          </button>
                        </TableCell>
                        <TableCell className="hidden w-60 sm:table-cell">
                          <span
                            aria-hidden="true"
                            className="bg-muted block h-2 overflow-hidden rounded-full"
                          >
                            <span
                              className={
                                over
                                  ? 'bg-st-alert-dot block h-2 rounded-full'
                                  : 'bg-primary block h-2 rounded-full'
                              }
                              style={{ width: `${spentShare}%` }}
                            />
                          </span>
                          <span
                            aria-hidden="true"
                            className="bg-muted mt-1 block h-1.5 overflow-hidden rounded-full"
                          >
                            <span
                              className="bg-st-attending-dot block h-1.5 rounded-full"
                              style={{ width: `${paidShare}%` }}
                            />
                          </span>
                          <span className="text-muted-foreground mt-1 flex gap-2 font-mono text-[10.5px] tabular-nums">
                            <span className="whitespace-nowrap">
                              {t('pctSpent', {
                                pct: pct(
                                  g.totals.allocatedCents > 0
                                    ? g.totals.spentCents / g.totals.allocatedCents
                                    : 0,
                                ),
                              })}
                            </span>
                            <span className="whitespace-nowrap">
                              {t('paid', { amount: eur(g.paidCents) })}
                            </span>
                          </span>
                        </TableCell>
                        <TableCell numeric className="text-muted-foreground">
                          {eur(g.totals.allocatedCents)}
                        </TableCell>
                        <TableCell
                          numeric
                          className={over ? 'text-st-alert-fg font-semibold' : undefined}
                        >
                          {eur(g.totals.spentCents)}
                        </TableCell>
                      </tr>
                      {expanded &&
                        g.lines.map((line) => {
                          const above =
                            line.actualCents !== null && line.actualCents > line.estimateCents
                          return (
                            <tr key={line.id} className="bg-background">
                              <TableCell className="py-2 pl-9">
                                <button
                                  type="button"
                                  aria-label={t('editLine', { label: line.label })}
                                  onClick={() => setSheet({ line, category: line.category })}
                                  className="block min-w-0 max-w-full cursor-pointer text-left"
                                >
                                  <span className="block truncate text-[13px] underline-offset-2 hover:underline">
                                    {line.label}
                                  </span>
                                  <span className="text-muted-foreground block truncate text-xs">
                                    {line.vendorName ?? t('noVendor')}
                                    {above && line.actualCents !== null && (
                                      <span className="text-st-alert-fg font-semibold">
                                        {' · '}
                                        {t('lineOver', {
                                          amount: eur(line.actualCents - line.estimateCents),
                                        })}
                                      </span>
                                    )}
                                  </span>
                                </button>
                              </TableCell>
                              <TableCell className="hidden sm:table-cell" />
                              <TableCell numeric className="text-muted-foreground text-[12.5px]">
                                {eur(line.estimateCents)}
                              </TableCell>
                              <TableCell
                                numeric
                                className={
                                  above ? 'text-st-alert-fg text-[12.5px]' : 'text-[12.5px]'
                                }
                              >
                                {line.actualCents === null ? (
                                  <span
                                    role="img"
                                    aria-label={t('noActual')}
                                    title={t('noActual')}
                                    className="text-muted-foreground"
                                  >
                                    –
                                  </span>
                                ) : (
                                  eur(line.actualCents)
                                )}
                              </TableCell>
                            </tr>
                          )
                        })}
                    </Fragment>
                  )
                })}
              </TableBody>
              <TableFoot>
                <tr>
                  <TableCell className="text-[13px]">{t('total')}</TableCell>
                  <TableCell className="text-muted-foreground hidden font-mono text-[11.5px] font-normal sm:table-cell">
                    {t('paidShare', {
                      pct: pct(totals.spentCents > 0 ? paidTotal / totals.spentCents : 0),
                    })}
                  </TableCell>
                  <TableCell numeric className="text-[13px]">
                    {eur(totals.allocatedCents)}
                  </TableCell>
                  <TableCell numeric className="text-[13px]">
                    {eur(totals.spentCents)}
                  </TableCell>
                </tr>
              </TableFoot>
            </Table>
          </div>
        </>
      )}

      {sheet && (
        <LineSheet
          key={sheet.line?.id ?? 'new'}
          weddingId={weddingId}
          locale={locale}
          line={sheet.line}
          defaultCategory={sheet.category}
          categories={categories}
          vendors={vendors}
          onClose={() => setSheet(null)}
        />
      )}
    </div>
  )
}

/** A bar width as a whole percent, held to 0-100. No allocation and some spending reads as full. */
function share(part: number, whole: number): number {
  if (part <= 0) return 0
  if (whole <= 0) return 100
  return Math.min(100, Math.round((part / whole) * 100))
}

function Total({
  label,
  value,
  note,
  danger,
}: {
  label: string
  value: string
  note?: string | undefined
  danger?: boolean
}) {
  return (
    <div className="bg-card rounded-[var(--radius)] border px-[15px] py-[13px]">
      <dt className="text-muted-foreground text-[11px] font-semibold tracking-[0.08em] uppercase">
        {label}
      </dt>
      <dd className="mt-2">
        <span
          className={
            danger
              ? 'text-st-alert-fg font-mono text-[21px] font-semibold tracking-tight tabular-nums'
              : 'font-mono text-[21px] font-semibold tracking-tight tabular-nums'
          }
        >
          {value}
        </span>
        {note && (
          <span
            className={
              danger
                ? 'text-st-alert-fg mt-0.5 block text-[11.5px] font-semibold'
                : 'text-muted-foreground mt-0.5 block text-[11.5px]'
            }
          >
            {note}
          </span>
        )}
      </dd>
    </div>
  )
}
