'use client'

import { useEffect, useRef } from 'react'
import { cx } from './cx.ts'

type Props<L extends string> = {
  locales: readonly L[]
  current: L
  label: string
  /** Each language in its own words. Falls back to the upper-cased code. */
  names?: Readonly<Partial<Record<L, string>>>
  /**
   * Marketing surfaces pass this: there the locale IS the URL, so switching language is
   * a navigation. A map rather than a function so a server component can hand it over.
   */
  hrefs?: Readonly<Partial<Record<L, string>>>
  /**
   * The dashboard passes this instead. Its URLs carry no language prefix -- that is an
   * SEO device, and a planner should not lose their place by switching language -- so the
   * choice is written to a cookie and the page re-renders in place.
   */
  onSelect?: (locale: L) => void
  disabled?: boolean
}

/**
 * The language, always visible, never guessed.
 *
 * `lib/locales.ts` settled the policy this component implements: no `Accept-Language`
 * negotiation, ever, because it "sends Belgian planners running an English OS to the
 * wrong language". The switcher being visible is the other half of that decision -- a
 * remembered default is only safe when it is also correctable.
 *
 * ## A dropdown since 2026-09-28
 *
 * It was a row of NL / EN / FR, then a segmented pill; the user asked for a dropdown. The
 * cost is the one the sign-in brief named: three codes side by side were the only
 * competitive claim this product could demonstrate before login (a rival charges €139 for
 * a second language), and a closed dropdown shows one. The trigger still shows the current
 * code, so the switcher stays visible; the claim now takes a click.
 *
 * `<details>`, not a button plus state: it opens without JavaScript, which the marketing
 * pages promise, and the browser gives the summary its expanded state. JavaScript only adds
 * what `<details>` lacks -- closing on Escape, on a click outside, and after a choice.
 *
 * The current locale is not a link or a button. It is not a destination and it is not an
 * action, so making it either one gives a keyboard user a stop that does nothing.
 */
export function LocaleSwitcher<L extends string>({
  locales,
  current,
  label,
  names,
  hrefs,
  onSelect,
  disabled,
}: Props<L>) {
  const ref = useRef<HTMLDetailsElement>(null)

  useEffect(() => {
    const details = ref.current
    if (!details) return
    const onPointerDown = (event: PointerEvent) => {
      if (details.open && !details.contains(event.target as Node)) details.open = false
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !details.open) return
      details.open = false
      details.querySelector('summary')?.focus()
    }
    document.addEventListener('pointerdown', onPointerDown)
    details.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      details.removeEventListener('keydown', onKeyDown)
    }
  }, [])

  const row = 'flex h-10 w-full items-center gap-3 rounded-[var(--radius)] px-3 text-left text-sm'
  const other =
    'text-[color:var(--gn-fg,var(--foreground))] transition-colors hover:bg-surface-container'

  return (
    <nav aria-label={label} className="relative w-fit self-start">
      <details ref={ref} className="group">
        <summary
          className={cx(
            'flex h-9 cursor-pointer list-none items-center gap-1.5 rounded-[var(--radius)] pr-2.5 pl-3.5',
            'bg-surface-container text-xs font-semibold tracking-[0.06em] text-[color:var(--gn-fg,var(--foreground))]',
            'transition-[transform,box-shadow] duration-[450ms] ease-[var(--ease-spring)] active:scale-[0.96]',
            'hover:shadow-[inset_0_0_0_100px_color-mix(in_srgb,currentColor_6%,transparent)]',
            '[&::-webkit-details-marker]:hidden',
          )}
        >
          {current.toUpperCase()}
          <svg
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden="true"
            className="size-3.5 opacity-70 transition-transform duration-300 group-open:rotate-180"
          >
            <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </summary>
        <ul className="absolute right-0 z-50 mt-2 min-w-44 rounded-[var(--radius-container)] border border-border bg-popover p-1 text-popover-foreground shadow-lg">
          {locales.map((locale) => {
            const name = names?.[locale] ?? locale.toUpperCase()
            if (locale === current) {
              return (
                <li key={locale}>
                  <span
                    aria-current="true"
                    lang={locale}
                    className={cx(
                      row,
                      'font-semibold text-on-primary-container bg-primary-container',
                    )}
                  >
                    <span className="flex-1">{name}</span>
                    <CheckIcon />
                  </span>
                </li>
              )
            }
            const href = hrefs?.[locale]
            return (
              <li key={locale}>
                {href ? (
                  <a href={href} hrefLang={locale} lang={locale} className={cx(row, other)}>
                    {name}
                  </a>
                ) : (
                  <button
                    type="button"
                    lang={locale}
                    disabled={disabled}
                    onClick={() => {
                      if (ref.current) ref.current.open = false
                      onSelect?.(locale)
                    }}
                    className={cx(row, other, 'enabled:cursor-pointer disabled:opacity-60')}
                  >
                    {name}
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      </details>
    </nav>
  )
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
      className="size-4 shrink-0"
    >
      <path d="M3.5 8.5l3 3 6-6.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
