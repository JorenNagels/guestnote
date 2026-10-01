import type { MembershipPrincipal } from '../tenant.ts'
import { type Memberships, principalForOrg, principalForWedding } from './memberships.ts'

/**
 * The principal for a planner-app screen: org staff, or a member assigned to this wedding.
 * Never a couple, and never an outside editor.
 *
 * Not in the barrel on purpose. It is a helper for the slice repos, and exporting it would
 * make "who counts as staff" a name every caller could reach for instead of a decision made
 * once, here.
 *
 * ## Why the `weddingMember` refusal is here and not in a policy
 *
 * Since migration 0013 the `weddings` policy carries the staff list, so a `couple` reads no row
 * at all -- but that list includes `editor`, because an outside editor works on the wedding. So
 * for `weddings` the application is still the only thing between an outside editor and the
 * planner's internal `notes`, and this is where it is said. For a couple, and for the tables
 * added in 0006, this is belt and RLS is braces; for an editor on `weddings` it is belt alone.
 * (Before 0013 it was belt alone for a couple too.) Do not "simplify" this into
 * `principalForOrg(...) ?? principalForWedding(...)`, which is what `getWedding` does and is
 * correct for a name and a date but not for a write.
 *
 * Returns `null` for "no standing at all" as well, so a caller renders 404, never 403.
 */
export function staffPrincipal(
  m: Memberships,
  orgId: string,
  weddingId: string,
): MembershipPrincipal | null {
  const principal = principalForOrg(m, orgId) ?? principalForWedding(m, orgId, weddingId)
  if (!principal || principal.kind === 'weddingMember') return null
  return principal
}
