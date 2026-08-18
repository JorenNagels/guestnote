import { getAuth } from '../../../../lib/auth.ts'

/**
 * Better Auth's own endpoints: the passkey ceremony, sign-out, session refresh.
 *
 * `proxy.ts` bypasses the `/pro` rewrite for `/api/*` on the app host specifically so this
 * path stays where the library expects it. That file calls the bypass "the single most
 * breakable line", and this route is what it protects: without it these become
 * `/pro/api/auth/*`, which does not exist, and every sign-in request 404s.
 *
 * The email-code path does NOT come through here -- it runs as a Server Action, so the
 * cookie is set on the action's own response by the `nextCookies()` plugin.
 */
const handler = (request: Request) => getAuth().handler(request)

export { handler as GET, handler as POST }
