import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The Files and Moodboard Undo (spec 0009 C4): both screens' restore is one thin wrapper over
 * `lib/wedding-files.ts`'s `restoreWeddingFile`, whose own scope and id checks are
 * `lib/wedding-files.test.ts`'s. Pinned here: each wrapper hands on exactly the wedding and the
 * file it was given, returns the answer unchanged, and does nothing when the trial lock throws
 * (which `trial-guard.test.ts` only checks is written first, not that it stops the call).
 */
const restoreWeddingFile = vi.fn()
const removeWeddingFile = vi.fn()
const assertWritable = vi.fn()

vi.mock('../../../../../../lib/principal.ts', () => ({
  currentOrgId: async () => 'org-a',
  currentSession: async () => null,
  currentCaller: async () => null,
}))
vi.mock('../../../../../../lib/trial.ts', () => ({
  assertWritable: (...a: unknown[]) => assertWritable(...a),
}))
vi.mock('../../../../../../lib/wedding-files.ts', () => ({
  restoreWeddingFile: (...a: unknown[]) => restoreWeddingFile(...a),
  removeWeddingFile: (...a: unknown[]) => removeWeddingFile(...a),
}))
// What the moodboard module imports beside the restore, stubbed so loading it touches nothing.
vi.mock('../../../../../../lib/moodboards.ts', () => ({}))
vi.mock('../../../../../../lib/db.ts', () => ({ getDb: () => ({}) }))
vi.mock('next-intl/server', () => ({ getLocale: async () => 'nl' }))

const { restoreFile } = await import('./actions.ts')
const { restoreImage } = await import('../moodboard/actions.ts')

const WEDDING = '11111111-0000-0000-0000-000000000001'
const FILE = '0195f3a2-7b1c-7d2e-8a3b-1c2d3e4f5a6b'

beforeEach(() => {
  vi.clearAllMocks()
  assertWritable.mockResolvedValue(undefined)
  restoreWeddingFile.mockResolvedValue({ ok: true })
})

describe.each([
  ['restoreFile', restoreFile],
  ['restoreImage', restoreImage],
] as const)('%s', (_name, action) => {
  it('restores this wedding and file through the shared restore, and returns its answer', async () => {
    expect(await action(WEDDING, FILE)).toEqual({ ok: true })
    expect(assertWritable).toHaveBeenCalledWith('org-a')
    expect(restoreWeddingFile).toHaveBeenCalledWith(WEDDING, FILE)
    expect(removeWeddingFile).not.toHaveBeenCalled()

    restoreWeddingFile.mockResolvedValue({ ok: false, error: 'notFound' })
    expect(await action(WEDDING, FILE)).toEqual({ ok: false, error: 'notFound' })
  })

  it('restores nothing when the trial lock refuses', async () => {
    assertWritable.mockRejectedValue(new Error('locked'))
    await expect(action(WEDDING, FILE)).rejects.toThrow('locked')
    expect(restoreWeddingFile).not.toHaveBeenCalled()
  })
})
