/**
 * Line illustrations for the marketing site, drawn in the mark's own language: round caps, round
 * joins, one stroke weight, teal and gold (spec 0006; brief section "Colour and illustration",
 * 2026-09-27). Our own small set rather than a stock or 3D style -- the user asked for more colour
 * and illustration after the page was stripped of AI-made tells, and stock illustration is one.
 *
 * All decorative: `aria-hidden`, no title. Colour comes from `currentColor` plus an optional
 * accent, so a caller sets it with a text utility.
 */

type Props = { readonly className?: string; readonly accent?: string }

const line = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2.5,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const

/** A botanical sprig: a curved stem with five leaves. */
export function Sprig({ className, accent = 'currentColor' }: Props) {
  return (
    <svg viewBox="0 0 120 160" className={className} aria-hidden="true" focusable="false">
      <path {...line} d="M60 155 C58 115 62 70 78 20" />
      <path {...line} stroke={accent} d="M61 128 C44 124 34 110 34 96 C48 98 60 110 61 128 Z" />
      <path {...line} stroke={accent} d="M62 104 C80 102 92 88 94 74 C80 74 66 86 62 104 Z" />
      <path {...line} stroke={accent} d="M64 80 C48 74 42 58 44 46 C58 50 66 64 64 80 Z" />
      <path {...line} stroke={accent} d="M69 58 C84 54 94 42 96 30 C83 31 72 42 69 58 Z" />
      <path {...line} stroke={accent} d="M76 30 C70 20 70 10 74 2 C82 10 82 22 76 30 Z" />
    </svg>
  )
}

/** Two interlocking rings, the left one with a small stone. */
export function Rings({ className, accent = 'currentColor' }: Props) {
  return (
    <svg viewBox="0 0 140 100" className={className} aria-hidden="true" focusable="false">
      <circle {...line} cx="52" cy="60" r="30" />
      <circle {...line} stroke={accent} cx="88" cy="60" r="30" />
      <path {...line} d="M44 30 L52 20 L60 30 L52 36 Z" />
      <path {...line} d="M44 30 L60 30" />
    </svg>
  )
}

/** An envelope with a heart seal, a nod to the mark's card and heart. */
export function Envelope({ className, accent = 'currentColor' }: Props) {
  return (
    <svg viewBox="0 0 160 110" className={className} aria-hidden="true" focusable="false">
      <rect {...line} x="6" y="8" width="148" height="94" rx="6" />
      <path {...line} d="M8 12 L80 64 L152 12" />
      <path {...line} d="M8 100 L62 52" />
      <path {...line} d="M152 100 L98 52" />
      <path
        {...line}
        stroke={accent}
        d="M80 78 C74 72 66 68 66 60 C66 55 70 52 74 52 C77 52 79 54 80 56 C81 54 83 52 86 52 C90 52 94 55 94 60 C94 68 86 72 80 78 Z"
      />
    </svg>
  )
}
