import type { ReactNode } from 'react'
import './descent.css'

/**
 * The unauthenticated branch of root layout B.
 *
 * `(public)` is a route group, so it adds no URL segment: `/pro/login` stays
 * `/pro/login`, which proxy.ts serves as `app.guestnote.be/login`. Its sibling `(app)`
 * gets the session shell at M3 -- getSession(), the org switcher, the nav -- and the
 * whole point of the split is that this branch never renders any of it.
 *
 * This layout exists only to own the import above. Co-locating the stylesheet with the
 * segment that uses it means the descent cannot leak onto a surface that has no rungs.
 */
export default function PublicAuthLayout({ children }: { children: ReactNode }) {
  return children
}
