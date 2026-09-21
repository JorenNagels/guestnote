import type { HTMLAttributes } from 'react'
import { cx } from './cx.ts'

type Props = HTMLAttributes<HTMLElement> & {
  /** The element to render. A card that heads a region is a `section`, a sidebar note an `aside`. */
  as?: 'div' | 'section' | 'article' | 'aside'
  /**
   * `none` is for a card whose content runs to its edge -- a list of rows -- so the rows'
   * own dividers meet the border and `overflow-hidden` rounds their corners. The
   * alternative was a `padded` boolean, but "no padding" is the exception and the name
   * should say which one you are getting.
   */
  padding?: 'md' | 'none'
}

/**
 * The white box with a hairline border that the planner screens sit in.
 *
 * Border and ground come from `--border` and `--card`, so it flips with the theme. The
 * radius is `--radius`, the same as a control's: the prototype uses one corner for both.
 */
export function Card({ as = 'div', padding = 'md', className, children, ...rest }: Props) {
  const Tag = as
  return (
    <Tag
      {...rest}
      className={cx(
        'rounded-[var(--radius)] border border-border bg-card text-card-foreground',
        padding === 'md' ? 'px-4 py-3.5' : 'overflow-hidden',
        className,
      )}
    >
      {children}
    </Tag>
  )
}
