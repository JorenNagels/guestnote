import { Pool } from '@neondatabase/serverless'
import type { ExtractTablesWithRelations } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/neon-serverless'
import type { PgDatabase, PgQueryResultHKT, PgTransaction } from 'drizzle-orm/pg-core'
import * as schema from './schema/index.ts'

/**
 * Production database access. Neon, over the WebSocket/pooled driver.
 *
 * ## Why only the pooled driver, and not Neon's HTTP one
 *
 * research/05-architecture.md section 4 prescribes two: HTTP for cached reads,
 * WebSocket/pooled inside `withTenant`. Only the second exists, for two reasons
 * recorded in that section's correction note:
 *
 *  1. Under planner-first there ARE no cached reads. `pro.guestnote.be` is
 *     `private, no-store` by design, so in PH0-PH3 the HTTP driver has no use case.
 *     Adding it later is one export.
 *  2. The reason originally given was wrong, and wrong reasons get "corrected" by a
 *     later reader. `neon.transaction([...])` IS a real transaction, batched into one
 *     request. What the HTTP driver cannot do is *interactive* logic between
 *     statements -- and `withTenant` is interactive by nature: set_config, then an
 *     arbitrary callback, then commit. The conclusion held; the mechanism cited
 *     did not.
 *
 * ## The type, not the driver, is the seam
 *
 * `Db` and `TenantDb` below are drizzle's driver-agnostic `PgDatabase` /
 * `PgTransaction`. Everything downstream -- `withTenant`, every repository, every
 * test -- is written against those, so it does not know or care which driver produced
 * the handle.
 *
 * That is what lets the isolation suite run against a local Postgres via
 * `node-postgres` (see test/harness.ts) while production runs on Neon. The policy
 * logic is ordinary Postgres behaviour and is worth verifying in seconds and offline;
 * what is genuinely Neon-specific is whether a transaction-local GUC survives COMMIT
 * on a recycled pooled connection, and that assertion needs the real thing.
 *
 * It is also what makes the swap named in research/05-architecture.md section 4 --
 * Neon to Aiven, or to a direct unpooled connection if the pooler assertions fail --
 * a change to this file and nothing else.
 */

export type Schema = typeof schema

export type Db = PgDatabase<PgQueryResultHKT, Schema, ExtractTablesWithRelations<Schema>>

export type TenantDb = PgTransaction<PgQueryResultHKT, Schema, ExtractTablesWithRelations<Schema>>

export type DbPoolOptions = {
  connectionString: string
  /**
   * Deliberately small in tests: test/pooling.test.ts proves GUCs do not leak between
   * transactions that genuinely SHARE a connection, and a pool large enough to give
   * every caller its own connection would pass while proving nothing.
   */
  max?: number
}

export function createPool({ connectionString, max }: DbPoolOptions): Pool {
  if (!connectionString) {
    throw new Error(
      'createPool: connectionString is empty. Expected a Neon POOLED url (the -pooler host).',
    )
  }
  return new Pool({ connectionString, ...(max === undefined ? {} : { max }) })
}

export function createDb(pool: Pool): Db {
  return drizzle(pool, { schema }) as unknown as Db
}

export { Pool }
