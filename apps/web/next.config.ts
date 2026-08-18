import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

/**
 * One Next app, three surfaces, one deploy. See the plan and research/05-architecture.md
 * section 8 ("One Next app, not three").
 */
const nextConfig: NextConfig = {
  // research/05-architecture.md section 0. OpenNext consumes this at M1a.
  output: 'standalone',

  /**
   * The default traces only the project directory, and "any files outside of that
   * folder will not be included". Both packages/* and the hoisted
   * node_modules/@neondatabase/serverless live outside apps/web, so without this the
   * standalone bundle is missing the database layer entirely -- which you would
   * discover during the M1a deploy rather than here.
   *
   * Consequence: the output lands at .next/standalone/apps/web/server.js, NOT
   * .next/standalone/server.js.
   */
  outputFileTracingRoot: new URL('../..', import.meta.url).pathname,

  /**
   * OFF, deliberately. The dashboard is served from app.guestnote.be and rewritten by
   * proxy.ts to /pro/*, so its public paths (`/weddings`) are not routes in the file
   * tree and typed routes would reject every <Link> in the app. Writing the internal
   * path instead would put `/pro` in the user's URL bar.
   *
   * The substitute is src/lib/routes.ts -- href builders, one place to grep. Revisit
   * if Next ever makes typed routes rewrite-aware.
   */
  typedRoutes: false,

  /**
   * The workspace packages are consumed as TypeScript SOURCE with no build step (see
   * tsconfig.base.json). Turbopack transpiles workspace packages automatically, but
   * declaring them keeps `next build --webpack` -- the documented escape hatch --
   * working identically, and documents the intent.
   */
  transpilePackages: ['@guestnote/core', '@guestnote/db', '@guestnote/ui'],

  /**
   * research/05-architecture.md section 6 is explicit: do NOT use next/image plus the
   * OpenNext image function for user content, because /_next/image?url=...&w=... is an
   * unbounded compute surface. Setting this now removes the surface rather than
   * relying on a code-review rule to keep it closed.
   *
   * The replacement is already decided: the pre-derived AVIF/WebP ladder plus
   * <img srcset>, porting se-parti-website/src/lib/imageLoader.ts. That arrives with
   * the sharp pipeline at PH4. Marketing images lose optimisation until then, which is
   * an acceptable price for a surface that currently has no images.
   */
  images: { unoptimized: true },

  // NOT set: `serverExternalPackages`. @neondatabase/serverless@1.1.0 declares zero
  // dependencies, so there is no native-module reason to externalise it, and a package
  // may not appear in both transpilePackages and serverExternalPackages -- Next throws
  // at build start if it does.
  //
  // NOT set: `cacheComponents`. Nothing in PH0-PH3 is cached (the dashboard is
  // private/no-store by design, guest sites are stubs, and marketing is statically
  // prerendered with the flag off already). Turning it on now would couple
  // research/05-architecture.md section 11.1's unverified OpenNext-v4-x-Cache-Components
  // risk to M1a's "does OpenNext work at all", and would spend the hosting
  // reversibility section 9 explicitly banks on. It flips at M1b, with per-tenant ISR.
}

/**
 * next-intl's *plugin* only, never its `createMiddleware`. proxy.ts already owns host
 * branching and the `/` -> `/nl` redirect, and two middlewares competing for ownership of
 * rewrites is how this goes wrong.
 */
export default createNextIntlPlugin('./src/i18n/request.ts')(nextConfig)
