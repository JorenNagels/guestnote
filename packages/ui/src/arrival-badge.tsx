import type { ReactNode } from 'react'
import { cx } from './cx.ts'

/**
 * The circle that marks "you arrived".
 *
 * Defaults to a checkmark, but takes any icon -- the reusable part is the shape, not the
 * glyph inside it. `md` is a 40px solid primary circle; `lg` is the Modern refresh's 64px
 * soft one on `--primary-container`, for a screen whose whole job is the arrival.
 *
 * It springs in from 40% on mount (`gn-arrive`, in tokens.css). A keyframe rather than a transition,
 * because there is no earlier state to transition from on first paint; the reduced-motion
 * rule in tokens.css zeroes its duration, which leaves the final frame.
 */
export function ArrivalBadge({
  icon,
  size = 'md',
  className,
}: {
  icon?: ReactNode
  size?: 'md' | 'lg'
  className?: string
}) {
  return (
    <div
      className={cx(
        'inline-flex items-center justify-center rounded-full',
        'animate-[gn-arrive_650ms_var(--ease-spring)_both]',
        size === 'lg'
          ? 'size-16 bg-primary-container text-on-primary-container'
          : 'size-10 bg-primary text-primary-foreground',
        className,
      )}
    >
      {icon ?? <CheckIcon large={size === 'lg'} />}
    </div>
  )
}

function CheckIcon({ large }: { large: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={large ? 1.8 : 2}
      aria-hidden="true"
      className={large ? 'size-7' : 'size-[18px]'}
    >
      <path d="M3.5 8.5l3 3 6-6.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
