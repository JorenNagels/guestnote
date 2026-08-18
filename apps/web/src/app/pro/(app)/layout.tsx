import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'
import { getAuth } from '../../../lib/auth.ts'
import { app } from '../../../lib/routes.ts'

/**
 * The authenticated branch of root layout B. Its sibling `(public)` holds sign-in.
 *
 * Route groups add no URL segment, so this guards `/` on `app.guestnote.be` without
 * appearing in the path. Everything below it can assume a session exists.
 *
 * ## Why the redirect lives here and not in proxy.ts
 *
 * proxy.ts says it deliberately does NOT do "redirect to /login when the cookie is
 * missing": an expired-but-present cookie still reaches the layout, so this check has to
 * exist regardless, and a copy in the proxy would add a second place to be wrong while
 * removing nothing.
 *
 * ## What this is NOT yet
 *
 * Not authorization. `getSession()` answers "who are you", and research/07 section 3 is
 * emphatic that "who may do what" resolves from `org_members` and `wedding_members`
 * joined against the wedding in the URL -- never from the session, and never from
 * `app.org_id`, which is a data-scoping mechanism rather than a permission. That layer
 * arrives with the wedding routes.
 */
export default async function AppShellLayout({ children }: { children: ReactNode }) {
  const session = await getAuth().getSession(await headers())
  if (!session) redirect(app.loginAfterExpiry())

  return children
}
