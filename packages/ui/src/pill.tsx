import type { ReactNode } from 'react'
import { cx } from './cx.ts'

export type PillTone = 'success' | 'neutral' | 'warning' | 'info' | 'accent' | 'danger'

/**
 * The tones are the six `--st-*` status pairs from `design-system/tokens.css`, renamed by
 * meaning instead of by the RSVP state they were first written for -- "paid" is not an
 * attendance. Each pair is contrast-verified in both themes there, so nothing here
 * carries its own colour.
 *
 * `neutral` is the quiet one on purpose (the same reasoning as `declined` in the tokens):
 * "unpaid" and "shared with couple" are ordinary states, and painting them would make a
 * healthy list look like a fire. `danger` is for things that are actually wrong.
 *
 * Class strings are written out in full because Tailwind cannot see a name it did not
 * find as a literal.
 */
const TONES: Record<PillTone, { chip: string; dot: string }> = {
  success: { chip: 'bg-st-attending-bg text-st-attending-fg', dot: 'bg-st-attending-dot' },
  neutral: { chip: 'bg-st-declined-bg text-st-declined-fg', dot: 'bg-st-declined-dot' },
  warning: { chip: 'bg-st-awaiting-bg text-st-awaiting-fg', dot: 'bg-st-awaiting-dot' },
  info: { chip: 'bg-st-partial-bg text-st-partial-fg', dot: 'bg-st-partial-dot' },
  accent: { chip: 'bg-st-plusone-bg text-st-plusone-fg', dot: 'bg-st-plusone-dot' },
  danger: { chip: 'bg-st-alert-bg text-st-alert-fg', dot: 'bg-st-alert-dot' },
}

/**
 * A state, said in words.
 *
 * The label is the children and there is no icon-only form: the prototype's rule is
 * "never colour alone", because these lists get printed in black and white and read by
 * people who cannot tell the tones apart. The dot is decoration and hidden from assistive
 * technology; the word is the state.
 */
export function Pill({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: PillTone
  children: ReactNode
  className?: string
}) {
  const t = TONES[tone]
  return (
    <span
      className={cx(
        'inline-flex items-center gap-[5px] whitespace-nowrap rounded-full px-2 py-0.5',
        'text-[11px] font-medium',
        t.chip,
        className,
      )}
    >
      <span aria-hidden="true" className={cx('size-1.5 rounded-full', t.dot)} />
      {children}
    </span>
  )
}
