import type { ReactNode } from 'react'

/**
 * An error attached to the control that caused it.
 *
 * Icon **and** text, never colour alone. That is the design system's Principle 5 applied
 * where it is easiest to forget: there is no status chip on a sign-in screen to carry the
 * second encoding, and this gets read on a phone in a car park in bad light.
 *
 * Since the Modern refresh it sits in a tinted chip (`--error-container`, with its own
 * verified foreground) and the icon is filled. Only the icon still listens on `--gn-error`:
 * the chip's pair is contrast-checked as a pair, and a venue theme overriding one half of it
 * could not keep that promise.
 *
 * `role="alert"` rather than a page-level live region, because the message belongs to the
 * field: a screen reader user who arrives here by tabbing should meet it in context, and
 * the live region is for things that happen away from the focus.
 */
export function InlineError({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <p
      id={id}
      role="alert"
      className="mt-2.5 flex items-start gap-2.5 rounded-[var(--radius-container)] bg-error-container py-2.5 pr-4 pl-3 text-[0.8125rem] leading-relaxed text-on-error-container"
    >
      <svg viewBox="0 0 16 16" aria-hidden="true" className="mt-px size-[18px] shrink-0">
        <circle cx="8" cy="8" r="7" fill="var(--gn-error,var(--destructive))" />
        <path
          d="M8 4.5v4.2M8 11.2v.1"
          stroke="var(--error-container)"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
      <span>{children}</span>
    </p>
  )
}
