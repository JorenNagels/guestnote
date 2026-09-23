'use client'

import { cx } from '@guestnote/ui/cx'

/**
 * Up and down for one item. Two sizes because two places: a 36px pair inside a desktop row, and
 * a 44px pair (the design system's minimum tap target) in the editor a phone opens.
 *
 * Icon buttons need a name, and `packages/ui` holds no copy, so the labels arrive as props. A
 * disabled end-of-list button stays in place rather than vanishing: the pair keeps its shape and
 * the planner learns where the ends are.
 */
export function MoveButtons({
  size,
  upLabel,
  downLabel,
  canMoveUp,
  canMoveDown,
  disabled = false,
  onMove,
}: {
  size: 'sm' | 'lg'
  upLabel: string
  downLabel: string
  canMoveUp: boolean
  canMoveDown: boolean
  disabled?: boolean
  onMove: (direction: 'up' | 'down') => void
}) {
  const button = cx(
    'border-input text-foreground inline-flex items-center justify-center rounded-[var(--radius)] border',
    'enabled:cursor-pointer enabled:hover:border-foreground disabled:cursor-not-allowed disabled:opacity-40',
    'focus-visible:outline-ring outline-none focus-visible:outline-2',
    size === 'lg' ? 'h-11 flex-1 gap-2 px-4 text-sm font-medium' : 'size-9',
  )
  return (
    <div className={cx('flex gap-2', size === 'sm' && 'gap-1')}>
      <button
        type="button"
        aria-label={size === 'sm' ? upLabel : undefined}
        title={size === 'sm' ? upLabel : undefined}
        disabled={disabled || !canMoveUp}
        onClick={() => onMove('up')}
        className={button}
      >
        <Chevron up />
        {size === 'lg' ? upLabel : null}
      </button>
      <button
        type="button"
        aria-label={size === 'sm' ? downLabel : undefined}
        title={size === 'sm' ? downLabel : undefined}
        disabled={disabled || !canMoveDown}
        onClick={() => onMove('down')}
        className={button}
      >
        <Chevron up={false} />
        {size === 'lg' ? downLabel : null}
      </button>
    </div>
  )
}

function Chevron({ up }: { up: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="size-4"
    >
      <path d={up ? 'M3.5 10 8 5.5 12.5 10' : 'M3.5 6 8 10.5 12.5 6'} />
    </svg>
  )
}
