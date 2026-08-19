import 'server-only'
import { landingOrgId, type Memberships, resolveMemberships } from '@guestnote/db'
import { headers } from 'next/headers'
import { cache } from 'react'
import { getAuth } from './auth.ts'
import { getDb } from './db.ts'

/**
 * Session and memberships, resolved once per request.
 *
 * This is the join research/07-auth-and-tenancy.md section 3 describes: the session
 * answers "who are you", `org_members` and `wedding_members` answer "what may you
 * touch", and nothing anywhere is allowed to infer the second from the first. The
 * layout, the page and any Server Function in the same request all call these and get
 * one round trip between them.
 *
 * `React.cache` and not a module-level variable: the cache is scoped to one request and
 * shared by nothing, which is the only correct lifetime for a value derived from a
 * cookie. A module-level cache on a warm Lambda container would serve one planner's
 * memberships to the next request that landed there.
 */

/** The signed-in user, or `null`. Deduplicated across the request tree. */
export const currentSession = cache(async () => getAuth().getSession(await headers()))

/**
 * Every membership the signed-in user holds, or `null` when nobody is signed in.
 *
 * Note it does NOT throw for a signed-in user with no memberships at all. That is a
 * real and reachable state, not an error: the email-OTP plugin creates an account on
 * first verification, so anyone who can receive mail can reach a session, and until
 * somebody invites them they are staff nowhere. The shell renders that honestly.
 */
export const currentMemberships = cache(async (): Promise<Memberships | null> => {
  const session = await currentSession()
  if (!session) return null
  return resolveMemberships(getDb(), session.userId)
})

/**
 * The organisation the dashboard is currently acting in, or `null`.
 *
 * ## Why there is no org in the URL
 *
 * `lib/routes.ts` defines the dashboard's paths as `/weddings` and `/weddings/<id>`,
 * with no organisation segment, and that is the shape this follows rather than
 * overrides. For the overwhelmingly common case -- a planner who is staff at exactly
 * one organisation -- a segment would be a uuid in the URL bar that never changes and
 * never means anything to them.
 *
 * So the org is resolved, not routed: `landingOrgId` picks it, deterministically, from
 * the memberships. `Session.lastOrgId` describes exactly this ("where rung 2 lands
 * them, with the shell's switcher owning everything after that").
 *
 * ## What this is not
 *
 * It is not a permission, and the value never reaches `withTenant` unchecked. Every
 * read still goes through `principalForOrg`, which re-derives the role from the
 * membership rows. Choosing *which* org to display and deciding *what may be done*
 * inside it stay two separate questions -- section 3's rule that `app.org_id` is a
 * data-scoping mechanism and never a permission.
 *
 * When the switcher lands it replaces this function's body and nothing else: the choice
 * becomes explicit (a segment, or a cookie the switcher writes), while every caller
 * keeps asking the same question.
 */
export const currentOrgId = cache(async (): Promise<string | null> => {
  const memberships = await currentMemberships()
  return memberships ? landingOrgId(memberships) : null
})
