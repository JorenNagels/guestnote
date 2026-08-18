'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getAuth } from '../../../lib/auth.ts'
import { app } from '../../../lib/routes.ts'

/**
 * Ends the session and returns to sign-in.
 *
 * A Server Action rather than a link to Better Auth's own endpoint, so the cookie is
 * cleared on this response and the redirect happens in the same round trip -- one
 * navigation instead of two, and no window where the page has rendered as signed-out
 * while the cookie is still live.
 */
export async function signOut(): Promise<never> {
  await getAuth().signOut(await headers())
  redirect(app.login())
}
