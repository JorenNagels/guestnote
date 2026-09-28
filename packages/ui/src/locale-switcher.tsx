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
    'relative flex h-8 w-11 items-center justify-center rounded-[var(--radius)] text-xs tracking-[0.06em]'
  const inactive =
    'font-medium text-[color:var(--gn-muted,var(--muted-foreground))] transition-colors hover:text-[color:var(--gn-fg,var(--foreground))]'
  const index = Math.max(0, locales.indexOf(current))

  return (
    // A segmented control since the Modern refresh: a primary-container pill slides under the
    // current locale. The pill is decoration, positioned by index (every segment is the same
    // width, so one segment's width is one step); `aria-current` on the span still says which
    // one is current. The transform is the one inline style in this package because the
    // index is data, and one class per possible index would be a list to keep in step.
    <nav
      aria-label={label}
      className="relative flex self-start rounded-[var(--radius)] bg-surface-container p-1"
    >
      <span
        aria-hidden="true"
        className="absolute top-1 left-1 h-8 w-11 rounded-[var(--radius)] bg-primary-container transition-transform duration-[550ms] ease-[var(--ease-spring)]"
        style={{ transform: `translateX(${index * 100}%)` }}
      />
      {locales.map((locale) => {
        const isCurrent = locale === current
        const text = locale.toUpperCase()

        if (isCurrent) {
          return (
            <span
              key={locale}
              aria-current="true"
              className={cx(base, 'font-bold text-on-primary-container')}
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
