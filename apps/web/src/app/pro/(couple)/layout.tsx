import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'
import { currentSession } from '../../../lib/principal.ts'
import { app } from '../../../lib/routes.ts'

/**
 * The couple portal's branch of root layout B (spec 0008), a sibling of `(app)` and `(public)`.
 * Its own group rather than a scoped-down `(app)`: the planner shell -- the org switcher, the
 * sidebar, the trial banner -- is chrome a couple should never see greyed out, and every future
 * planner screen would otherwise have to remember the couple case.
 *
 * Like `(app)/layout.tsx`, a session is required and its absence is a redirect to sign-in. This
 * is "who are you", not authorization: each wedding below resolves the couple from the database
 * (`lib/couple.ts`), and a Server Function does it again for itself.
 */
export default async function CoupleLayout({ children }: { children: ReactNode }) {
  if (!(await currentSession())) redirect(app.loginAfterExpiry())
  return <div className="bg-muted/40 min-h-dvh print:bg-transparent">{children}</div>
}
