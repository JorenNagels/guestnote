import type { Pool } from '@neondatabase/serverless'
import { createDb } from './client.ts'

/**
 * The unscoped handle. Named to be ugly so that it is visible in every diff.
 *
 * `packages/db` exports no raw handle from its main entry point. This module is a
 * separate export path (`@guestnote/db/unsafe`) precisely so that importing it is a
 * deliberate, greppable act, and it is banned outside `packages/db/**` and the
 * migration runner by two independent mechanisms:
 *
 *   - a Biome `noRestrictedImports` rule, and
 *   - test/no-unsafe-imports.test.ts
 *
 * Both, not either. A lint rule can be silenced with an inline comment; a test
 * cannot. And having the test carry the real weight means the choice of linter stays
 * reversible in ten minutes.
 *
 * research/05-architecture.md section 4.
 */
export function unsafeDbForMigrationsAndAdminOnly(pool: Pool) {
  return createDb(pool)
}
