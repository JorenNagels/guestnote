import { beforeEach, expect, it, vi } from 'vitest'

/**
 * `createTemplateAction`. Mocked: `next/cache`, `lib/principal.ts`, `lib/db.ts` and
 * `createTemplate` itself. `templateAccess` stays real, the same choice
 * `vendors/actions.test.ts` makes for `vendorDirectoryAccess` -- it is the thing that decides
 * whether a `member` reaches a write, so it is the thing this test must not fake past.
 */
const revalidatePath = vi.fn()
const currentMemberships = vi.fn()
const currentOrgId = vi.fn()
const createTemplate = vi.fn()

vi.mock('next/cache', () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }))
vi.mock('../../../../lib/db.ts', () => ({ getDb: () => ({}) }))
vi.mock('../../../../lib/principal.ts', () => ({
  currentMemberships: () => currentMemberships(),
  currentOrgId: () => currentOrgId(),
}))
vi.mock('@guestnote/db', async (orig) => ({
  ...(await orig<typeof import('@guestnote/db')>()),
  createTemplate: (...a: unknown[]) => createTemplate(...a),
}))

const { createTemplateAction } = await import('./actions.ts')

const ORG = 'aaaaaaaa-0000-0000-0000-00000000000a'
const TEMPLATE = '0195f3a2-7b1c-7d2e-8a3b-1c2d3e4f5a6b'
const INPUT = { name: 'Full planning', description: '' }

function as(role: 'owner' | 'admin' | 'member') {
  currentOrgId.mockResolvedValue(ORG)
  currentMemberships.mockResolvedValue({
    userId: 'u1',
    orgs: [{ orgId: ORG, role }],
    weddings: role === 'member' ? [{ weddingId: 'w1', role: 'editor' }] : [],
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  createTemplate.mockResolvedValue({ ok: true, value: { id: TEMPLATE } })
  as('owner')
})

it('refuses invalid input before the repo is reached', async () => {
  expect(await createTemplateAction({ name: '' })).toEqual({ ok: false, error: 'name' })
  expect(createTemplate).not.toHaveBeenCalled()
})

it('refuses a member, and no session or no org, before the repo is reached', async () => {
  as('member')
  expect(await createTemplateAction(INPUT)).toEqual({ ok: false, error: 'forbidden' })
  currentMemberships.mockResolvedValue(null)
  expect(await createTemplateAction(INPUT)).toEqual({ ok: false, error: 'forbidden' })
  as('owner')
  currentOrgId.mockResolvedValue(null)
  expect(await createTemplateAction(INPUT)).toEqual({ ok: false, error: 'forbidden' })
  expect(createTemplate).not.toHaveBeenCalled()
})

it('creates for owner and admin, and revalidates the list', async () => {
  for (const role of ['owner', 'admin'] as const) {
    as(role)
    createTemplate.mockClear()
    revalidatePath.mockClear()
    expect(await createTemplateAction(INPUT)).toEqual({ ok: true, id: TEMPLATE })
    expect(createTemplate).toHaveBeenCalledWith({}, expect.anything(), ORG, {
      name: 'Full planning',
      description: null,
    })
    expect(revalidatePath).toHaveBeenCalledWith('/pro/templates', 'layout')
  }
})

it('relays a repo refusal and does not revalidate on it', async () => {
  createTemplate.mockResolvedValue({ ok: false, reason: 'forbidden' })
  expect(await createTemplateAction(INPUT)).toEqual({ ok: false, error: 'forbidden' })
  expect(revalidatePath).not.toHaveBeenCalled()
})
