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

/*
 * The planner-app sections. Drawn to the same rules as the icons above -- 24 box, 1.5 stroke,
 * decorative -- and kept in this file for the reason it opens with: an icon file in `public/`
 * would need a matcher exclusion first.
 */

/** A calendar with a tick. Not `OverviewIcon`, which is the same frame without one. */
export function TodayIcon({ className }: IconProps) {
  return (
    <Glyph className={className}>
      <rect x="3" y="4" width="18" height="17" rx="2" />
      <path d="M3 9.5h18M8 2v4M16 2v4" />
      <path d="m9 15 2 2 4-4" />
    </Glyph>
  )
}

/** Two sheets, one behind the other: a template is a copy waiting to be made. */
export function TemplatesIcon({ className }: IconProps) {
  return (
    <Glyph className={className}>
      <rect x="8" y="8" width="12" height="12" rx="2" />
      <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
    </Glyph>
  )
}

export function VendorsIcon({ className }: IconProps) {
  return (
    <Glyph className={className}>
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18" />
    </Glyph>
  )
}

export function TeamIcon({ className }: IconProps) {
  return (
    <Glyph className={className}>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" />
      <path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.4c2.2.7 3.5 2.6 3.5 5.6" />
    </Glyph>
  )
}

/** A shopfront: the studio itself, as distinct from the people in it (`TeamIcon`). */
export function StudioIcon({ className }: IconProps) {
  return (
    <Glyph className={className}>
      <path d="M4 10v10h16V10" />
      <path d="M3 10l2-6h14l2 6c0 1.4-1.3 2.5-3 2.5s-3-1.1-3-2.5c0 1.4-1.3 2.5-3 2.5s-3-1.1-3-2.5c0 1.4-1.3 2.5-3 2.5S3 11.4 3 10z" />
      <path d="M10 20v-4.5h4V20" />
    </Glyph>
  )
}

/** The empty logo tile: a picture frame with a hill and a sun. */
export function ImageIcon({ className }: IconProps) {
  return (
    <Glyph className={className}>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="M20.5 16l-5-5-8.5 8.5" />
    </Glyph>
  )
}

export function PlusIcon({ className }: IconProps) {
  return (
    <Glyph className={className}>
      <path d="M12 5v14M5 12h14" />
    </Glyph>
  )
}

export function ChecklistIcon({ className }: IconProps) {
  return (
    <Glyph className={className}>
      <path d="m4 6 1.5 1.5L8 5M4 12l1.5 1.5L8 11M4 18l1.5 1.5L8 17" />
      <path d="M12 6.5h8M12 12.5h8M12 18.5h8" />
    </Glyph>
  )
}

export function BudgetIcon({ className }: IconProps) {
  return (
    <Glyph className={className}>
      <path d="M17 7.5A6 6 0 1 0 17 16.5" />
      <path d="M5 10h9M5 14h9" />
    </Glyph>
  )
}

export function PaymentsIcon({ className }: IconProps) {
  return (
    <Glyph className={className}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 10h18M7 15h3" />
    </Glyph>
  )
}

export function RunSheetIcon({ className }: IconProps) {
  return (
    <Glyph className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </Glyph>
  )
}

export function FilesIcon({ className }: IconProps) {
  return (
    <Glyph className={className}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
    </Glyph>
  )
}

export function MoodboardIcon({ className }: IconProps) {
  return (
    <Glyph className={className}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="m21 16-5-5-8 8" />
    </Glyph>
  )
}
