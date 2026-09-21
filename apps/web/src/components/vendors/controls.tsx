import type { ButtonHTMLAttributes, ReactNode } from 'react'
import type { VendorActionResult } from '../../lib/vendor-input.ts'

/**
 * The few controls both vendor screens share and `packages/ui` does not have.
 *
 * `Button` from the ui kit is 44px and full width by design (its comment says why), which is
 * right for a sheet's footer and wrong for a row in a table that follows `[data-density]`.
 * `cx` does not merge classes, so overriding its height would be a coin flip on CSS order.
 * These are the compact ones; a second screen needing them is the signal to move them into the
 * kit.
 */

const BUTTON =
  'inline-flex h-[var(--control-h)] items-center justify-center gap-1.5 whitespace-nowrap ' +
  'rounded-[var(--radius)] border px-3 text-xs font-medium transition-colors ' +
  'enabled:cursor-pointer disabled:cursor-not-allowed disabled:opacity-55'

export function SmallButton({
  tone = 'quiet',
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: 'quiet' | 'primary'; children: ReactNode }) {
  return (
    <button
      type="button"
      {...rest}
      className={[
        BUTTON,
        tone === 'primary'
          ? 'border-transparent bg-primary text-primary-foreground enabled:hover:brightness-110'
          : 'border-[var(--input)] bg-transparent text-foreground enabled:hover:bg-muted',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </button>
  )
}

/** A native select: it is the fastest control on a phone and needs no popover to get right. */
export const SELECT_CLASS =
  'h-[var(--control-h)] rounded-[var(--radius)] border border-[var(--input)] bg-transparent ' +
  'px-2 text-xs text-foreground enabled:cursor-pointer disabled:opacity-55'

/** Two letters for the name chip, from the words longer than two characters (the prototype's rule). */
export function initials(name: string): string {
  const letters = name
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .slice(0, 2)
    .map((w) => w.charAt(0))
    .join('')
  return (letters || name.charAt(0)).toUpperCase()
}

export function Monogram({ name }: { name: string }) {
  return (
    <span
      aria-hidden="true"
      className="bg-muted text-muted-foreground grid size-7 flex-none place-items-center rounded-md font-mono text-[10.5px] font-semibold"
    >
      {initials(name)}
    </span>
  )
}

export type ErrorLabels = Record<
  Extract<VendorActionResult, { ok: false }>['error'] | 'generic',
  string
>

/** A failure's words. A thrown error (network, server) has no `error` and reads as `generic`. */
export function errorText(labels: ErrorLabels, result: VendorActionResult | null): string | null {
  if (!result || result.ok) return null
  return labels[result.error]
}
