import { describe, expect, it } from 'vitest'
import { assertScoped } from '../tenant.ts'
import {
  landingOrgId,
  type Memberships,
  principalForOrg,
  principalForWedding,
} from './memberships.ts'

/**
 * The three pure functions here decide, for every request, which tenant a user is
 * allowed to act in. They take rows and return a `Principal` or `null`, touch no
 * database and hold no state -- so the security decision is testable exhaustively and
 * offline, which is the reason the query and the decision are separate functions at all.
 *
 * `resolveMemberships` and `listWeddings` need a real Postgres and live in the `db`
 * project. What is asserted there is that the POLICIES filter; what is asserted here is
 * that the application never asks them to filter something it should have refused
 * outright.
 */

const ORG_A = 'aaaaaaaa-0000-0000-0000-00000000000a'
const ORG_B = 'bbbbbbbb-0000-0000-0000-00000000000b'
const WEDDING_1 = '11111111-0000-0000-0000-000000000001'
const WEDDING_2 = '22222222-0000-0000-0000-000000000002'
const USER = 'dddddddd-0000-0000-0000-0000000000d1'

function memberships(m: Partial<Omit<Memberships, 'userId'>> = {}): Memberships {
  return { userId: USER, orgs: m.orgs ?? [], weddings: m.weddings ?? [] }
}

describe('principalForOrg', () => {
  it('gives owner and admin an org-wide principal', () => {
    for (const role of ['owner', 'admin'] as const) {
      const p = principalForOrg(memberships({ orgs: [{ orgId: ORG_A, role }] }), ORG_A)
      expect(p).toEqual({ kind: 'orgStaff', userId: USER, orgId: ORG_A, role })
    }
  })

  /**
   * The single most important assertion in this file.
   *
   * A `member` is "assigned weddings only". An org-wide principal for one would set
   * `app.org_id` with no `app.wedding_id`, and the `weddings` policy's
   * `... is null or id = ...` branch would then hand them the planner's entire book of
   * business -- the failure research/07-auth-and-tenancy.md section 3 calls the
   * highest-risk path in the model. RLS cannot catch it, because the GUCs are exactly
   * what an owner's would be.
   */
  it('refuses an org-wide principal to a member', () => {
    const p = principalForOrg(memberships({ orgs: [{ orgId: ORG_A, role: 'member' }] }), ORG_A)
    expect(p).toBeNull()
  })

  it('refuses an org the user is not staff at', () => {
    const m = memberships({ orgs: [{ orgId: ORG_A, role: 'owner' }] })
    expect(principalForOrg(m, ORG_B)).toBeNull()
    expect(principalForOrg(memberships(), ORG_A)).toBeNull()
  })

  /** A couple has a wedding but no org row, and must not gain an org-wide view from it. */
  it('refuses a user whose only standing is a wedding', () => {
    const m = memberships({ weddings: [{ weddingId: WEDDING_1, role: 'couple' }] })
    expect(principalForOrg(m, ORG_A)).toBeNull()
  })
})

describe('principalForWedding', () => {
  it('returns null for owner and admin, who use their org-wide principal instead', () => {
    for (const role of ['owner', 'admin'] as const) {
      const m = memberships({
        orgs: [{ orgId: ORG_A, role }],
        weddings: [{ weddingId: WEDDING_1, role: 'editor' }],
      })
      expect(principalForWedding(m, ORG_A, WEDDING_1)).toBeNull()
    }
  })

  it('pins an assigned member to the wedding they are assigned to', () => {
    const m = memberships({
      orgs: [{ orgId: ORG_A, role: 'member' }],
      weddings: [{ weddingId: WEDDING_1, role: 'editor' }],
    })
    expect(principalForWedding(m, ORG_A, WEDDING_1)).toEqual({
      kind: 'assignedStaff',
      userId: USER,
      orgId: ORG_A,
      weddingId: WEDDING_1,
      role: 'member',
    })
  })

  it('refuses a member a wedding they are not assigned to', () => {
    const m = memberships({
      orgs: [{ orgId: ORG_A, role: 'member' }],
      weddings: [{ weddingId: WEDDING_1, role: 'editor' }],
    })
    expect(principalForWedding(m, ORG_A, WEDDING_2)).toBeNull()
  })

  it('reads the couple and the outside editor off wedding_members', () => {
    for (const role of ['couple', 'editor'] as const) {
      const m = memberships({ weddings: [{ weddingId: WEDDING_1, role }] })
      expect(principalForWedding(m, ORG_A, WEDDING_1)).toEqual({
        kind: 'weddingMember',
        userId: USER,
        orgId: ORG_A,
        weddingId: WEDDING_1,
        role,
      })
    }
  })

  /**
   * The `editor` row means two different things and the org row is the only thing that
   * tells them apart -- `weddings.ts`: "`role` does double duty". Same wedding, same
   * row, different principal, purely because of an `org_members` row elsewhere.
   */
  it('reads the same editor row as staff or as an outsider depending on the org row', () => {
    const wedding = [{ weddingId: WEDDING_1, role: 'editor' }] as const
    const staff = principalForWedding(
      memberships({ orgs: [{ orgId: ORG_A, role: 'member' }], weddings: [...wedding] }),
      ORG_A,
      WEDDING_1,
    )
    const outsider = principalForWedding(memberships({ weddings: [...wedding] }), ORG_A, WEDDING_1)

    expect(staff?.kind).toBe('assignedStaff')
    expect(outsider?.kind).toBe('weddingMember')
  })

  it('refuses a user with no standing at all', () => {
    expect(principalForWedding(memberships(), ORG_A, WEDDING_1)).toBeNull()
  })

  /**
   * Being staff at org A says nothing about a wedding in org B. The caller supplies the
   * org, so this is the case where a wrong or guessed `orgId` reaches the function --
   * and the answer has to come from the membership rows, not from the argument.
   */
  it('does not carry standing in one org across to another', () => {
    const m = memberships({ orgs: [{ orgId: ORG_A, role: 'member' }] })
    expect(principalForWedding(m, ORG_B, WEDDING_1)).toBeNull()
  })
})

/**
 * The property that ties this module to `withTenant`: every principal it can produce
 * must be one `assertScoped` accepts.
 *
 * Both halves matter. An `assignedStaff` or `weddingMember` without a weddingId is the
 * leak; an `orgStaff` WITH one silently narrows an owner to a single wedding. The two
 * guards live in different files and could drift apart, so this asserts across the whole
 * cross-product rather than trusting that they agree.
 */
describe('every principal produced satisfies assertScoped', () => {
  const ORG_ROLES = [undefined, 'owner', 'admin', 'member'] as const
  const WEDDING_ROLES = [undefined, 'couple', 'editor'] as const

  for (const orgRole of ORG_ROLES) {
    for (const weddingRole of WEDDING_ROLES) {
      it(`org=${orgRole ?? 'none'} wedding=${weddingRole ?? 'none'}`, () => {
        const m = memberships({
          orgs: orgRole ? [{ orgId: ORG_A, role: orgRole }] : [],
          weddings: weddingRole ? [{ weddingId: WEDDING_1, role: weddingRole }] : [],
        })

        for (const p of [principalForOrg(m, ORG_A), principalForWedding(m, ORG_A, WEDDING_1)]) {
          if (p) expect(() => assertScoped(p)).not.toThrow()
        }
      })
    }
  }
})

describe('landingOrgId', () => {
  it('is null when the user is staff nowhere', () => {
    expect(landingOrgId(memberships())).toBeNull()
    expect(
      landingOrgId(memberships({ weddings: [{ weddingId: WEDDING_1, role: 'couple' }] })),
    ).toBeNull()
  })

  it('prefers owner over admin over member', () => {
    const m = memberships({
      orgs: [
        { orgId: ORG_B, role: 'member' },
        { orgId: ORG_A, role: 'admin' },
        { orgId: 'cccccccc-0000-0000-0000-00000000000c', role: 'owner' },
      ],
    })
    expect(landingOrgId(m)).toBe('cccccccc-0000-0000-0000-00000000000c')
  })

  /**
   * Two orgs at the same role must not land somewhere that depends on row order. The
   * assertion runs both input orders, because sorting on role alone would pass one of
   * them by luck.
   */
  it('is stable when two orgs carry the same role', () => {
    const forward = memberships({
      orgs: [
        { orgId: ORG_A, role: 'owner' },
        { orgId: ORG_B, role: 'owner' },
      ],
    })
    const reversed = memberships({
      orgs: [
        { orgId: ORG_B, role: 'owner' },
        { orgId: ORG_A, role: 'owner' },
      ],
    })
    expect(landingOrgId(forward)).toBe(ORG_A)
    expect(landingOrgId(reversed)).toBe(ORG_A)
  })

  /** `landingOrgId` sorts a copy; the caller's rows are shared with everything else. */
  it('does not reorder the memberships it was given', () => {
    const orgs = [
      { orgId: ORG_B, role: 'member' },
      { orgId: ORG_A, role: 'owner' },
    ] as const
    const m = memberships({ orgs: [...orgs] })
    landingOrgId(m)
    expect(m.orgs).toEqual(orgs)
  })
})
