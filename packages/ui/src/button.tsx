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
 * Height is 48px flat: the Modern refresh's value, a taste call and not a target-size fix --
 * 44px already cleared WCAG 2.5.8. `data-density` deliberately does not reach it: density is a
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
        'inline-flex h-12 w-full items-center justify-center gap-2 rounded-[var(--radius)] border-0',
        'text-[0.9375rem] font-semibold tracking-[0.01em]',
        // The Modern refresh's state layer: hover lays a wash of the button's OWN text colour
        // over it (12% on primary, 6% on the tinted secondary), where `brightness-110` used to
        // lighten it. A wash of the foreground works on both themes -- brightening the dark
        // theme's light-teal button only made its dark label weaker. Press shrinks it to 96%
        // on the spring curve; reduced motion zeroes the duration in tokens.css.
        'transition-[transform,box-shadow] duration-[450ms] ease-[var(--ease-spring)] enabled:active:scale-[0.96]',
        'enabled:cursor-pointer disabled:cursor-not-allowed disabled:opacity-55',
        variant === 'primary'
          ? 'bg-[var(--gn-action,var(--primary))] text-[color:var(--gn-action-fg,var(--primary-foreground))] enabled:hover:shadow-[inset_0_0_0_100px_color-mix(in_srgb,currentColor_12%,transparent),0_1px_3px_rgb(22_29_28/0.25)]'
          : 'bg-secondary-container text-on-secondary-container enabled:hover:shadow-[inset_0_0_0_100px_color-mix(in_srgb,currentColor_6%,transparent)]',
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
 * A pill-shaped text button in the primary colour since the Modern refresh, with a faint
 * primary wash on hover. It used to be an underlined muted link, because the sign-in form
 * then stood on a ground that darkened step by step and a colour that read at one stop did
 * not at the next. The descent moved to the stage beside the form (`descent.css`), so the
 * form's ground is constant and the verified `--primary` on `--background` pair holds.
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
        'inline-flex h-10 items-center rounded-[var(--radius)] px-4 text-sm font-semibold',
        'text-[color:var(--gn-action,var(--primary))]',
        'transition-[transform,background-color] duration-[450ms] ease-[var(--ease-spring)]',
        'enabled:cursor-pointer enabled:hover:bg-[color-mix(in_srgb,var(--gn-action,var(--primary))_8%,transparent)] enabled:active:scale-[0.94]',
        // `cursor-default` while disabled, not `not-allowed`: the resend countdown is the
        // main user of that state and it is going to become available on its own. A barred
        // cursor would say "never", which is the wrong promise for a timer.
        'disabled:cursor-default disabled:font-medium disabled:tabular-nums disabled:text-[color:var(--gn-muted,var(--muted-foreground))]',
        className,
      )}
    >
      {children}
    </button>
  )
}
