import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cx } from './cx.ts'

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  /**
   * `primary` is the one thing the visitor is here to do. There is at most one per
   * screen, which is why the variant is a boolean-ish union and not a scale.
   */
  variant?: 'primary' | 'secondary'
  /** Renders the label as the busy state without changing the button's width. */
  busy?: boolean
  busyLabel?: string
  icon?: ReactNode
}

/**
 * The button, in its three states: idle, in flight, disabled.
 *
 * It never disappears and never collapses while working -- the surface brief calls that
 * out because a submit that vanishes mid-request on a slow venue connection reads as the
 * tap having failed, and the second tap is the one that double-sends.
 *
 * Height is 44px flat. `data-density` deliberately does not reach it: density is a
 * dashboard preference for reading three hundred rows, and every surface this button
 * appears on before then is one where the target size matters more than the row count.
 *
 * ## `enabled:cursor-pointer` is not decoration
 *
 * Tailwind v4's preflight dropped the `cursor: pointer` it used to put on `button` --
 * measured on 4.3.3, 2026-08-19: the file mentions `cursor` exactly once, about Safari's
 * number spinners. So every button in this app rendered with an arrow and read as text
 * rather than as something to press, which is a real defect on a surface whose primary
 * action is a button.
 *
 * `enabled:` and not bare `cursor-pointer`, so it can never race the
 * `disabled:cursor-not-allowed` below on source order -- the two are then mutually
 * exclusive by selector rather than by whichever Tailwind happens to emit last.
 */
export function Button({
  variant = 'primary',
  busy = false,
  busyLabel,
  icon,
  className,
  children,
  disabled,
  ...rest
}: Props) {
  return (
    <button
      type="button"
      {...rest}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={cx(
        'inline-flex h-11 w-full items-center justify-center gap-2 rounded-[var(--radius)]',
        'text-sm font-semibold transition-[background-color,color,filter] duration-300',
        'enabled:cursor-pointer disabled:cursor-not-allowed disabled:opacity-55',
        variant === 'primary'
          ? 'border border-transparent bg-[var(--gn-action,var(--primary))] text-[color:var(--gn-action-fg,var(--primary-foreground))] enabled:hover:brightness-110'
          : 'border border-[var(--gn-input,var(--input))] bg-transparent font-medium text-[color:var(--gn-fg,var(--foreground))] enabled:hover:border-[var(--gn-fg,var(--foreground))]',
        className,
      )}
    >
      {busy ? (
        // A label swap rather than a spinner: it says which of the two things is
        // happening, it translates, and it costs no layout.
        <span>{busyLabel ?? '…'}</span>
      ) : (
        <>
          {icon}
          {children}
        </>
      )}
    </button>
  )
}

/**
 * A text-weight action for the things beside the main one -- "different address",
 * "send a new code".
 *
 * Underlined rather than coloured, because on this surface the ground moves and a link
 * colour that reads at one depth stop does not necessarily read at the next. An
 * underline is depth-independent.
 */
export function LinkButton({
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...rest}
      className={cx(
        'text-xs text-[color:var(--gn-muted,var(--muted-foreground))] underline underline-offset-[3px]',
        'transition-colors enabled:cursor-pointer enabled:hover:text-[color:var(--gn-fg,var(--foreground))]',
        // `cursor-default` while disabled, not `not-allowed`: the resend countdown is the
        // main user of that state and it is going to become available on its own. A barred
        // cursor would say "never", which is the wrong promise for a timer.
        'disabled:cursor-default disabled:no-underline disabled:opacity-80',
        className,
      )}
    >
      {children}
    </button>
  )
}
