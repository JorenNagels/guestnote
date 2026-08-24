import { cookies } from 'next/headers'
import { getLocale } from 'next-intl/server'
import type { ReactNode } from 'react'
import { DENSITY_COOKIE, parseDensity, parseTheme, THEME_COOKIE } from '../../lib/prefs.ts'
import '../globals.css'

/**
 * ROOT LAYOUT B -- the dashboard and, from PH1, the couple portal.
 *
 * Reached only via `proxy.ts`, which rewrites `app.guestnote.be/weddings` to
 * `/pro/weddings`. The `/pro` prefix never appears in a URL bar, and inbound `/pro/*`
 * is 404'd by the proxy guard so this namespace is unreachable from outside.
 *
 * The prefix is `/pro` while the host label is `app` on purpose: the two are
 * independent, so changing the host label is a config edit rather than a directory
 * move. `pro.` remains as a permanent redirect.
 *
 * The authenticated shell -- getSession(), the org switcher, the nav -- lives in the
 * nested `(app)/layout.tsx`, so that `(public)/login` can sit beside it without one.
 *
 * ## What replaced `await connection()`
 *
 * This layout used to call it, because without any dynamic input `next build` prerendered
 * `/pro` as STATIC -- measured, not guessed: the build output showed a `○`.
 * research/05-architecture.md section 1 requires this surface to be `private, no-store`,
 * and a per-user dashboard that is static by accident stays correct only until the first
 * real query lands in it.
 *
 * Its own comment said it becomes redundant at M3 and that removing it *then* is correct.
 * This is M3, and what makes it redundant is three lines below: `cookies()` is dynamic
 * input, on every request, for every route under this layout. The assertion is the build
 * output, not this paragraph -- `/pro` must print `f` and not a circle.
 *
 * If the preference reads below ever move somewhere else, `connection()` has to come back
 * on the same commit. The reason to leave this note rather than delete the section: the
 * next person to simplify this layout needs to know it was load-bearing once.
 */
export default async function ProRootLayout({ children }: { children: ReactNode }) {
  // Resolved from the NEXT_LOCALE cookie, not from the URL -- dashboard paths carry no
  // language prefix, because that is an SEO device and a planner should not lose their
  // place by switching language. See src/i18n/request.ts, and lib/prefs.ts for why this
  // stayed a cookie rather than becoming the `users` column this comment used to promise.
  const [locale, store] = await Promise.all([getLocale(), cookies()])

  const theme = parseTheme(store.get(THEME_COOKIE)?.value)
  const density = parseDensity(store.get(DENSITY_COOKIE)?.value)

  // `gn_nav` is NOT read here. It was, as `data-nav` on <html>, with a comment claiming the
  // sidebar read it for its initial width and that CSS could react before JavaScript ran --
  // and nothing ever read it, in CSS or anywhere else. The sidebar lives under
  // `(app)/layout.tsx`, which resolves the cookie into a prop, so that is where it is read.
  // Writing an attribute no selector matches is worse than not writing one.
  return (
    // All three land on <html> rather than on a wrapper, and they have to: `.dark` is
    // consumed by `@custom-variant dark (&:is(.dark *))` in tokens.css, and both
    // attributes are read by `:root[...]` selectors. A div would match neither.
    //
    // Server-rendered rather than applied by a script on load, which is the whole reason
    // these are cookies: the first paint is already correct, so there is no flash of the
    // wrong theme and no jump from a wide sidebar to a narrow one.
    <html
      lang={locale}
      className={theme === 'dark' ? 'dark' : undefined}
      // research/08-design-system.md: `[data-density="compact"]` switches row height,
      // cell padding and control height together, because a 300-guest list is unusable at
      // comfortable spacing.
      data-density={density}
    >
      <body>{children}</body>
    </html>
  )
}
