import { describe, expect, it } from 'vitest'
import type { Memberships } from './memberships.ts'
import { vendorDirectoryAccess, weddingVendorPrincipal } from './vendors.ts'

/**
 * The two decisions in `vendors.ts` that need no database: who may see the directory and
 * whether they may write it, and who may see one wedding's vendor list. The queries and the
 * policies behind them are `packages/db/test`'s job; what is asserted here is that the
 * application never asks a policy to refuse what it should have refused outright.
 */

const ORG_A = 'aaaaaaaa-0000-0000-0000-00000000000a'
const ORG_B = 'bbbbbbbb-0000-0000-0000-00000000000b'
const W1 = '11111111-0000-0000-0000-000000000001'
const W2 = '22222222-0000-0000-0000-000000000002'
const USER = 'dddddddd-0000-0000-0000-0000000000d1'

function m(x: Partial<Omit<Memberships, 'userId'>> = {}): Memberships {
  return { userId: USER, orgs: x.orgs ?? [], weddings: x.weddings ?? [] }
}

describe('vendorDirectoryAccess', () => {
  it('lets owner and admin read and write, org-wide', () => {
    for (const role of ['owner', 'admin'] as const) {
      const a = vendorDirectoryAccess(m({ orgs: [{ orgId: ORG_A, role }] }), ORG_A)
      expect(a?.canWrite).toBe(true)
      expect(a?.principal).toEqual({ kind: 'orgStaff', userId: USER, orgId: ORG_A, role })
    }
  })

  /** The write flag is what the UI hides its buttons behind and what the actions refuse on. */
  it('lets a member read through an assigned wedding, and never write', () => {
    const a = vendorDirectoryAccess(
      m({
        orgs: [{ orgId: ORG_A, role: 'member' }],
        weddings: [{ weddingId: W1, role: 'editor' }],
      }),
      ORG_A,
    )
    expect(a?.canWrite).toBe(false)
    expect(a?.principal).toEqual({
      kind: 'assignedStaff',
      userId: USER,
      orgId: ORG_A,
      weddingId: W1,
      role: 'member',
    })
  })

  it('gives a member with no assigned wedding nothing to be pinned to', () => {
    expect(vendorDirectoryAccess(m({ orgs: [{ orgId: ORG_A, role: 'member' }] }), ORG_A)).toBeNull()
  })

  it('refuses an org the user is not in, and a couple with no org row', () => {
    expect(vendorDirectoryAccess(m({ orgs: [{ orgId: ORG_A, role: 'owner' }] }), ORG_B)).toBeNull()
    expect(
      vendorDirectoryAccess(m({ weddings: [{ weddingId: W1, role: 'couple' }] }), ORG_A),
    ).toBeNull()
  })
})

describe('weddingVendorPrincipal', () => {
  it('gives owner and admin the org-wide principal for any wedding', () => {
    const p = weddingVendorPrincipal(m({ orgs: [{ orgId: ORG_A, role: 'admin' }] }), ORG_A, W2)
    expect(p?.kind).toBe('orgStaff')
  })

  it('pins a member to the wedding they are assigned to', () => {
    const mm = m({
      orgs: [{ orgId: ORG_A, role: 'member' }],
      weddings: [{ weddingId: W1, role: 'editor' }],
    })
    expect(weddingVendorPrincipal(mm, ORG_A, W1)?.kind).toBe('assignedStaff')
    expect(weddingVendorPrincipal(mm, ORG_A, W2)).toBeNull()
  })

  /** No new table is readable by a couple or outside editor; an empty list would lie. */
  it('refuses a couple and an outside editor', () => {
    for (const role of ['couple', 'editor'] as const) {
      expect(
        weddingVendorPrincipal(m({ weddings: [{ weddingId: W1, role }] }), ORG_A, W1),
      ).toBeNull()
    }
  })

  it('refuses another org', () => {
    const mm = m({ orgs: [{ orgId: ORG_A, role: 'owner' }] })
    expect(weddingVendorPrincipal(mm, ORG_B, W1)).toBeNull()
  })
})
