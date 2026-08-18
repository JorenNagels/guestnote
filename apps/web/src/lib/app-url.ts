import { env } from '../env.ts'
import { app } from './routes.ts'

/**
 * Absolute URLs on the dashboard host, for links that start somewhere else.
 *
 * Every other href in this app is a path, because `routes.ts` encodes the rule that a
 * href is always the path the browser shows. This module is the one exception, and it
 * exists for one reason: **marketing and the dashboard are different hosts**, so a "log
 * in" link on `guestnote.be` is a cross-origin navigation and a path would keep the
 * visitor on the apex, where the login route does not exist.
 *
 * ## Why the session cannot simply follow them
 *
 * The session cookie is `__Host-` prefixed, which forbids a `Domain` attribute and pins
 * it to exactly one host (proxy.ts leans on this: reaching the origin with a spoofed
 * `x-forwarded-host` "lands on the app branch and gets the login page"). So a session can
 * only ever be minted on, and read from, `app.guestnote.be`. Signing in anywhere else --
 * including in an overlay on the apex -- cannot produce one. Hence: navigate.
 *
 * ## Scheme
 *
 * `http` for `localhost` and nothing else. `localhost` is a *potentially trustworthy
 * origin*, so `__Host-` cookies work over plain http there and dev matches production;
 * every other host gets `https` with no way to opt out.
 */
function origin(): string {
  const host = `${env.appSubdomain}.${env.rootDomain}`
  const isLocal = env.rootDomain === 'localhost' || env.rootDomain.endsWith('.localhost')
  // The dev server's port is not in the environment, and marketing is prerendered at
  // build time, so it cannot be read from a request either. 3000 is `next dev`'s default
  // and this branch never runs in a deployed environment.
  return isLocal ? `http://${host}:3000` : `https://${host}`
}

/** `https://app.guestnote.be/login` -- where a planner signs in, from anywhere. */
export function appLoginUrl(): string {
  return `${origin()}${app.login()}`
}
