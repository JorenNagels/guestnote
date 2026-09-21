import type { HTMLAttributes, ReactNode, TdHTMLAttributes, ThHTMLAttributes } from 'react'
import { cx } from './cx.ts'

/**
 * A real `<table>`, because the screens it serves are tables: a screen reader gets row
 * and column navigation for free, and a CSS grid of divs would have to fake every bit.
 *
 * `caption` is required and visually hidden. A table with no name is announced as "table"
 * and nothing else; making the name a required prop is cheaper than remembering to add it.
 *
 * Row height and cell padding read `--row-h` and `--cell-x`, which is how
 * `[data-density="compact"]` reaches a table with no prop threaded through. Header cells
 * use `--control-h`, the shorter of the two, so the header never out-weighs the rows.
 *
 * The wrapper scrolls sideways rather than the page: a phone shows a scrollable table and
 * keeps the rest of the screen where it is.
 */
export function Table({
  caption,
  className,
  children,
  ...rest
}: HTMLAttributes<HTMLTableElement> & { caption: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-[var(--radius)] border border-border bg-card">
      <table {...rest} className={cx('w-full border-collapse text-left text-sm', className)}>
        <caption className="sr-only">{caption}</caption>
        {children}
      </table>
    </div>
  )
}

export function TableHead({ className, ...rest }: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead {...rest} className={cx('border-b border-border bg-background', className)} />
}

/** Rows after the first get a top border here, so a row never has to know its position. */
export function TableBody({ className, ...rest }: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody {...rest} className={cx('[&>tr+tr]:border-t [&>tr+tr]:border-border', className)} />
}

/** For totals. Same ground as the header, so the table is bracketed top and bottom. */
export function TableFoot({ className, ...rest }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <tfoot
      {...rest}
      className={cx('border-t border-border bg-background font-semibold', className)}
    />
  )
}

// No TableRow: a row has nothing of its own to style, because the borders live on the
// section that holds it. A plain `<tr>` is the right element and a wrapper would only add
// an import.

type CellExtras = {
  /**
   * Right-aligned, tabular, mono: money, counts, dates. Sets the `num` class that
   * `tokens.css` already styles (`td.num, th.num`), so a column of amounts lines up by
   * the same rule everywhere.
   */
  numeric?: boolean
}

export function TableHeaderCell({
  numeric,
  className,
  scope = 'col',
  ...rest
}: ThHTMLAttributes<HTMLTableCellElement> & CellExtras) {
  return (
    <th
      scope={scope}
      {...rest}
      className={cx(
        'h-[var(--control-h)] px-[var(--cell-x)] text-[11px] font-semibold uppercase',
        'tracking-[0.08em] text-muted-foreground',
        numeric && 'num font-mono',
        className,
      )}
    />
  )
}

export function TableCell({
  numeric,
  className,
  ...rest
}: TdHTMLAttributes<HTMLTableCellElement> & CellExtras) {
  return (
    <td
      {...rest}
      className={cx('h-[var(--row-h)] px-[var(--cell-x)]', numeric && 'num font-mono', className)}
    />
  )
}
