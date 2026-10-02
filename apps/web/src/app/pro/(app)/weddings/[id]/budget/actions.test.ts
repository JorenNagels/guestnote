import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The budget's remove and its Undo (spec 0009 C4). Mocked: `next/cache`, `lib/principal.ts`,
 * `lib/db.ts` and the two repo functions; `currentWeddingScope` stays real over them. What the
 * repo does with the scope -- the window-free restore, the wedding parent read -- is
 * `packages/db/test/restore-repos.test.ts`'s against a real Postgres. Pinned here: no scope and
 * a malformed id never reach the repo, the scope is this wedding's, a refusal is one word, and
 * only a success refreshes.
 */
const revalidatePath = vi.fn()
const currentMemberships = vi.fn()
const currentOrgId = vi.fn()
const deleteBudgetLine = vi.fn()
const restoreBudgetLine = vi.fn()

vi.mock('next/cache', () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }))
vi.mock('../../../../../../lib/db.ts', () => ({ getDb: () => ({}) }))
vi.mock('../../../../../../lib/principal.ts', () => ({
  currentMemberships: () => currentMemberships(),
  currentOrgId: () => currentOrgId(),
  // The real `currentCaller`, over the two mocks above.
  currentCaller: async () => {
    const [memberships, orgId] = [await currentMemberships(), await currentOrgId()]
    return memberships && orgId ? { memberships, orgId } : null
  },
}))
vi.mock('@guestnote/db', async (orig) => ({
  ...(await orig<typeof import('@guestnote/db')>()),
  deleteBudgetLine: (...a: unknown[]) => deleteBudgetLine(...a),
  restoreBudgetLine: (...a: unknown[]) => restoreBudgetLine(...a),
}))

const { removeBudgetLine, restoreLine } = await import('./actions.ts')

const ORG = 'aaaaaaaa-0000-0000-0000-00000000000a'
const WEDDING = '11111111-0000-0000-0000-000000000001'
const LINE = '0195f3a2-7b1c-7d2e-8a3b-1c2d3e4f5a6b'

beforeEach(() => {
  vi.clearAllMocks()
  currentOrgId.mockResolvedValue(ORG)
  currentMemberships.mockResolvedValue({
    userId: 'u1',
    orgs: [{ orgId: ORG, role: 'owner' }],
    weddings: [],
  })
  deleteBudgetLine.mockResolvedValue({ ok: true, value: null })
  restoreBudgetLine.mockResolvedValue({ ok: true, value: { id: LINE } })
})

describe.each([
  ['removeBudgetLine', removeBudgetLine, deleteBudgetLine],
  ['restoreLine', restoreLine, restoreBudgetLine],
] as const)('%s', (_name, action, repo) => {
  it('answers notFound with no session, no org or a malformed wedding id, before the repo', async () => {
    currentMemberships.mockResolvedValue(null)
    expect(await action(WEDDING, LINE)).toEqual({ ok: false, error: 'notFound' })
    currentMemberships.mockResolvedValue({ userId: 'u1', orgs: [], weddings: [] })
    currentOrgId.mockResolvedValue(null)
    expect(await action(WEDDING, LINE)).toEqual({ ok: false, error: 'notFound' })
    currentOrgId.mockResolvedValue(ORG)
    expect(await action('nope', LINE)).toEqual({ ok: false, error: 'notFound' })
    expect(repo).not.toHaveBeenCalled()
  })

  it('refuses a malformed line id before the repo', async () => {
    expect(await action(WEDDING, 'x')).toEqual({ ok: false, error: 'notFound' })
    expect(repo).not.toHaveBeenCalled()
  })

  it("acts on this wedding's line and refreshes both money screens", async () => {
    expect(await action(WEDDING, LINE)).toEqual({ ok: true })
    expect(repo).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: ORG, weddingId: WEDDING }),
      LINE,
    )
    expect(revalidatePath).toHaveBeenCalledWith('/pro/weddings/[id]/budget', 'page')
    expect(revalidatePath).toHaveBeenCalledWith('/pro/weddings/[id]/payments', 'page')
  })

  it('answers a refusal as notFound, and refreshes nothing for it', async () => {
    for (const reason of ['lineNotFound', 'notFound'] as const) {
      repo.mockResolvedValue({ ok: false, reason })
      expect(await action(WEDDING, LINE)).toEqual({ ok: false, error: 'notFound' })
    }
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})
