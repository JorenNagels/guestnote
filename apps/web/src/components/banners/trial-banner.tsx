import { cx } from '@guestnote/ui/cx'
import Link from 'next/link'

/**
 * The trial banner (spec 0005, "Trial banner"): the slot the demo banner fills while billing is
 * off, in three states. Neutral while the trial runs, amber (`--warning-*`, through the
 * `st-awaiting` status pair) for the last three days, red (`--danger-*`, `st-alert`) once it has
 * ended. The status pairs and not raw ramp steps, because each pair is contrast-checked in both
 * themes in `design-system/tokens.css` and a hand-picked `warning-100` would not flip in dark.
 *
 * Every string arrives finished: the layout formats the date and the wedding count on the server,
 * where the catalogue is. `action` is null for a member -- the button goes to Billing, which is
 * owner and admin only, and a button to a 404 is worse than none. The shell hides the whole
 * banner on Billing itself.
 */
export type TrialBannerProps = {
  readonly kind: 'trial'
  readonly tone: 'neutral' | 'warning' | 'danger'
  readonly pill: string
  readonly message: string
  readonly action: { readonly label: string; readonly href: string } | null
}

const TONE = {
  neutral: { row: 'bg-card border-border', pill: 'bg-muted' },
  warning: {
    row: 'bg-st-awaiting-bg text-st-awaiting-fg border-st-awaiting-dot/40',
    pill: 'bg-st-awaiting-dot/20',
  },
  danger: {
    row: 'bg-st-alert-bg text-st-alert-fg border-st-alert-dot/40',
    pill: 'bg-st-alert-dot/20',
  },
} as const

export function TrialBanner({ tone, pill, message, action }: TrialBannerProps) {
  const t = TONE[tone]
  return (
    <section
      aria-label={pill}
      data-tone={tone}
      className={cx(
        'flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-4 py-[9px] text-[0.8125rem] md:px-[30px] print:hidden',
        t.row,
      )}
    >
      <span
        className={cx(
          'rounded-full px-2 py-0.5 font-mono text-[0.6875rem] font-semibold tracking-[0.04em]',
          t.pill,
        )}
      >
        {pill}
      </span>
      <span className="min-w-0 flex-1">{message}</span>
      {action ? (
        // White in every tone, as the design draws it: the one light surface on an amber or
        // red row is the thing to press. `--card` so it is still the light surface in dark.
        <Link
          href={action.href}
          className="bg-card text-card-foreground border-border hover:border-foreground focus-visible:outline-ring inline-flex h-[30px] items-center rounded-[var(--radius)] border px-3 text-[0.8125rem] font-medium outline-none focus-visible:outline-2"
        >
          {action.label}
        </Link>
      ) : null}
    </section>
  )
}
