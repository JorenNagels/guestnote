import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * `createWeddingAction`. The seams that leave the process are mocked; what is asserted is the
 * order of its own decisions: who may create, then whether the input is valid, then the write,
 * then where it lands. Each `not.toHaveBeenCalled` is a claim about what did NOT run.
 */
const createWedding = vi.fn()
const currentMemberships = vi.fn()
const currentOrgId = vi.fn()
const revalidatePath = vi.fn()
const redirect = vi.fn((to: string) => {
  // The real one throws to unwind; a mock that returns would let code after it run.
  throw new Error(`REDIRECT ${to}`)
})

vi.mock('@guestnote/db', () => ({ createWedding: (...a: unknown[]) => createWedding(...a) }))
vi.mock('../../../../../lib/db.ts', () => ({ getDb: () => ({}) }))
vi.mock('../../../../../lib/principal.ts', () => ({
  currentMemberships: () => currentMemberships(),
  currentOrgId: () => currentOrgId(),
}))
vi.mock('next/cache', () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }))
vi.mock('next/navigation', () => ({ redirect: (to: string) => redirect(to) }))

const { createWeddingAction } = await import('./actions.ts')

const ORG = 'org-a'
const as = (role: 'owner' | 'admin' | 'member') => ({
  userId: 'u1',
  orgs: [{ orgId: ORG, role }],
  weddings: [],
})
const form = (entries: Record<string, string>) => {
  const fd = new FormData()
  for (const [k, v] of Object.entries(entries)) fd.set(k, v)
  return fd
}

beforeEach(() => {
  vi.clearAllMocks()
  currentMemberships.mockResolvedValue(as('owner'))
  currentOrgId.mockResolvedValue(ORG)
  createWedding.mockResolvedValue({ ok: true, value: { id: 'w-new' } })
})

describe('createWeddingAction', () => {
  it.each(['owner', 'admin'] as const)(
    'lets an %s create, and lands on the overview',
    async (role) => {
      currentMemberships.mockResolvedValue(as(role))
      await expect(
        createWeddingAction({}, form({ coupleDisplayName: 'Marie & Thomas' })),
      ).rejects.toThrow('REDIRECT /weddings/w-new')
      expect(revalidatePath).toHaveBeenCalledWith('/pro', 'layout')
    },
  )

  it('refuses a member before it parses or writes anything', async () => {
    currentMemberships.mockResolvedValue(as('member'))
    const state = await createWeddingAction({}, form({ coupleDisplayName: 'Marie' }))
    expect(state).toEqual({ form: 'forbidden' })
    expect(createWedding).not.toHaveBeenCalled()
  })

  it('refuses someone with no organisation, and someone signed out', async () => {
    currentOrgId.mockResolvedValue(null)
    expect(await createWeddingAction({}, form({ coupleDisplayName: 'Marie' }))).toEqual({
      form: 'forbidden',
    })
    currentMemberships.mockResolvedValue(null)
    currentOrgId.mockResolvedValue(ORG)
    expect(await createWeddingAction({}, form({ coupleDisplayName: 'Marie' }))).toEqual({
      form: 'forbidden',
    })
    expect(createWedding).not.toHaveBeenCalled()
  })

  it('does not trust the organisation in the cookie: a role in another org is no role here', async () => {
    currentMemberships.mockResolvedValue({
      userId: 'u1',
      orgs: [{ orgId: 'other-org', role: 'owner' }],
      weddings: [],
    })
    expect(await createWeddingAction({}, form({ coupleDisplayName: 'Marie' }))).toEqual({
      form: 'forbidden',
    })
  })

  it('returns field errors with the posted values, and writes nothing', async () => {
    const state = await createWeddingAction(
      {},
      form({ coupleDisplayName: 'Marie', weddingDate: '2027-13-01', color: '#zzz' }),
    )
    expect(state.errors).toEqual({ weddingDate: 'invalidDate', color: 'invalidColor' })
    expect(state.values).toMatchObject({ coupleDisplayName: 'Marie', weddingDate: '2027-13-01' })
    expect(createWedding).not.toHaveBeenCalled()
  })

  it('stores the colour upper case and derives the slug from the name', async () => {
    await expect(
      createWeddingAction({}, form({ coupleDisplayName: 'Marie & Thomas', color: '#a94f4a' })),
    ).rejects.toThrow('REDIRECT')
    expect(createWedding.mock.calls[0]?.[3]).toMatchObject({
      coupleDisplayName: 'Marie & Thomas',
      color: '#A94F4A',
      slugBase: 'marie-en-thomas',
      status: 'draft',
    })
  })

  it('says it failed when the repo gives nothing back, and does not redirect', async () => {
    createWedding.mockResolvedValue({ ok: false, reason: 'notFound' })
    const state = await createWeddingAction({}, form({ coupleDisplayName: 'Marie' }))
    expect(state.form).toBe('failed')
    expect(redirect).not.toHaveBeenCalled()
  })
})
