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
 * The `weddings` policy has no role clause -- `0001_rls.sql` admits a `couple` to their own
 * wedding row, whole, and that is what the couple portal will need. So for `weddings` the
 * application is the only thing between a couple and the planner's internal `notes`, and
 * this is where it is said. Tables added in 0006 do carry the role clause, so for them this is
 * belt and RLS is braces; for `weddings` it is belt alone. Do not "simplify" this into
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
