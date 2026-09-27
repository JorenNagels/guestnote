import { MARK_FILL, MARK_INK } from './mark-paths.ts'

const PARTS = ['card', 'flap', 'gold'] as const

/**
 * The mark drawing itself on: the card, then the flap lifting, then the heart and the tick
 * (spec 0006, marketing brief section 5). The coming-soon page's animation, ported as-is: each
 * filled part sits under a mask whose white stroke is revealed along `pathLength="1000"`, and
 * the keyframes live in `marketing.css` (`mk-ink-*`).
 *
 * Pure CSS, so it plays in the static HTML before any JavaScript, and under
 * `prefers-reduced-motion` the strokes start at offset 0 -- the finished mark, no motion.
 *
 * The mask ids are fixed strings, so this renders **once per page** (the hero). A second
 * instance would share ids with the first, and whichever the browser resolved first would mask
 * both. Rejected: `useId`, which works but makes a server component into one that needs React's
 * id machinery for a decoration used in exactly one place.
 */
export function AnimatedMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 1242 1351"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <defs>
        {PARTS.map((part) => (
          <mask
            key={part}
            id={`mk-mask-${part}`}
            maskUnits="userSpaceOnUse"
            x="-120"
            y="-120"
            width="1482"
            height="1591"
          >
            <path
              className={`mk-ink mk-ink-${part}`}
              d={MARK_INK[part].d}
              pathLength={1000}
              strokeWidth={MARK_INK[part].width}
            />
          </mask>
        ))}
      </defs>
      {PARTS.map((part) => (
        <g key={part} mask={`url(#mk-mask-${part})`}>
          <path d={MARK_FILL[part].d} fill={MARK_FILL[part].fill} />
        </g>
      ))}
    </svg>
  )
}
