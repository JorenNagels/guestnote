import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The Studio page's Server Functions. Each is a POST to its own route (invariant 7), so what is
 * pinned is that each resolves its own caller and refuses without one, hands the resolved
 * caller -- never a client-supplied org -- to the logic, and revalidates the whole dashboard
 * tree only on a change. The logic itself is `lib/studio-logo.test.ts`'s.
 */
const revalidatePath = vi.fn()
const currentCaller = vi.fn()
const startLogoUpload = vi.fn()
const confirmLogo = vi.fn()
const removeLogo = vi.fn()
const renameStudio = vi.fn()

vi.mock('next/cache', () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }))
vi.mock('@guestnote/db', async (orig) => ({
  ...(await orig<typeof import('@guestnote/db')>()),
  renameStudio: (...a: unknown[]) => renameStudio(...a),
}))
vi.mock('../../../../lib/db.ts', () => ({ getDb: () => ({}) }))
vi.mock('../../../../lib/principal.ts', () => ({
  currentCaller: () => currentCaller(),
  // The trial guard's argument. Billing is off in tests, so the guard returns on it unread.
  currentOrgId: async () => null,
}))
vi.mock('../../../../lib/studio-logo.ts', () => ({
  startLogoUpload: (...a: unknown[]) => startLogoUpload(...a),
  confirmLogo: (...a: unknown[]) => confirmLogo(...a),
  removeLogo: (...a: unknown[]) => removeLogo(...a),
}))

const { confirmStudioLogo, removeStudioLogo, renameStudioAction, startStudioLogoUpload } =
  await import('./actions.ts')

const ORG = '019a0000-0000-7000-8000-00000000000a'
const CALLER = { memberships: { userId: 'u1', orgs: [], weddings: [] }, orgId: ORG }
const fd = (name: string) => {
  const f = new FormData()
  f.set('name', name)
  return f
}

beforeEach(() => {
  vi.clearAllMocks()
  currentCaller.mockResolvedValue(CALLER)
  startLogoUpload.mockResolvedValue({ ok: true, fileId: 'f', url: 'u', headers: {} })
  confirmLogo.mockResolvedValue({ ok: true })
  removeLogo.mockResolvedValue({ ok: true })
  renameStudio.mockResolvedValue({ ok: true, value: null })
})

describe('without a caller', () => {
  beforeEach(() => currentCaller.mockResolvedValue(null))

  it('refuses every logo function before any logic runs', async () => {
    expect(await startStudioLogoUpload({ mime: 'image/png', sizeBytes: 1 })).toEqual({
      ok: false,
      error: 'forbidden',
    })
    expect(await confirmStudioLogo('f')).toEqual({ ok: false, error: 'forbidden' })
    expect(await removeStudioLogo()).toEqual({ ok: false, error: 'forbidden' })
    expect(startLogoUpload).not.toHaveBeenCalled()
    expect(confirmLogo).not.toHaveBeenCalled()
    expect(removeLogo).not.toHaveBeenCalled()
  })

  it('refuses a rename without writing', async () => {
    expect(await renameStudioAction({}, fd('Studio Zwart'))).toMatchObject({ error: 'failed' })
    expect(renameStudio).not.toHaveBeenCalled()
  })
})

describe('with a caller', () => {
  it('passes the resolved caller to the logic', async () => {
    await startStudioLogoUpload({ mime: 'image/png', sizeBytes: 1 })
    await confirmStudioLogo('f')
    await removeStudioLogo()
    expect(startLogoUpload).toHaveBeenCalledWith(CALLER, { mime: 'image/png', sizeBytes: 1 })
    expect(confirmLogo).toHaveBeenCalledWith(CALLER, 'f')
    expect(removeLogo).toHaveBeenCalledWith(CALLER)
  })

  it('revalidates the dashboard layout after a confirm or a remove, and not after a refusal', async () => {
    await confirmStudioLogo('f')
    await removeStudioLogo()
    expect(revalidatePath).toHaveBeenCalledTimes(2)
    expect(revalidatePath).toHaveBeenCalledWith('/pro', 'layout')

    revalidatePath.mockClear()
    confirmLogo.mockResolvedValue({ ok: false, error: 'forbidden' })
    removeLogo.mockResolvedValue({ ok: false, error: 'forbidden' })
    await confirmStudioLogo('f')
    await removeStudioLogo()
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})

describe('renameStudioAction', () => {
  it('trims and saves, and revalidates', async () => {
    expect(await renameStudioAction({}, fd('  Studio Zwart '))).toEqual({
      saved: true,
      value: 'Studio Zwart',
    })
    expect(renameStudio).toHaveBeenCalledWith({}, CALLER.memberships, ORG, 'Studio Zwart')
    expect(revalidatePath).toHaveBeenCalledWith('/pro', 'layout')
  })

  it.each([
    ['blank', '   ', 'required'],
    ['over 80 characters', 'x'.repeat(81), 'tooLong'],
  ])('refuses a %s name before resolving anyone', async (_label, name, error) => {
    expect(await renameStudioAction({}, fd(name))).toMatchObject({ error })
    expect(renameStudio).not.toHaveBeenCalled()
  })

  it('answers failed when the repo refuses (a member), and does not revalidate', async () => {
    renameStudio.mockResolvedValue({ ok: false, reason: 'forbidden' })
    expect(await renameStudioAction({}, fd('Studio Zwart'))).toMatchObject({ error: 'failed' })
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})
