import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The composition rule, and only that: a bucket when configured, a local directory in
 * development, an error everywhere else. The last one is the assertion this file exists for --
 * "the value you get by forgetting is the safe one" (CLAUDE.md invariant 6).
 */
const env = { filesBucket: undefined as string | undefined, awsRegion: 'eu-central-1' }
vi.mock('../env.ts', () => ({ env }))

const createS3Transport = vi.fn(() => ({ name: 's3', presignPut: vi.fn(), presignGet: vi.fn() }))
vi.mock('@guestnote/storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@guestnote/storage')>()),
  createS3Transport: (...a: unknown[]) => (createS3Transport as (...x: unknown[]) => unknown)(...a),
}))

async function load() {
  vi.resetModules()
  return import('./storage.ts')
}

beforeEach(() => {
  vi.unstubAllEnvs()
  createS3Transport.mockClear()
  env.filesBucket = undefined
})

describe('lib/storage', () => {
  it('uses the bucket when one is configured, whatever NODE_ENV says', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    env.filesBucket = 'guestnote-files'
    const { getDevFiles, getStorage } = await load()
    getStorage()
    expect(createS3Transport).toHaveBeenCalledWith({
      region: 'eu-central-1',
      bucket: 'guestnote-files',
    })
    expect(getDevFiles()).toBeNull()
  })

  it('falls back to the local directory in development', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    const { getDevFiles } = await load()
    expect(getDevFiles()).not.toBeNull()
    expect(createS3Transport).not.toHaveBeenCalled()
  })

  it.each(['production', 'test'])('throws in %s rather than write to local disk', async (mode) => {
    vi.stubEnv('NODE_ENV', mode)
    const { getStorage } = await load()
    expect(() => getStorage()).toThrow(/GUESTNOTE_FILES_BUCKET is not set/)
  })
})
