import { connection } from 'next/server'
import { getLocale } from 'next-intl/server'
import type { ReactNode } from 'react'
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
 * The authenticated shell -- getSession(), the org switcher, the nav -- arrives at M3 in
 * a nested `(app)/layout.tsx`, so that `(public)/login` can sit beside it without one.
 *
 * ## Why `await connection()`
 *
 * Without it the placeholder below has no dynamic input, so `next build` prerenders
 * `/pro` as STATIC content -- which was measured, not guessed: the build output showed
 * `○ /pro`. research/05-architecture.md section 1 requires this surface to be
 * `private, no-store`, and a per-user dashboard that is static by accident is the kind of
 * thing that stays correct only until the first real query lands in it.
 *
 * `connection()` rather than `export const dynamic = 'force-dynamic'` on purpose: the
 * segment-config form is the one that becomes an error under Cache Components, and M1b
 * has to flip that flag. This form is the forward-compatible way to say the same thing.
 *
 * It becomes redundant at M3, when the shell's `getSession()` makes the subtree dynamic
 * for real. Removing it then is correct; removing it now is not.
 */
export default async function ProRootLayout({ children }: { children: ReactNode }) {
  await connection()

  // Resolved from the NEXT_LOCALE cookie, not from the URL -- dashboard paths carry no
  // language prefix, because that is an SEO device and a planner should not lose their
  // place by switching language. At M3 this reads the user row instead, with the cookie
  // as the pre-login fallback. See src/i18n/request.ts.
  const locale = await getLocale()

  return (
    <html lang={locale} data-density="comfortable">
      {/* research/08-design-system.md: `[data-density="compact"]` switches row height,
          cell padding and control height together, because a 300-guest list is
          unusable at comfortable spacing. The attribute lives here so a future user
          preference has one place to write to. */}
      <body>{children}</body>
    </html>
  )
}
