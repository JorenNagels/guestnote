import type { ReactNode } from 'react'
import { cx } from './cx.ts'

/**
 * The circle that marks "you arrived".
 *
 * Defaults to a checkmark, but takes any icon -- the reusable part is the shape (a 36px
 * filled circle in the primary colour), not the glyph inside it.
 */
export function ArrivalBadge({ icon, className }: { icon?: ReactNode; className?: string }) {
  return (
    <div
      className={cx(
        'inline-flex size-9 items-center justify-center rounded-full bg-primary text-primary-foreground',
        className,
      )}
    >
      {icon ?? <CheckIcon />}
    </div>
  )
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
      className="size-4"
    >
      <path d="M3.5 8.5l3 3 6-6.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
