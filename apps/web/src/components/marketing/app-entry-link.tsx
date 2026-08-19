'use client'

import { useEffect, useState } from 'react'

type Props = {
  /** `app/api/session-hint`, absolute. See `lib/app-url.ts` for why it must be. */
  hintUrl: string
  loginHref: string
  loginLabel: string
  dashboardHref: string
  dashboardLabel: string
  className?: string
}

/**
 * The apex's one door into the app: "Log in" for a visitor, "Dashboard" for a planner.
 *
 * ## Why a Client Component on an otherwise static page
 *
 * Because the answer cannot be known when this page is built or cached. `route.ts` on the
 * hint endpoint carries the full argument -- the session cookie is `__Host-` pinned to the app
 * host, and marketing is prerendered behind a shared CloudFront cache, so rendering the label
 * server-side would serve one planner's HTML to every prospect. Isolating the one dynamic bit
 * into a client component keeps the rest of the page static, which is the point: this is the
 * public/SEO surface.
 *
 * ## Why it starts on the login label rather than on nothing
 *
 * `useState(false)`, not `useState(null)` with a placeholder. Almost everyone who reaches the
 * apex is a prospect, so "Log in" is not a guess -- it is the right answer for the common case,
 * rendered in the static HTML, correct before any JavaScript runs and correct forever if
 * JavaScript never runs. A signed-in planner pays one label swap. A skeleton would instead give
 * *every* visitor a flash of nothing to buy a planner a slightly tidier transition.
 *
 * ## Why only `true` moves it
 *
 * Every other outcome -- offline, DNS blocked, tracking protection eating a cross-origin
 * credentialed fetch, CORS refused, a body that is not the shape expected -- leaves the login
 * label alone. That is the safe direction: a visitor sent to `/login` while signed in is
 * redirected straight to the dashboard by the sign-in page's own guard, so the failure mode
 * costs one redirect. The inverse, offering "Dashboard" to someone who is not signed in, ends
 * on a login screen that looks like a bug.
 *
 * ## Plain `<a>`, never `next/link`
 *
 * This crosses hosts. `next/link` would try to client-navigate inside the apex's router, where
 * neither `/login` nor the dashboard exists.
 */
export function AppEntryLink({
  hintUrl,
  loginHref,
  loginLabel,
  dashboardHref,
  dashboardLabel,
  className,
}: Props) {
  const [signedIn, setSignedIn] = useState(false)

  useEffect(() => {
    const controller = new AbortController()

    void (async () => {
      try {
        // `credentials: 'include'` is the whole request. Without it the browser sends no
        // cookie even though apex and app host are same-site, and the answer is always false.
        //
        // No headers, deliberately: that keeps this a CORS-simple request, so there is no
        // preflight and the route needs no OPTIONS handler. See the note at the bottom of
        // app/api/session-hint/route.ts before adding one.
        const response = await fetch(hintUrl, {
          credentials: 'include',
          signal: controller.signal,
        })
        if (!response.ok) return

        const body: unknown = await response.json()
        // Checked structurally rather than cast. It is one boolean over a network boundary,
        // and a truthiness test would flip the label on `{ signedIn: 'no' }`.
        if (typeof body === 'object' && body !== null && 'signedIn' in body) {
          if ((body as { signedIn: unknown }).signedIn === true) setSignedIn(true)
        }
      } catch {
        // Aborted, offline, or refused. All three mean "assume not signed in".
      }
    })()

    return () => controller.abort()
  }, [hintUrl])

  return signedIn ? (
    <a href={dashboardHref} className={className}>
      {dashboardLabel}
    </a>
  ) : (
    <a href={loginHref} className={className}>
      {loginLabel}
    </a>
  )
}
