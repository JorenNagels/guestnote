'use client'

import { cx } from '@guestnote/ui/cx'
import { LocaleSwitcher } from '@guestnote/ui/locale-switcher'
import { useTransition } from 'react'
import { setDensity, setTheme, signOut } from '../../app/pro/(app)/actions.ts'
import { setLocale } from '../../components/auth/actions.ts'
import { LOCALES, type Locale } from '../../lib/locales.ts'
import type { Density, Theme } from '../../lib/prefs.ts'
import { CheckIcon, ChevronIcon } from './icons.tsx'
import { Menu, MenuLabel, MenuRow, MenuSeparator } from './menu.tsx'
import { Monogram } from './monogram.tsx'

/**
 * The account, at the foot of the sidebar: who you are, and the three things about the
 * interface you are allowed to change.
 *
 * Theme and density are here because this is the first surface in the app that can reach
 * them. `design-system/tokens.css` has had a full contrast-verified dark palette and a
 * `[data-density="compact"]` block since M2, and until this menu existed nothing in
 * `apps/web` ever set `.dark` or moved `data-density` off its hard-coded default. Shipping
 * the shell without them would mean opening this component again within the month.
 *
 * `setLocale` is imported from `components/auth/actions.ts` rather than redeclared next to
 * the other two. It was written for the sign-in screen, it writes the same `NEXT_LOCALE`
 * cookie this surface reads, and it is already tested there -- a second copy is a second
 * place for the cookie options to drift. `docs/specs/0001`'s own "reused, not duplicated"
 * rule, applied to a function rather than to a string.
 *
 * ## Why the writes are optimistic-free
 *
 * No `useOptimistic`, no local mirror of the chosen value. Each Server Function writes the
 * cookie and revalidates the dashboard tree, and the layout re-renders from the cookie --
 * so the rendered state is always the persisted state. A local mirror would show the new
 * theme before the cookie landed and then have to reconcile if the write failed, which is
 * more machinery than a same-host round trip deserves. Neither number here is measured, so
 * neither is quoted.
 */
export function AccountMenu({
  name,
  email,
  collapsed,
  locale,
  theme,
  density,
  labels,
}: {
  name: string | null
  email: string
  collapsed: boolean
  locale: Locale
  theme: Theme
  density: Density
  labels: {
    account: string
    language: string
    theme: string
    themeLight: string
    themeDark: string
    density: string
    densityComfortable: string
    densityCompact: string
    signOut: string
  }
}) {
  const [pending, startTransition] = useTransition()
  // The email is the fallback and not a placeholder: Better Auth's OTP flow creates the
  // account before a name is ever asked for, so `users.name` is genuinely null for anyone
  // who has not been through `needsName`. Showing the address is more use than "Unnamed".
  const display = name?.trim() || email

  const run = (fn: () => Promise<void>) => () => {
    startTransition(() => {
      void fn()
    })
  }

  return (
    <Menu
      side="top"
      trigger={({ ref, ...aria }) => (
        <button
          type="button"
          ref={ref}
          {...aria}
          aria-label={collapsed ? labels.account : undefined}
          title={collapsed ? display : undefined}
          disabled={pending}
          className={cx(
            'flex h-11 w-full items-center gap-2.5 rounded-[var(--radius)] transition-colors',
            'enabled:cursor-pointer disabled:opacity-60',
            'hover:bg-muted/60 outline-none focus-visible:outline-ring focus-visible:outline-2',
            collapsed ? 'justify-center' : 'px-2.5',
          )}
        >
          <Monogram name={display} rounded="rounded-full" />
          {collapsed ? null : (
            <>
              <span className="min-w-0 flex-1 truncate text-left text-sm">{display}</span>
              <ChevronIcon className="size-[1em] shrink-0 opacity-60" />
            </>
          )}
        </button>
      )}
    >
      {(close) => (
        <>
          <MenuLabel>{labels.language}</MenuLabel>
          <div className="px-2 pb-1.5">
            {/* The one primitive reused from packages/ui. Its `onSelect` branch exists
                precisely for a surface whose URLs carry no language prefix. */}
            <LocaleSwitcher
              locales={LOCALES}
              current={locale}
              label={labels.language}
              disabled={pending}
              onSelect={(next) => {
                close()
                startTransition(() => {
                  void setLocale(next)
                })
              }}
            />
          </div>

          <MenuSeparator />
          <MenuLabel>{labels.theme}</MenuLabel>
          {(
            [
              ['light', labels.themeLight],
              ['dark', labels.themeDark],
            ] as const
          ).map(([value, label]) => (
            <MenuRow
              key={value}
              selected={theme === value}
              onClick={() => {
                close()
                if (theme !== value) run(() => setTheme(value))()
              }}
            >
              <span className="min-w-0 flex-1">{label}</span>
              {theme === value ? <CheckIcon className="size-[0.9em] shrink-0" /> : null}
            </MenuRow>
          ))}

          <MenuSeparator />
          <MenuLabel>{labels.density}</MenuLabel>
          {(
            [
              ['comfortable', labels.densityComfortable],
              ['compact', labels.densityCompact],
            ] as const
          ).map(([value, label]) => (
            <MenuRow
              key={value}
              selected={density === value}
              onClick={() => {
                close()
                if (density !== value) run(() => setDensity(value))()
              }}
            >
              <span className="min-w-0 flex-1">{label}</span>
              {density === value ? <CheckIcon className="size-[0.9em] shrink-0" /> : null}
            </MenuRow>
          ))}

          <MenuSeparator />
          {/* A form, not a button calling the action: `signOut` redirects, and a redirect
              thrown from inside a transition is swallowed. `weddings/page.tsx` used to carry
              the precedent and this change deleted it, so this is the precedent now -- and
              `shell.test.tsx` asserts the form, because the button version typechecks and
              fails only in production. */}
          <form action={signOut}>
            <button
              type="submit"
              className={cx(
                'flex w-full cursor-pointer items-center rounded-[calc(var(--radius)-2px)] px-2 py-1.5',
                'text-left text-sm transition-colors',
                'hover:bg-muted focus-visible:outline-ring outline-none focus-visible:outline-2',
              )}
            >
              {labels.signOut}
            </button>
          </form>
        </>
      )}
    </Menu>
  )
}
