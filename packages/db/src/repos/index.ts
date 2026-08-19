/**
 * The repository layer.
 *
 * Every module here takes a `Db` and returns plain rows, and every one of them reaches
 * the database through `withTenant` or `withUser` -- never through a raw handle. That is
 * the layer research/07-auth-and-tenancy.md section 4a refers to when it says "the
 * repository layer exposes no user listing or search, so there is no code path that
 * enumerates users": the guarantee is a property of what is exported from here.
 */

export type { Memberships, OrgMembership, WeddingMembership } from './memberships.ts'
export {
  landingOrgId,
  principalForOrg,
  principalForWedding,
  resolveMemberships,
} from './memberships.ts'
export type { OrgSummary, WeddingSummary } from './weddings.ts'
export { getOrg, listWeddings } from './weddings.ts'
