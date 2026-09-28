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
 *
 * Since the Modern refresh the current pip stretches to a 24px bar on the spring curve and
 * a muted "2/3" follows the name. The refresh's proposal wrote "2 of 3"; the slash is the
 * same count with no word in it, so it needs no translation passed in.
 */
export function StepIndicator({ steps, current, className }: Props) {
  return (
    <div className={cx('flex items-center gap-3', className)}>
      <div className="flex items-center gap-1.5" aria-hidden="true">
        {steps.map((step, i) => (
          <span
            key={step}
            className={cx(
              'block h-2 rounded-full bg-[var(--gn-action,var(--primary))]',
              'transition-[width,opacity] duration-[550ms] ease-[var(--ease-spring)]',
              i === current ? 'w-6' : 'w-2',
              i <= current ? 'opacity-100' : 'opacity-30',
            )}
          />
        ))}
      </div>
      <span className="text-[0.9375rem] font-semibold">{steps[current]}</span>
      <span className="text-[0.8125rem] text-[color:var(--gn-muted,var(--muted-foreground))] tabular-nums">
        {current + 1}/{steps.length}
      </span>
    </div>
  )
}
