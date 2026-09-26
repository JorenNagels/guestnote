import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * `/studio` is owner and admin only, and a member gets a 404 rather than a notice (spec 0005:
 * a member has no link to it). `principalForOrg` is the real one; `notFound` throws as Next's
 * does, so a page that forgot to call it would render instead.
 */
const currentCaller = vi.fn()
const studioSettings = vi.fn()
const logoUrl = vi.fn()

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
}))
vi.mock('next-intl/server', () => ({ getTranslations: async () => (key: string) => key }))
vi.mock('@guestnote/db', async (orig) => ({
  ...(await orig<typeof import('@guestnote/db')>()),
  studioSettings: (...a: unknown[]) => studioSettings(...a),
}))
vi.mock('../../../../lib/db.ts', () => ({ getDb: () => ({}) }))
vi.mock('../../../../lib/principal.ts', () => ({ currentCaller: () => currentCaller() }))
vi.mock('../../../../lib/studio-logo.ts', () => ({
  logoUrl: (...a: unknown[]) => logoUrl(...a),
}))
vi.mock('./actions.ts', () => ({
  confirmStudioLogo: vi.fn(),
  removeStudioLogo: vi.fn(),
  renameStudioAction: vi.fn(),
  startStudioLogoUpload: vi.fn(),
}))

const { default: StudioPage } = await import('./page.tsx')

const ORG = '019a0000-0000-7000-8000-00000000000a'
const as = (role: string) => ({
  memberships: { userId: 'u1', orgs: [{ orgId: ORG, role }], weddings: [] },
  orgId: ORG,
})

beforeEach(() => {
  vi.clearAllMocks()
  studioSettings.mockResolvedValue({ id: ORG, name: 'Studio Wit', logoKey: `${ORG}/brand/x` })
  logoUrl.mockResolvedValue('https://get.example/logo')
})

describe('StudioPage', () => {
  it('is a 404 for a member, and reads nothing', async () => {
    currentCaller.mockResolvedValue(as('member'))
    await expect(StudioPage()).rejects.toThrow('NEXT_NOT_FOUND')
    expect(studioSettings).not.toHaveBeenCalled()
  })

  it('is a 404 with no caller', async () => {
    currentCaller.mockResolvedValue(null)
    await expect(StudioPage()).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it.each(['owner', 'admin'])(
    'renders for an %s, with the logo signed for their org',
    async (role) => {
      currentCaller.mockResolvedValue(as(role))
      const html = JSON.stringify(await StudioPage())
      expect(logoUrl).toHaveBeenCalledWith(ORG, `${ORG}/brand/x`)
      expect(html).toContain('https://get.example/logo')
      expect(html).toContain('Studio Wit')
    },
  )
})
