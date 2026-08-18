import type { ReactNode } from 'react'

/**
 * An error attached to the control that caused it.
 *
 * Icon **and** text, never colour alone. That is the design system's Principle 5 applied
 * where it is easiest to forget: there is no status chip on a sign-in screen to carry the
 * second encoding, and this gets read on a phone in a car park in bad light.
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
      className="mt-2.5 flex gap-1.5 text-xs leading-relaxed text-[color:var(--gn-error,var(--destructive))]"
    >
      <svg
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        aria-hidden="true"
        className="mt-0.5 size-3.5 shrink-0"
      >
        <circle cx="8" cy="8" r="6.25" />
        <path d="M8 5v3.5M8 10.9v.1" strokeLinecap="round" />
      </svg>
      <span>{children}</span>
    </p>
  )
}
