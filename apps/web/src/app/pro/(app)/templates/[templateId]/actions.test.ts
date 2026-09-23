import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The editor's writes. Mocked: `next/cache`, `next-intl/server`, `lib/principal.ts`, `lib/db.ts`
 * and the repo functions. `templateAccess` stays real -- see `../actions.test.ts` -- because it
 * is what decides a `member` never reaches a template write.
 *
 * `applyTemplateAction` is deliberately NOT gated by `templateAccess`: any staff member may
 * apply, so its own tests check `currentMemberships`/`currentOrgId` only and never `writer`.
 */
const revalidatePath = vi.fn()
const currentMemberships = vi.fn()
const currentOrgId = vi.fn()
const updateTemplate = vi.fn()
const deleteTemplate = vi.fn()
const duplicateTemplate = vi.fn()
const addTemplateItem = vi.fn()
const updateTemplateItem = vi.fn()
const deleteTemplateItem = vi.fn()
const moveTemplateItem = vi.fn()
const applyTemplate = vi.fn()

vi.mock('next/cache', () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }))
vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string) => (key === 'copySuffix' ? ' (kopie)' : key),
}))
vi.mock('../../../../../lib/db.ts', () => ({ getDb: () => ({}) }))
vi.mock('../../../../../lib/principal.ts', () => ({
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
  updateTemplate: (...a: unknown[]) => updateTemplate(...a),
  deleteTemplate: (...a: unknown[]) => deleteTemplate(...a),
  duplicateTemplate: (...a: unknown[]) => duplicateTemplate(...a),
  addTemplateItem: (...a: unknown[]) => addTemplateItem(...a),
  updateTemplateItem: (...a: unknown[]) => updateTemplateItem(...a),
  deleteTemplateItem: (...a: unknown[]) => deleteTemplateItem(...a),
  moveTemplateItem: (...a: unknown[]) => moveTemplateItem(...a),
  applyTemplate: (...a: unknown[]) => applyTemplate(...a),
}))

const {
  addItemAction,
  applyTemplateAction,
  deleteItemAction,
  deleteTemplateAction,
  duplicateTemplateAction,
  moveItemAction,
  updateItemAction,
  updateTemplateAction,
} = await import('./actions.ts')

const ORG = 'aaaaaaaa-0000-0000-0000-00000000000a'
const TEMPLATE = '0195f3a2-7b1c-7d2e-8a3b-1c2d3e4f5a6b'
const ITEM = '0195f3a2-7b1c-7d2e-8a3b-1c2d3e4f5a6c'
const WEDDING = '0195f3a2-7b1c-7d2e-8a3b-1c2d3e4f5a6d'
const TEMPLATE_INPUT = { name: 'Full planning', description: '' }
const ITEM_INPUT = { title: 'Sign it', offsetDays: '180', offsetDirection: 'before' }

function as(role: 'owner' | 'admin' | 'member') {
  currentOrgId.mockResolvedValue(ORG)
  currentMemberships.mockResolvedValue({
    userId: 'u1',
    orgs: [{ orgId: ORG, role }],
    weddings: role === 'member' ? [{ weddingId: WEDDING, role: 'editor' }] : [],
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  updateTemplate.mockResolvedValue({ ok: true, value: null })
  deleteTemplate.mockResolvedValue({ ok: true, value: null })
  duplicateTemplate.mockResolvedValue({ ok: true, value: { id: 'new-id' } })
  addTemplateItem.mockResolvedValue({ ok: true, value: { id: ITEM } })
  updateTemplateItem.mockResolvedValue({ ok: true, value: null })
  deleteTemplateItem.mockResolvedValue({ ok: true, value: null })
  moveTemplateItem.mockResolvedValue({ ok: true, value: null })
  applyTemplate.mockResolvedValue({ ok: true, value: { count: 2 } })
  as('owner')
})

describe('a malformed id is refused before any query', () => {
  it('on every writer action', async () => {
    expect(await updateTemplateAction('nope', TEMPLATE_INPUT)).toEqual({
      ok: false,
      error: 'forbidden',
    })
    expect(await deleteTemplateAction('nope')).toEqual({ ok: false, error: 'forbidden' })
    expect(await duplicateTemplateAction('nope')).toEqual({ ok: false, error: 'forbidden' })
    expect(await addItemAction('nope', ITEM_INPUT)).toEqual({ ok: false, error: 'forbidden' })
    expect(await updateItemAction(TEMPLATE, 'nope', ITEM_INPUT)).toEqual({
      ok: false,
      error: 'forbidden',
    })
    expect(await deleteItemAction(TEMPLATE, 'nope')).toEqual({ ok: false, error: 'forbidden' })
    expect(await moveItemAction(TEMPLATE, 'nope', 'up')).toEqual({ ok: false, error: 'forbidden' })
    expect(updateTemplate).not.toHaveBeenCalled()
  })

  it('and on apply, as notFound rather than a database throw', async () => {
    expect(await applyTemplateAction('nope', WEDDING)).toEqual({ ok: false, error: 'notFound' })
    expect(await applyTemplateAction(TEMPLATE, 'nope')).toEqual({ ok: false, error: 'notFound' })
    expect(applyTemplate).not.toHaveBeenCalled()
  })
})

describe('writes are owner and admin only', () => {
  it('refuses a member on every write, without a query', async () => {
    as('member')
    expect(await updateTemplateAction(TEMPLATE, TEMPLATE_INPUT)).toEqual({
      ok: false,
      error: 'forbidden',
    })
    expect(await deleteTemplateAction(TEMPLATE)).toEqual({ ok: false, error: 'forbidden' })
    expect(await duplicateTemplateAction(TEMPLATE)).toEqual({ ok: false, error: 'forbidden' })
    expect(await addItemAction(TEMPLATE, ITEM_INPUT)).toEqual({ ok: false, error: 'forbidden' })
    expect(await updateItemAction(TEMPLATE, ITEM, ITEM_INPUT)).toEqual({
      ok: false,
      error: 'forbidden',
    })
    expect(await deleteItemAction(TEMPLATE, ITEM)).toEqual({ ok: false, error: 'forbidden' })
    expect(await moveItemAction(TEMPLATE, ITEM, 'up')).toEqual({ ok: false, error: 'forbidden' })
    expect(updateTemplate).not.toHaveBeenCalled()
    expect(addTemplateItem).not.toHaveBeenCalled()
  })

  it('but lets a member apply -- applying is a task write, not a template write', async () => {
    as('member')
    expect(await applyTemplateAction(TEMPLATE, WEDDING)).toEqual({ ok: true, count: 2 })
    expect(applyTemplate).toHaveBeenCalled()
  })
})

it('validates input before the repo for the write actions', async () => {
  expect(await updateTemplateAction(TEMPLATE, { name: '' })).toEqual({ ok: false, error: 'name' })
  expect(await addItemAction(TEMPLATE, { ...ITEM_INPUT, title: '' })).toEqual({
    ok: false,
    error: 'title',
  })
  expect(await updateItemAction(TEMPLATE, ITEM, { ...ITEM_INPUT, offsetDays: '-1' })).toEqual({
    ok: false,
    error: 'offset',
  })
  expect(updateTemplate).not.toHaveBeenCalled()
  expect(addTemplateItem).not.toHaveBeenCalled()
  expect(updateTemplateItem).not.toHaveBeenCalled()
})

it('refuses a malformed move direction without a query', async () => {
  expect(await moveItemAction(TEMPLATE, ITEM, 'sideways')).toEqual({
    ok: false,
    error: 'notFound',
  })
  expect(moveTemplateItem).not.toHaveBeenCalled()
})

it('revalidates the template list on a successful write, and not on a refusal', async () => {
  expect(await updateTemplateAction(TEMPLATE, TEMPLATE_INPUT)).toEqual({ ok: true })
  expect(revalidatePath).toHaveBeenCalledWith('/pro/templates', 'layout')
  revalidatePath.mockClear()
  updateTemplate.mockResolvedValue({ ok: false, reason: 'notFound' })
  expect(await updateTemplateAction(TEMPLATE, TEMPLATE_INPUT)).toEqual({
    ok: false,
    error: 'notFound',
  })
  expect(revalidatePath).not.toHaveBeenCalled()
})

it('duplicates using the translated copy suffix, and returns the new id', async () => {
  expect(await duplicateTemplateAction(TEMPLATE)).toEqual({ ok: true, id: 'new-id' })
  expect(duplicateTemplate).toHaveBeenCalledWith({}, expect.anything(), ORG, TEMPLATE, ' (kopie)')
})

it('applies and revalidates the wedding tree, naming the count the repo returned', async () => {
  expect(await applyTemplateAction(TEMPLATE, WEDDING)).toEqual({ ok: true, count: 2 })
  expect(applyTemplate).toHaveBeenCalledWith({}, expect.anything(), ORG, TEMPLATE, WEDDING)
  expect(revalidatePath).toHaveBeenCalledWith('/pro/weddings/[id]', 'layout')
})

it('relays an apply refusal without revalidating', async () => {
  applyTemplate.mockResolvedValue({ ok: false, reason: 'empty' })
  expect(await applyTemplateAction(TEMPLATE, WEDDING)).toEqual({ ok: false, error: 'empty' })
  expect(revalidatePath).not.toHaveBeenCalled()
})
