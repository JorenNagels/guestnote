import { cx } from './cx.ts'

type Props<L extends string> = {
  locales: readonly L[]
  current: L
  label: string
  /**
   * Marketing surfaces pass this: there the locale IS the URL, so switching language is
   * a navigation and there is nothing to hydrate.
   */
  hrefFor?: (locale: L) => string
  /**
   * The dashboard passes this instead. Its URLs carry no language prefix -- that is an
   * SEO device, and a planner should not lose their place by switching language -- so the
   * choice is written to a cookie and the page re-renders in place.
   */
  onSelect?: (locale: L) => void
  disabled?: boolean
}

/**
 * NL / EN / FR, always visible, never guessed.
 *
 * `lib/locales.ts` settled the policy this component implements: no `Accept-Language`
 * negotiation, ever, because it "sends Belgian planners running an English OS to the
 * wrong language". The switcher being visible is the other half of that decision -- a
 * remembered default is only safe when it is also correctable.
 *
 * On the sign-in screen it does one more job the brief calls out: it is the only
 * competitive claim this product can honestly demonstrate before login, at zero cost, to
 * a planner who is evaluating. A rival charges €139 for a second language.
 *
 * The current locale is not a link or a button. It is not a destination and it is not an
 * action, so making it either one gives a keyboard user a stop that does nothing.
 */
export function LocaleSwitcher<L extends string>({
  locales,
  current,
  label,
  hrefFor,
  onSelect,
  disabled,
}: Props<L>) {
  const base =
    'rounded-[calc(var(--radius)-2px)] px-1.5 py-1 text-xs tracking-wide transition-colors'
  const inactive =
    'text-[color:var(--gn-muted,var(--muted-foreground))] hover:text-[color:var(--gn-fg,var(--foreground))]'

  return (
    <nav aria-label={label} className="flex gap-0.5">
      {locales.map((locale) => {
        const isCurrent = locale === current
        const text = locale.toUpperCase()

        if (isCurrent) {
          return (
            <span
              key={locale}
              aria-current="true"
              className={cx(base, 'font-semibold text-[color:var(--gn-fg,var(--foreground))]')}
            >
              {text}
            </span>
          )
        }
        if (hrefFor) {
          return (
            <a key={locale} href={hrefFor(locale)} className={cx(base, inactive)}>
              {text}
            </a>
          )
        }
        return (
          <button
            key={locale}
            type="button"
            disabled={disabled}
            onClick={() => onSelect?.(locale)}
            className={cx(base, inactive, 'enabled:cursor-pointer disabled:opacity-60')}
          >
            {text}
          </button>
        )
      })}
    </nav>
  )
}
