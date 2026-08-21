import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The dashboard's preference writes, and the one of them that is a security boundary.
 *
 * ## What is mocked, and why only this much
 *
 * `next/headers`, `next/cache` and `lib/principal.ts`. Nothing else. These tests are about
 * what the ACTION does with an answer -- refuse an org the user is not a member of, put a
 * validated value in the cookie rather than the raw one -- and not about how memberships
 * are resolved, which is `packages/db/test/repos.test.ts`'s job against a real Postgres.
 * The same separation `components/auth/actions.test.ts` argues for, for the same reason:
 * mocking `principal.ts` is what keeps this in the `unit` project instead of dragging a
 * database into it.
 *
 * `revalidatePath` is mocked because calling it outside a request scope throws. It is also
 * asserted, because "the sidebar still shows the old org after switching" is the bug it
 * exists to prevent, and nothing else in the tree would catch that.
 */
const cookieStore = { set: vi.fn(), get: vi.fn() }
const revalidatePath = vi.fn()
const currentMemberships = vi.fn()

vi.mock('next/headers', () => ({
  cookies: async () => cookieStore,
  headers: async () => new Headers(),
}))

vi.mock('next/cache', () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }))

vi.mock('../../../lib/principal.ts', () => ({
  currentMemberships: () => currentMemberships(),
}))

vi.mock('../../../lib/auth.ts', () => ({ getAuth: () => ({ signOut: vi.fn() }) }))

const { setDensity, setNavCollapsed, setTheme, switchOrg } = await import('./actions.ts')

const ORG_A = 'aaaaaaaa-0000-0000-0000-00000000000a'
const ORG_B = 'bbbbbbbb-0000-0000-0000-00000000000b'

beforeEach(() => {
  vi.clearAllMocks()
  currentMemberships.mockResolvedValue({
    userId: 'u1',
    orgs: [{ orgId: ORG_A, role: 'owner' }],
    weddings: [],
  })
})

describe('switchOrg', () => {
  it('writes the org the user is actually a member of', async () => {
    await switchOrg(ORG_A)
    expect(cookieStore.set).toHaveBeenCalledWith('gn_org', ORG_A, expect.anything())
  })

  /**
   * The assertion this function exists for. The org id comes from the client, so it is a
   * request and not a fact -- `currentMemberships()` is the fact.
   *
   * Be precise about what a failure here would MEAN, because it is not a breach:
   * `lib/principal.ts` re-checks the cookie against memberships on every read, so a
   * forged value is discarded there too and the org was never a permission in the first
   * place -- `principalForOrg` re-derives the role for every query. What this prevents is
   * a planner being parked in a dead org id they cannot get out of by clicking.
   */
  it('refuses an org the user has no membership in', async () => {
    await switchOrg(ORG_B)
    expect(cookieStore.set).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('refuses when there is no session at all', async () => {
    currentMemberships.mockResolvedValue(null)
    await switchOrg(ORG_A)
    expect(cookieStore.set).not.toHaveBeenCalled()
  })

  /**
   * A wedding assignment is not an organisation membership. `wedding_members` is how a
   * couple and an outside editor get in, and `research/07-auth-and-tenancy.md` section 3
   * gives the failure mode for confusing the two: an org-wide scope for someone who should
   * see one wedding. The check reads `.orgs` and must keep reading only `.orgs`.
   */
  it('does not accept an org reached only through a wedding membership', async () => {
    currentMemberships.mockResolvedValue({
      userId: 'u1',
      orgs: [],
      weddings: [{ weddingId: 'w1', role: 'couple' }],
    })
    await switchOrg(ORG_A)
    expect(cookieStore.set).not.toHaveBeenCalled()
  })

  it('revalidates the layout, not just the page, because the shell shows the org', async () => {
    await switchOrg(ORG_A)
    expect(revalidatePath).toHaveBeenCalledWith('/pro', 'layout')
  })
})

/**
 * The three writers take typed unions, not `string`. **These tests deliberately go around
 * that**, and the cast below is the assertion, not a convenience.
 *
 * A Server Function is a POST: its argument arrives as whatever the request body said, and
 * TypeScript has no presence there. So the signature stops a caller-side mistake and the
 * runtime `parse*` stops a wire-side one, and only the second is testable from here. Typing
 * the table as `WireWriter` says that out loud -- delete the runtime parse and these go red
 * even though the code still typechecks, which is exactly the gap worth covering.
 */
type WireWriter = (value: string) => Promise<void>

describe('the preference writers', () => {
  it.each<[string, WireWriter, string, string, string]>([
    ['setTheme', setTheme as WireWriter, 'gn_theme', 'dark', 'dark'],
    ['setDensity', setDensity as WireWriter, 'gn_density', 'compact', 'compact'],
    ['setNavCollapsed', setNavCollapsed as WireWriter, 'gn_nav', 'collapsed', 'collapsed'],
  ])('%s stores a recognised value as itself', async (_name, fn, cookie, input, stored) => {
    await fn(input)
    expect(cookieStore.set).toHaveBeenCalledWith(cookie, stored, expect.anything())
  })

  /**
   * The property worth having: an unrecognised value is normalised **on the way in**, so
   * the cookie can never hold something the root layout has to defend against. Storing the
   * raw string and coercing on read would pass a naive test and leave attacker-controlled
   * text sitting in a cookie that `<html className>` interpolates.
   */
  it.each<[string, WireWriter, string, string]>([
    ['setTheme', setTheme as WireWriter, 'gn_theme', 'light'],
    ['setDensity', setDensity as WireWriter, 'gn_density', 'comfortable'],
    ['setNavCollapsed', setNavCollapsed as WireWriter, 'gn_nav', 'expanded'],
  ])('%s normalises rubbish to the default before writing', async (_n, fn, cookie, fallback) => {
    await fn('"><script>alert(1)</script>')
    expect(cookieStore.set).toHaveBeenCalledWith(cookie, fallback, expect.anything())
  })

  it('all three revalidate the dashboard tree, since all three land on <html>', async () => {
    await setTheme('dark')
    await setDensity('compact')
    await setNavCollapsed('collapsed')
    expect(revalidatePath).toHaveBeenCalledTimes(3)
    expect(revalidatePath).toHaveBeenLastCalledWith('/pro', 'layout')
  })
})
