import type { InputHTMLAttributes, ReactNode, Ref } from 'react'
import { cx } from './cx.ts'

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'className'> & {
  label: ReactNode
  /** React 19 hands `ref` to function components as an ordinary prop; the type says so. */
  ref?: Ref<HTMLInputElement>
  /** Wires `aria-describedby` and flips `aria-invalid`; render the text with InlineError. */
  errorId?: string
  invalid?: boolean
  /** Tabular, letter-spaced, centred. For the six-digit code and nothing else so far. */
  numeric?: boolean
}

/**
 * A labelled text input.
 *
 * The border is the one thing in this package held to a contrast minimum.
 * `design-system/tokens.css` sets `--input` deliberately darker than is fashionable, and
 * research/08-design-system.md explains why: `--border` carries no minimum because WCAG
 * 1.4.11 covers component boundaries and not decorative dividers, but a field's edge is
 * what tells you the control is there. On a sign-in screen it is the entire interface.
 */
export function Field({ label, id, ref, errorId, invalid, numeric, ...rest }: Props) {
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-2 ml-1.5 block text-sm font-medium text-[color:var(--gn-fg,var(--foreground))]"
      >
        {label}
      </label>
      <input
        id={id}
        ref={ref}
        {...rest}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid && errorId ? errorId : undefined}
        className={cx(
          'w-full rounded-[var(--radius)] bg-surface-container px-5',
          'text-base text-[color:var(--gn-fg,var(--foreground))]',
          'placeholder:text-[color:var(--gn-muted,var(--muted-foreground))] placeholder:opacity-70',
          'transition-[border-color,box-shadow] duration-[400ms] ease-[var(--ease-spring)]',
          'hover:border-[var(--gn-fg,var(--foreground))]',
          'read-only:hover:border-[var(--gn-input,var(--input))] read-only:opacity-90',
          // Focus is the refresh's halo: the border turns primary and a 4px primary-container
          // ring springs out. The halo alone is too pale to count as an indicator
          // (#B9E6E1 on #FBFCFC is ~1.3:1), so a 1px primary shadow doubles the border to
          // 2px of --primary, which holds 3:1 -- that pair is what replaces the global
          // `:focus-visible` outline this turns off, and the one it must not lose. An invalid
          // field already has its 2px border, in the error colour, and keeps it on focus:
          // one branch each, because two `focus:shadow-[…]` utilities on one element would
          // be settled by stylesheet order, not by which one was meant.
          'focus:outline-none',
          invalid
            ? 'border-2 border-[var(--gn-error,var(--destructive))] px-[19px] focus:shadow-[0_0_0_4px_var(--error-container)]'
            : 'border border-[var(--gn-input,var(--input))] focus:border-[var(--gn-action,var(--primary))] focus:shadow-[0_0_0_1px_var(--gn-action,var(--primary)),0_0_0_5px_var(--primary-container)]',
          // One input, never six boxes. Six boxes cannot take a pasted "194 720", fight
          // autofill, and give a screen reader six unlabelled fields instead of one.
          numeric
            ? 'h-14 text-center text-[1.375rem] font-medium tracking-[0.3em] tabular-nums'
            : 'h-13',
        )}
      />
    </div>
  )
}
