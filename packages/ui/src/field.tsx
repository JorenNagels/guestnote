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
        className="mb-1.5 block text-sm font-medium text-[color:var(--gn-fg,var(--foreground))]"
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
          'h-11 w-full rounded-[var(--radius)] border bg-transparent px-3',
          'text-base text-[color:var(--gn-fg,var(--foreground))]',
          'placeholder:text-[color:var(--gn-muted,var(--muted-foreground))] placeholder:opacity-70',
          'transition-[border-color,background-color,color] duration-300',
          'hover:border-[var(--gn-fg,var(--foreground))]',
          'read-only:hover:border-[var(--gn-input,var(--input))] read-only:opacity-90',
          invalid
            ? 'border-[var(--gn-error,var(--destructive))]'
            : 'border-[var(--gn-input,var(--input))]',
          // One input, never six boxes. Six boxes cannot take a pasted "194 720", fight
          // autofill, and give a screen reader six unlabelled fields instead of one.
          numeric && 'text-center font-mono text-lg tracking-[0.3em] tabular-nums',
        )}
      />
    </div>
  )
}
