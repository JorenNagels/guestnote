/**
 * `@guestnote/db`
 *
 * Note what is NOT exported here: any unscoped database handle. Callers get
 * `withTenant` / `withUser`, both of which open a transaction with the tenant GUCs
 * already set. The escape hatch lives behind a separate, deliberately ugly export
 * path -- `@guestnote/db/unsafe` -- so that reaching for it shows up in a diff and
 * in a grep. research/05-architecture.md section 4.
 */

export type { Db, DbPoolOptions } from './client.ts'
export { createDb, createPool } from './client.ts'
export { newId } from './id.ts'
export * as schema from './schema/index.ts'
export {
  assertScoped,
  INTERNAL_VISIBLE_ROLES,
  type Principal,
  type TenantDb,
  TenantScopeError,
  withTenant,
  withUser,
} from './tenant.ts'
