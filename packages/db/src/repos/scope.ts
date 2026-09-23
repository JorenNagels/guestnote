import type { Db } from '../client.ts'
import type { MembershipPrincipal } from '../tenant.ts'
import type { Memberships } from './memberships.ts'
import { staffPrincipal } from './staff-principal.ts'

/**
 * Who is asking about which wedding, resolved once: the first argument of every repo function
 * that works on one wedding. It replaced `(db, m, orgId, weddingId, ...)` on every such function
 * (PR #1 review, 2026-09-23), and it is where `staffPrincipal` now runs -- once per scope, not
 * once per call.
 *
 * Org-wide functions (`listVendors`, `getTemplate`, `createStaffInvite`, ...) keep
 * `(db, m, orgId)`: their gate differs per function (read vs write, `principalForOrg` vs
 * `templateAccess`), so there is no one principal to resolve up front. A few wedding functions
 * also derive their own from `scope.m` -- `getWedding` admits a couple, vendor links are owner
 * and admin only -- which is why `m` is on the scope.
 *
 * ## Why a class with a private constructor, and not an object type
 *
 * The rule this package has always kept is that a caller hands in MEMBERSHIPS and the repo
 * decides the principal; nothing outside `packages/db` can name one. A plain
 * `{ principal, ... }` type would let an app file build a scope with any principal it liked.
 * A `#private` field makes the type nominal -- no object literal satisfies it -- and the private
 * constructor leaves `WeddingScope.of` as the only way in, and it takes memberships.
 *
 * `principal` is `null` for no standing (a couple, an outside editor, an unassigned member,
 * another org). Each function still answers that itself, with the same 404 as before, so a
 * scope is safe to build before anyone has checked it.
 */
export class WeddingScope {
  readonly #principal: MembershipPrincipal | null

  private constructor(
    readonly db: Db,
    readonly m: Memberships,
    readonly orgId: string,
    readonly weddingId: string,
  ) {
    this.#principal = staffPrincipal(m, orgId, weddingId)
  }

  static of(db: Db, m: Memberships, orgId: string, weddingId: string): WeddingScope {
    return new WeddingScope(db, m, orgId, weddingId)
  }

  /** Owner, admin, or a member assigned to this wedding; `null` for anyone else. */
  get principal(): MembershipPrincipal | null {
    return this.#principal
  }
}
