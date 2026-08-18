import { cookies } from 'next/headers'
import { getRequestConfig } from 'next-intl/server'
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE, type Locale } from '../lib/locales.ts'

/**
 * One config, two modes -- which is the thing the plan flagged as unverified, and it is
 * supported. `getRequestConfig`'s own types document the case we depend on: `requestLocale`
 * "can be `undefined` when a page outside of the `[locale]` segment renders".
 *
 *   marketing  /nl, /en, /fr   -> locale comes from the [locale] SEGMENT
 *   dashboard  /pro/*          -> no segment, so it comes from a COOKIE
 *
 * Public URLs carry a language prefix because that is an SEO device. An authenticated app
 * does not need one, and a planner should not lose their place in the dashboard by
 * switching language -- so those two surfaces genuinely want different mechanisms rather
 * than one mechanism applied twice.
 *
 * ## On `requestLocale` being deprecated
 *
 * next-intl marks it deprecated in favour of `next/root-params`, which is stable in Next
 * 16.3. Not migrating yet, deliberately: `next/root-params` "cannot be used in Client
 * Components, Server Actions, or Route Handlers", and Route Handlers are exactly where
 * this app will need translations next -- the assignment email and weekly digest at P10
 * render react-email templates through the same NL/EN/FR catalogues. Migrating now would
 * mean maintaining two locale-resolution paths instead of one. Revisit when root-params
 * covers Route Handlers.
 */
export default getRequestConfig(async ({ requestLocale }) => {
  const segment = await requestLocale

  // Marketing. Note this branch never reads a cookie, which is what keeps those pages
  // statically prerenderable -- a `cookies()` call here would make all three dynamic.
  if (isLocale(segment)) return config(segment)

  // Dashboard and anything else without a [locale] segment.
  const fromCookie = (await cookies()).get(LOCALE_COOKIE)?.value
  return config(isLocale(fromCookie) ? fromCookie : DEFAULT_LOCALE)
})

async function config(locale: Locale) {
  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
    // Belgium. Fixes date, number and currency formatting for every consumer of
    // `useFormatter`, so a wedding date is never rendered in the server's timezone.
    timeZone: 'Europe/Brussels',
  }
}
