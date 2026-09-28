import { Google_Sans_Flex } from 'next/font/google'

/**
 * The one typeface, Google Sans Flex (the Modern refresh in Claude Design, 2026-09-28), for
 * every surface that loads the token layer: the dashboard and the marketing site.
 *
 * Self-hosted by next/font at build, so the browser never contacts Google -- the privacy page
 * promises that, and it is why this is not the `<link>` to fonts.googleapis.com the design
 * project's proposal page uses. Exposed as `--font-google-sans`, which `--font-sans` in
 * `design-system/tokens.css` leads with; the class goes on each root layout's `<html>`.
 *
 * Here rather than in each layout so there is one call to keep in step; next/font keys its
 * output by call site, so two copies could also mean two sets of font files (reasoned from
 * how the loader works, not measured in a build). `opsz` is the axis the
 * proposal's large headings rely on; the other axes (ROND, GRAD, wdth, slnt) are left out
 * because nothing uses them and each one widens the file.
 */
export const googleSans = Google_Sans_Flex({
  subsets: ['latin', 'latin-ext'],
  axes: ['opsz'],
  variable: '--font-google-sans',
  display: 'swap',
})
