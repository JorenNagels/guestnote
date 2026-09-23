import 'server-only'
import { WeddingScope } from '@guestnote/db'
import { getDb } from './db.ts'
import { currentCaller } from './principal.ts'
import { isUuid } from './uuid.ts'

/**
 * The `WeddingScope` for this request's caller and one wedding, or `null` when nobody is
 * signed in, there is no org, or the id is not a UUID (Postgres would throw on the cast, and the
 * rule is a 404, not a 500). Pages and Server Functions call this once and hand the scope to
 * every repo call they make.
 *
 * `null` here is "is anybody there", not authorization: a scope for a wedding the caller may not
 * see is still built, and every repo function answers it with its own 404 (see
 * `packages/db/src/repos/scope.ts`).
 *
 * Its own file rather than `principal.ts`, so a test that mocks `principal.ts` and `db.ts` gets
 * this for free over its mocks instead of restating it.
 */
export async function currentWeddingScope(weddingId: unknown): Promise<WeddingScope | null> {
  if (!isUuid(weddingId)) return null
  const c = await currentCaller()
  return c ? WeddingScope.of(getDb(), c.memberships, c.orgId, weddingId) : null
}
