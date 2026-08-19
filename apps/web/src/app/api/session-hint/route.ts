import { apexOrigin } from '../../../lib/app-url.ts'
import { currentSession } from '../../../lib/principal.ts'

/**
 * One boolean, for the apex, which cannot work this out for itself.
 *
 * `guestnote.be` shows a "Log in" control that should read "Dashboard" for a planner who is
 * already signed in, and it has no way to know which. Two independent reasons, either of
 * which is enough:
 *
 *  1. The session cookie is `__Host-` prefixed, so it carries no `Domain` and is pinned to
 *     `app.guestnote.be`. The apex never receives it. That is deliberate and load-bearing --
 *     `proxy.ts` rests its "spoofing the host is not an escalation" argument on it, and PH4
 *     serves customer-facing wedding sites on `<slug>.guestnote.be` that must never be sent
 *     a planner's session.
 *  2. Marketing is prerendered and served with `public, s-maxage=60` from a *shared*
 *     CloudFront distribution (`proxy.ts`). Even with the cookie in hand, rendering the label
 *     server-side would cache the first signed-in planner's HTML and serve it to every
 *     prospect for the next minute. `Vary: Cookie` is not a fix: every visitor's cookie
 *     differs, so it means no caching at all on the public/SEO surface.
 *
 * So the browser asks, and this answers. Reachable only on the app host -- `proxy.ts` 404s
 * `/api/*` on the apex, and rewrites nothing under `/api` on the app host.
 *
 * ## What it deliberately does not return
 *
 * A boolean. No email, no user id, no organisation, no expiry. The apex needs to choose
 * between two words; anything else here would be a field someone later renders on a page
 * that is cached and shared. Making it unrepresentable beats remembering not to use it.
 *
 * ## Why this is not a session oracle for the web
 *
 * A page on `evil.com` can call this with `credentials: 'include'`, and two things happen.
 * The cookie is `SameSite=Lax`, so on a genuinely cross-*site* request the browser does not
 * send it and the answer is `false` regardless of who is signed in. And CORS below names the
 * apex exactly, so the response is unreadable to any other origin anyway. `curl` can of
 * course call it with a stolen cookie -- but anyone holding that cookie is already signed in,
 * so there is nothing here they did not have.
 *
 * ## The cost, stated
 *
 * One request per marketing page view. It is cheap in the case that dominates: with no
 * session cookie present Better Auth returns null without touching the database, so an
 * anonymous visitor -- almost every visitor to the apex -- costs an HTTP round trip and no
 * query. Only a request that actually carries a session pays for a `sessions` lookup.
 */
export async function GET(request: Request): Promise<Response> {
  const session = await currentSession()

  const headers = new Headers({
    'Content-Type': 'application/json',
    // Belt to `proxy.ts`'s braces, which already marks the app host `private, no-store`.
    // Stated here too because this handler is the authority on its own cacheability, and a
    // matcher change must not be able to make this response cacheable by accident.
    'Cache-Control': 'private, no-store',
    // Mandatory, not hygiene: the CORS header below depends on the request's Origin, so a
    // cache without this could hand the apex's `Access-Control-Allow-Origin` to a response
    // destined for a different origin.
    Vary: 'Origin',
  })

  // Echoed only on an exact match, and never `*`: the spec forbids `*` alongside
  // credentialed requests, and a prefix or suffix test would admit `guestnote.be.evil.com`.
  // Any other origin gets the answer with no CORS headers, so the browser refuses to let it
  // be read -- which is the correct outcome and needs no branch of its own.
  if (request.headers.get('origin') === apexOrigin()) {
    headers.set('Access-Control-Allow-Origin', apexOrigin())
    headers.set('Access-Control-Allow-Credentials', 'true')
  }

  return new Response(JSON.stringify({ signedIn: session !== null }), { status: 200, headers })
}

/**
 * There is deliberately no `OPTIONS` handler.
 *
 * A preflight only happens for a request that is not CORS-"simple", and the caller
 * (`components/marketing/app-entry-link.tsx`) is a bare `GET` with no custom headers, which
 * is simple. Adding an `OPTIONS` export today would be dead code.
 *
 * **This is the trap to know about:** the first request header anyone adds to that fetch --
 * `Accept: application/json` is the tempting one, or an `X-` anything -- turns it into a
 * preflighted request, the browser sends `OPTIONS` first, this route answers 405, and the
 * label silently stops updating with nothing in any log to say why. Add the handler at the
 * same time as the header, or do not add the header.
 */
