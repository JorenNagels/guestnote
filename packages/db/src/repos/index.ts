/**
 * The repository layer.
 *
 * Every module here takes a `Db` and returns plain rows, and every one of them reaches
 * the database through `withTenant` or `withUser` -- never through a raw handle. That is
 * the layer research/07-auth-and-tenancy.md section 4a refers to when it says "the
 * repository layer exposes no user listing or search, so there is no code path that
 * enumerates users": the guarantee is a property of what is exported from here.
 */

/**
 * Every `export *` below is one of spec 0003's slice repos, one file per slice, each empty
 * until its slice fills it (`biome check --write` sorts them in among the named exports).
 * They are `export *` on purpose: a slice adds
 * exports to its own file and this barrel never changes again, which is what keeps eight
 * parallel branches from conflicting on one file. The cost is that two slices exporting the
 * same name is a compile error at the merge, not a silent shadow -- so prefix names by
 * domain (`listVendors`, not `list`).
 */
export * from './budget.ts'
export * from './events.ts'
export * from './files.ts'
export type {
  Memberships,
  OrgMembership,
  OrgSummary,
  WeddingMembership,
} from './memberships.ts'
export {
  landingOrgId,
  listOrgsForUser,
  principalForOrg,
  principalForWedding,
  resolveMemberships,
} from './memberships.ts'
export * from './payments.ts'
export * from './run-sheet.ts'
export * from './tasks.ts'
export * from './team.ts'
export * from './templates.ts'
export * from './vendor-links.ts'
export * from './vendors.ts'
export type { WeddingSummary } from './weddings.ts'
export { getWedding, listWeddings } from './weddings.ts'
