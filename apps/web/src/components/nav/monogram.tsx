import { cx } from '@guestnote/ui/cx'

/**
 * Initials on a tinted square, for an organisation or a person.
 *
 * Since spec 0005 (2026-09-26) an organisation can have a logo, `organizations.logo_key`,
 * and `org-head.tsx` draws it in this square's place. This is still what every studio without
 * one sees, what a logo that fails to load falls back to, and what the switcher's other rows
 * draw. (It used to say there was no logo to render: `docs/specs/0001` had deferred upload
 * until file storage existed.)
 *
 * ## Why the tint is derived from the name and not random
 *
 * Two organisations should be distinguishable at a glance in the switcher, and a planner
 * should see the same colour every morning. So the hue is a sum of the name's code points
 * modulo the palette -- stable, no column, no storage. It is decoration only: the name is
 * always beside it, and on the collapsed rail the accessible name is on the control.
 *
 * The palette is the four token pairs that are already contrast-verified in both modes.
 * Nothing new lands in `design-system/tokens.css`, which the login brief lists as
 * must-remain-untouched without a contrast pass.
 */
const TINTS = [
  'bg-[var(--st-attending-bg)] text-[color:var(--st-attending-fg)]',
  'bg-[var(--st-awaiting-bg)] text-[color:var(--st-awaiting-fg)]',
  'bg-[var(--st-partial-bg)] text-[color:var(--st-partial-fg)]',
  'bg-[var(--st-plusone-bg)] text-[color:var(--st-plusone-fg)]',
] as const

/**
 * Up to two initials, from the first and last word.
 *
 * `Array.from` and not `[0]`, because a name can begin with an astral character -- an
 * emoji in a venue's display name is not hypothetical -- and indexing a string by unit
 * splits the surrogate pair into a replacement character.
 */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  const first = Array.from(words[0] ?? '')[0] ?? ''
  const last = words.length > 1 ? (Array.from(words[words.length - 1] ?? '')[0] ?? '') : ''
  return (first + last).toUpperCase()
}

export function tintOf(name: string): string {
  let sum = 0
  for (const ch of name) sum += ch.codePointAt(0) ?? 0
  return TINTS[sum % TINTS.length] ?? TINTS[0]
}

export function Monogram({
  name,
  className,
  rounded = 'rounded-[calc(var(--radius)-2px)]',
}: {
  name: string
  className?: string | undefined
  rounded?: string
}) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        'grid size-7 shrink-0 place-items-center text-[0.6875rem] font-semibold tabular-nums',
        rounded,
        tintOf(name),
        className,
      )}
    >
      {initialsOf(name)}
    </span>
  )
}
