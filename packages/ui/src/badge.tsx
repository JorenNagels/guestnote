import type { HTMLAttributes } from 'react'
import { cx } from './cx.ts'

export type BadgeTone = 'neutral' | 'accent' | 'primary'

const TONES: Record<BadgeTone, string> = {
  neutral: 'bg-muted text-muted-foreground',
  accent: 'bg-accent text-accent-foreground',
  primary: 'bg-primary text-primary-foreground',
}

/**
 * A number or a short code in a chip: the "12" on a tab, the "T-42" in the sidebar.
 *
 * Not a `Pill`. A Pill says a state in words and carries a status colour; a Badge is
 * tabular mono, has no dot and no status meaning, so a count never reads as a warning.
 * The tones are the ordinary semantic pairs, which are the ones already verified for text
 * on their own background.
 *
 * It takes no colour from a wedding. A wedding's colour is a dot or a stripe only, never
 * text and never a ground behind text (spec 0003), so an arbitrary hex has no contrast
 * rule to fail.
 */
export function Badge({
  tone = 'neutral',
  className,
  children,
  ...rest
}: HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return (
    <span
      {...rest}
      className={cx(
        'inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-px',
        'font-mono text-[11px] font-semibold tabular-nums',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}
