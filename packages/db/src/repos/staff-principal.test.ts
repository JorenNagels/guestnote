import { describe, expect, it } from 'vitest'
import type { Memberships } from './memberships.ts'
import { staffPrincipal } from './staff-principal.ts'

/**
 * The one rule every planner-app repo uses to decide who is staff on a wedding. Was five
 * copies under four names (`moneyPrincipal`, `weddingVendorPrincipal`, two private
 * `staffPrincipal`s) until the PR #1 review; the tests came from `vendors.test.ts`.
 */

const ORG_A = 'aaaaaaaa-0000-0000-0000-00000000000a'
const ORG_B = 'bbbbbbbb-0000-0000-0000-00000000000b'
const W1 = '11111111-0000-0000-0000-000000000001'
const W2 = '22222222-0000-0000-0000-000000000002'
const USER = 'dddddddd-0000-0000-0000-0000000000d1'

function m(x: Partial<Omit<Memberships, 'userId'>> = {}): Memberships {
  return { userId: USER, orgs: x.orgs ?? [], weddings: x.weddings ?? [] }
}

describe('staffPrincipal', () => {
  it('gives owner and admin the org-wide principal for any wedding', () => {
    const p = staffPrincipal(m({ orgs: [{ orgId: ORG_A, role: 'admin' }] }), ORG_A, W2)
    expect(p?.kind).toBe('orgStaff')
  })

  it('pins a member to the wedding they are assigned to', () => {
    const mm = m({
      orgs: [{ orgId: ORG_A, role: 'member' }],
      weddings: [{ weddingId: W1, role: 'editor' }],
    })
    expect(staffPrincipal(mm, ORG_A, W1)?.kind).toBe('assignedStaff')
    expect(staffPrincipal(mm, ORG_A, W2)).toBeNull()
  })

  /** No planner-app table is readable by a couple or outside editor; an empty list would lie. */
  it('refuses a couple and an outside editor', () => {
    for (const role of ['couple', 'editor'] as const) {
      expect(staffPrincipal(m({ weddings: [{ weddingId: W1, role }] }), ORG_A, W1)).toBeNull()
    }
  })

  it('refuses another org', () => {
    const mm = m({ orgs: [{ orgId: ORG_A, role: 'owner' }] })
    expect(staffPrincipal(mm, ORG_B, W1)).toBeNull()
  })
})
