import { cx } from './cx.ts'

type Props = {
  /** One label per step, in order. */
  steps: readonly string[]
  /** Zero-based index into `steps`. */
  current: number
  className?: string
}

/**
 * Depth as words, not only as a bar.
 *
 * The pips carry no meaning by themselves -- on a screen with no status chip anywhere
 * else, the current step still has to be sayable, which is why the label beside them is
 * not decoration. The pips are `aria-hidden`; a screen reader has no use for "step 2 of
 * 3 filled", only for the step's name.
 */
export function StepIndicator({ steps, current, className }: Props) {
  return (
    <div className={cx('flex items-center gap-2 text-xs', className)}>
      <div className="flex gap-1" aria-hidden="true">
        {steps.map((step, i) => (
          <span
            key={step}
            className={cx(
              'h-0.5 w-5 rounded-full bg-current transition-opacity duration-300',
              i <= current ? 'opacity-100' : 'opacity-25',
            )}
          />
        ))}
      </div>
      <span className="font-semibold">{steps[current]}</span>
    </div>
  )
}
