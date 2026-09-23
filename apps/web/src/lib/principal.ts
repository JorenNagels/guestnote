import 'server-only'
import {
  landingOrgId,
  listOrgsForUser,
  type Memberships,
  type OrgSummary,
  resolveMemberships,
} from '@guestnote/db'
import { cookies, headers } from 'next/headers'
import { cache } from 'react'
import { getAuth } from './auth.ts'
import { getDb } from './db.ts'
import { ORG_COOKIE } from './prefs.ts'

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
 * ## The switcher's choice, and why it is checked rather than trusted
 *
 * This docstring used to end "when the switcher lands it replaces this function's body and
 * nothing else". That is what happened, and the shape it predicted -- a cookie -- is the
 * one that shipped: `gn_org`, written by `switchOrg` in the dashboard's `actions.ts`.
 * `packages/db/src/repos/memberships.ts` argues why a `last_used_at` column stayed
 * deferred in its favour.
 *
 * A cookie is client state, so it is an ASSERTION and never an answer. It is checked
 * against the resolved memberships on every read, and anything that does not match is
 * dropped on the floor in favour of `landingOrgId`. Three cases reach that fallback and
 * only one of them is unusual:
 *
 *   absent   -> first visit since sign-in, or a planner who has never switched.
 *   unknown  -> a hand-edited cookie. Nothing to report: the value was never a permission,
 *               so forging it grants exactly what it grants for a legitimate value, which
 *               is a choice of which org to DISPLAY.
 *   stale    -> they were removed from the org since. Silently, and deliberately so: being
 *               removed from an organisation is not the planner's mistake, and an error
 *               screen explaining it would be the first they heard of it. They land in
 *               whatever they still have.
 *
 * The validation is the `find` below and nothing more, because that is genuinely all it
 * takes -- `memberships.orgs` is this user's rows and no one else's, so an id present in it
 * is by definition one they may act in. What may be DONE there is still re-derived by
 * `principalForOrg` on every query, unchanged.
 */
export const currentOrgId = cache(async (): Promise<string | null> => {
  const memberships = await currentMemberships()
  if (!memberships) return null

  const chosen = (await cookies()).get(ORG_COOKIE)?.value
  if (chosen && memberships.orgs.some((o) => o.orgId === chosen)) return chosen

  return landingOrgId(memberships)
})

/**
 * Who is signed in and which org they are acting in, or `null` when either is missing. The
 * first line of every Server Function: a Server Function is a POST to its own route, so no
 * layout guards it (CLAUDE.md invariant 7). This is the "is anybody there" check and NOT the
 * authorization -- every repo call re-derives the principal from `memberships`.
 */
export async function currentCaller(): Promise<{
  memberships: Memberships
  orgId: string
} | null> {
  const [memberships, orgId] = await Promise.all([currentMemberships(), currentOrgId()])
  return memberships && orgId ? { memberships, orgId } : null
}

/**
 * Every organisation this user belongs to, named, for the sidebar head and the switcher.
 *
 * `React.cache` for the same reason as everything else here: the head renders it and the
 * switcher renders it, in the same request tree, and they should cost one query between
 * them rather than one each.
 *
 * This is the ONLY way to name an organisation in this app, and that is deliberate. There
 * used to be a second -- `getOrg`, which read the row under an org-wide principal -- and it
 * returned null for an org `member` because `principalForOrg` refuses one. Harmless while
 * the org was always `landingOrgId`; a bug the moment the switcher could land a planner in
 * an org where they are a member, which rendered the wedding list under a blank org line.
 * It was deleted rather than fixed, on 2026-08-21, so the shape cannot come back. Migration
 * 0005 is what makes this readable for a member at all.
 *
 * When billing needs `plan` or `subscription_status`, that is a new function taking an
 * org-wide principal, and it should not be called `getOrg`.
 */
export const currentOrgs = cache(async (): Promise<OrgSummary[]> => {
  const session = await currentSession()
  if (!session) return []
  return listOrgsForUser(getDb(), session.userId)
})
