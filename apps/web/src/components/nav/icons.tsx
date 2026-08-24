import type { ReactNode } from 'react'

/**
 * The sidebar's icons, inlined.
 *
 * Not a sprite, not files in `public/`, and that is not a preference. `proxy.ts`'s matcher
 * excludes exactly five paths, so on the app host `/icon.svg` is rewritten to
 * `/pro/icon.svg` and 404s -- measured 2026-08-18 and recorded in the matcher's own
 * comment. `components/brand/wordmark.tsx` already pays this cost for the same reason.
 * Adding an icon file means editing the matcher first.
 *
 * ## Why the attributes are written out in `Glyph` and not spread from an object
 *
 * They were spread from a shared `base` object first, which reads better and fails lint:
 * `a11y/noSvgWithoutTitle` analyses JSX statically, so `aria-hidden` arriving through a
 * spread is invisible to it and every icon looked like an unlabelled graphic. Writing them
 * on one component satisfies the rule for a better reason than silencing it would -- the
 * decorative intent is now visible at the place a reader looks for it.
 *
 * Every icon is decorative. Each one sits beside text, or inside a control that carries its
 * own accessible name -- including on the collapsed rail, where the name moves onto the
 * control rather than disappearing. An icon is never the only thing naming a target here.
 *
 * Sized in `em` so they inherit the label's colour and scale with it. `stroke-width: 1.5`
 * throughout: 2 reads heavy next to Inter at 14px, which is the only size these are used at.
 */
const DEFAULT_SIZE = 'size-[1.15em] shrink-0'

// `string | undefined` and not `string?`: `exactOptionalPropertyTypes` is on in this repo,
// so an optional prop refuses an explicitly-passed `undefined` -- which is exactly what
// `className={className}` forwards when a caller omits it.
function Glyph({ className, children }: { className?: string | undefined; children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className ?? DEFAULT_SIZE}
    >
      {children}
    </svg>
  )
}

type IconProps = { className?: string | undefined }

export function SearchIcon({ className }: IconProps) {
  return (
    <Glyph className={className}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </Glyph>
  )
}

/** Two interlocking rings. The one icon here that is about weddings rather than software. */
export function WeddingsIcon({ className }: IconProps) {
  return (
    <Glyph className={className}>
      <circle cx="9" cy="14" r="6" />
      <circle cx="15" cy="14" r="6" />
    </Glyph>
  )
}

export function OverviewIcon({ className }: IconProps) {
  return (
    <Glyph className={className}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 9h18M8 4v5" />
    </Glyph>
  )
}

export function ChevronIcon({ className }: IconProps) {
  return (
    <Glyph className={className ?? 'size-[1em] shrink-0'}>
      <path d="m6 9 6 6 6-6" />
    </Glyph>
  )
}

export function CheckIcon({ className }: IconProps) {
  return (
    <Glyph className={className ?? 'size-[1em] shrink-0'}>
      <path d="m5 13 4 4L19 7" />
    </Glyph>
  )
}

export function MenuIcon({ className }: IconProps) {
  return (
    <Glyph className={className}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </Glyph>
  )
}

export function CloseIcon({ className }: IconProps) {
  return (
    <Glyph className={className}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Glyph>
  )
}

/** Collapse / expand the rail. Mirrored with a transform rather than duplicated. */
export function CollapseIcon({ className }: IconProps) {
  return (
    <Glyph className={className}>
      <path d="M15 6l-6 6 6 6" />
      <path d="M4 5v14" />
    </Glyph>
  )
}
