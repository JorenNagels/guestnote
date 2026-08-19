import 'server-only'
import { createDb, createPool, type Db } from '@guestnote/db'
import { env } from '../env.ts'

/**
 * The app's single database handle.
 *
 * ## Why this is a function and not `export const db = ...`
 *
 * A module-scope pool is evaluated when the module is first imported -- and `next build`
 * imports route modules while collecting page data. So an eager pool turns DATABASE_URL
 * into a *build-time* requirement: CI cannot compile without production credentials, a
 * container build cannot either, and M1a's CDK bundling step breaks. Deferring the
 * construction is the whole fix, and it costs one function call.
 *
 * ## Why memoised rather than per-request
 *
 * On Lambda the module scope survives between invocations, so one pool is reused across
 * requests on a warm container. That is what makes `withTenant`'s interactive
 * transactions cheap. It also means the pool must tolerate a freeze between
 * invocations -- see the note on background work in the plan's reversibility seam: no
 * timers, nothing that assumes the process keeps running after the response.
 *
 * ## Note what is NOT exported
 *
 * No raw handle escapes this module beyond `Db`. Every query against a **tenant-scoped**
 * table goes through `withTenant` or `withUser`, both of which open a transaction with the
 * tenant GUCs already set. The escape hatch is `@guestnote/db/unsafe`, which Biome and a
 * git-grep test both forbid outside `packages/db/**`.
 *
 * ## The two writers that do not go through either, and why
 *
 * Both touch `UNSCOPED_TABLES` only -- the bucket in `packages/db/src/schema/index.ts` whose
 * rows are written *before* a principal exists, so there is no tenant to scope to and
 * `withTenant` would set GUCs that no policy reads:
 *
 *   1. Better Auth's Drizzle adapter, handed this instance by `lib/auth.ts`. It owns
 *      `users`, `sessions`, `accounts`, `verifications`, `passkeys` and `rate_limits`.
 *   2. `recordDelivery` in `lib/mailer.ts`, which inserts one `mail_deliveries` row per send
 *      attempt. A sign-in code is requested by someone who is by definition not signed in.
 *
 * Neither is an exception to tenant isolation, because neither table has a tenant column --
 * `test/schema-coverage.test.ts` is what holds that, by failing if a table is added without a
 * classification. If a third writer appears here, or if either of these ever reaches a table
 * with an `org_id`, that is the point to stop rather than to widen this comment.
 */
let cached: Db | undefined

export function getDb(): Db {
  if (cached) return cached

  if (!env.databaseUrl) {
    throw new Error(
      'DATABASE_URL is not set. It must be the Neon POOLED url (the -pooler host), ' +
        'connected as `app_user` -- not the table owner, and without BYPASSRLS, or every ' +
        'RLS policy in packages/db/migrations silently does nothing. See .env.example and ' +
        'docs/adr/0001-rls-through-neon-pooler.md.',
    )
  }

  cached = createDb(createPool({ connectionString: env.databaseUrl }))
  return cached
}
