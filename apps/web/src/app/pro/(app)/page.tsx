import { redirect } from 'next/navigation'
import { app } from '../../../lib/routes.ts'

/**
 * The dashboard root, which is a redirect and not a screen.
 *
 * It replaces the temporary page that rendered `getSession()` output to prove the
 * session was real. That proof has a better home now: the wedding list cannot render at
 * all without a session, a `users` row, an `org_members` row and a `withTenant`
 * round-trip, so if it shows a wedding, every link in that chain held.
 *
 * `/weddings` is the landing surface rather than a dashboard of its own because
 * `09-planner-app.md` P16 -- "due this week, across every wedding" -- is the screen that
 * eventually belongs at `/`, and it does not exist yet. Pointing `/` at a real list is
 * more honest than an empty shell that has to be dismantled later.
 *
 * The target is the path the BROWSER shows. `proxy.ts` rewrites `app.guestnote.be/weddings`
 * to `/pro/weddings`; redirecting to the internal path would put `/pro` in the URL bar,
 * which `lib/routes.ts` exists to prevent.
 */
export default async function DashboardIndex() {
  redirect(app.weddings())
}
