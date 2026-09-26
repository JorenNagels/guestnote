/**
 * The repository layer.
 *
 * Every module here takes a `Db` and returns plain rows, and every one of them reaches
 * the database through `withTenant` or `withUser` -- never through a raw handle. That is
 * the layer research/07-auth-and-tenancy.md section 4a refers to when it says "the
 * repository layer exposes no user listing or search, so there is no code path that
 * enumerates users": the guarantee is a property of what is exported from here.
 *
 * Exceptions to "through `withTenant` or `withUser`", by construction, each one call of one
 * SECURITY DEFINER function on a plain `Db` because it runs with no principal at all, and none
 * reads a table itself: `invitations.ts`'s `resolveInvitationByHash` (migration 0007),
 * `vendor-links.ts`'s `resolveVendorLinkByHash` (0008). The third, `orgsWithTrialEnding` (0010), is
 * NOT here: it reads across every tenant for the trial-reminder cron, so it lives behind its own
 * export path, `@guestnote/db/cron` (`src/cron.ts`), which only the cron route may import.
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
export type { AcceptOutcome, InvitationLookup, PendingInvitation } from './invitations.ts'
export {
  acceptInvitationByHash,
  acceptInvitationById,
  myPendingInvitations,
  resolveInvitationByHash,
} from './invitations.ts'
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
export { WeddingScope } from './scope.ts'
export * from './studios.ts'
export * from './task-comments.ts'
export * from './task-dates.ts'
export * from './tasks.ts'
export * from './team.ts'
export * from './templates.ts'
export * from './vendor-links.ts'
export * from './vendors.ts'
export * from './weddings.ts'
