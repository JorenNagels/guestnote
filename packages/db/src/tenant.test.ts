import { describe, expect, it } from 'vitest'
import { assertScoped, type Principal, TenantScopeError } from './tenant.ts'

/**
 * The guard, tested without a database, so it runs on every save rather than only when
 * a Postgres is up.
 *
 * The type in tenant.ts already makes the dangerous shape unconstructable -- there is
 * no inhabitant of `Principal` carrying an orgId without a weddingId unless it is
 * org-wide staff. These tests cast through `as unknown as Principal` precisely because
 * that is the only way the bad shape can arrive in practice: from JSON, from a stale
 * session, from a refactor that widened a type somewhere upstream.
 */

const good = {
  orgStaff: { kind: 'orgStaff', userId: 'u1', orgId: 'o1', role: 'owner' },
  assignedStaff: {
    kind: 'assignedStaff',
    userId: 'u1',
    orgId: 'o1',
    weddingId: 'w1',
    role: 'member',
  },
  couple: { kind: 'weddingMember', userId: 'u2', orgId: 'o1', weddingId: 'w1', role: 'couple' },
  editor: { kind: 'weddingMember', userId: 'u3', orgId: 'o1', weddingId: 'w1', role: 'editor' },
} satisfies Record<string, Principal>

describe('assertScoped accepts every legitimate principal', () => {
  it.each(Object.entries(good))('%s', (_name, p) => {
    expect(() => assertScoped(p)).not.toThrow()
  })
})

describe('the trap: a principal with no org_members row must carry a weddingId', () => {
  /**
   * research/07-auth-and-tenancy.md section 3. isolation.test.ts proves the SQL-layer
   * consequence -- an unpinned couple reads both of the organisation's weddings -- so
   * this is the thing standing between that and production.
   *
   * It must THROW, not return zero rows. Returning empty would be indistinguishable
   * from a legitimately empty result, and a mis-scoped call would look successful.
   */
  it.each(['weddingMember', 'assignedStaff'] as const)('a %s without weddingId throws', (kind) => {
    const forged = { kind, userId: 'u2', orgId: 'o1', role: 'couple' } as unknown as Principal
    expect(() => assertScoped(forged)).toThrow(TenantScopeError)
    expect(() => assertScoped(forged)).toThrow(/weddingId is mandatory/)
  })

  it('an empty-string weddingId is treated as absent, not as a value', () => {
    // '' would survive a naive `'weddingId' in p` check and then be set as a GUC,
    // where nullif(..., '') turns it back into NULL -- i.e. org-wide scope. The
    // dangerous case, arriving by the least suspicious route.
    const forged = {
      kind: 'weddingMember',
      userId: 'u2',
      orgId: 'o1',
      weddingId: '',
      role: 'couple',
    } as unknown as Principal
    expect(() => assertScoped(forged)).toThrow(/weddingId is mandatory/)
  })
})

describe('assertScoped rejects incomplete principals', () => {
  it.each([
    ['no kind', { userId: 'u1', orgId: 'o1', role: 'owner' }],
    ['no userId', { kind: 'orgStaff', orgId: 'o1', role: 'owner' }],
    ['no orgId', { kind: 'orgStaff', userId: 'u1', role: 'owner' }],
    ['no role', { kind: 'orgStaff', userId: 'u1', orgId: 'o1' }],
    ['empty orgId', { kind: 'orgStaff', userId: 'u1', orgId: '', role: 'owner' }],
  ])('%s', (_name, forged) => {
    expect(() => assertScoped(forged as unknown as Principal)).toThrow(TenantScopeError)
  })
})

describe('orgStaff must not carry a weddingId', () => {
  it('throws rather than silently narrowing an owner to one wedding', () => {
    // Not a leak -- the opposite. But it surfaces later as "the dashboard is
    // mysteriously empty for the account that should see everything", which is a much
    // worse afternoon than an exception at the call site.
    const p = {
      kind: 'orgStaff',
      userId: 'u1',
      orgId: 'o1',
      weddingId: 'w1',
      role: 'owner',
    } as unknown as Principal
    expect(() => assertScoped(p)).toThrow(/must not carry a weddingId/)
  })
})
