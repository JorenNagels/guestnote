import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * `/billing` exists only while billing is on, and only for an owner or admin (spec 0005). A 404
 * otherwise -- `notFound` throws as Next's does, so a page that forgot it would render.
 */
const billingMode = vi.fn()
const currentCaller = vi.fn()
const billingProfile = vi.fn()
const listTeam = vi.fn()

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
}))
vi.mock('next-intl/server', () => ({
  getLocale: async () => 'en',
  getTranslations: async () => {
    const t = (key: string, v?: Record<string, unknown>) =>
      v ? `${key} ${JSON.stringify(v)}` : key
    t.raw = (key: string) => key
    return t
  },
}))
vi.mock('@guestnote/db', async (orig) => ({
  ...(await orig<typeof import('@guestnote/db')>()),
  billingProfile: (...a: unknown[]) => billingProfile(...a),
  listTeam: (...a: unknown[]) => listTeam(...a),
  listPendingInvites: async () => [{ id: 'p1' }],
  studioSettings: async () => ({ id: 'o', name: 'Studio Wit', logoKey: null }),
}))
vi.mock('../../../../lib/db.ts', () => ({ getDb: () => ({}) }))
vi.mock('../../../../lib/billing-mode.ts', () => ({ billingMode: () => billingMode() }))
vi.mock('../../../../lib/principal.ts', () => ({
  currentCaller: () => currentCaller(),
  currentSession: async () => ({ email: 'ilse@wit.be' }),
}))
vi.mock('../../../../lib/trial.ts', async () => {
  const pure = await import('../../../../lib/trial-state.ts')
  return { trialState: pure.trialState }
})
vi.mock('./actions.ts', () => ({
  openPortalAction: vi.fn(),
  saveInvoiceDetailsAction: vi.fn(),
  startCheckoutAction: vi.fn(),
}))

const { default: BillingPage } = await import('./page.tsx')

const ORG = '019a0000-0000-7000-8000-00000000000a'
const as = (role: string) => ({
  memberships: { userId: 'u1', orgs: [{ orgId: ORG, role }], weddings: [] },
  orgId: ORG,
})
const page = () => BillingPage({ searchParams: Promise.resolve({}) })

beforeEach(() => {
  vi.clearAllMocks()
  billingMode.mockReturnValue({ on: true, from: '2020-01-01' })
  currentCaller.mockResolvedValue(as('owner'))
  billingProfile.mockResolvedValue({
    orgId: ORG,
    type: 'planner',
    createdAt: new Date('2099-01-01T10:00:00Z'),
    trialEndsAt: null,
    billingCycle: null,
    billingStatus: null,
    billingName: null,
    billingEmail: null,
    vatNumber: null,
    billingCustomerId: null,
    billingSubscriptionId: null,
  })
  listTeam.mockResolvedValue([
    { userId: 'u1', role: 'owner', name: 'Ilse', email: 'ilse@wit.be' },
    { userId: 'u2', role: 'member', name: 'Jan', email: 'jan@wit.be' },
  ])
})

describe('BillingPage', () => {
  it('is a 404 while billing is off, and reads nothing', async () => {
    billingMode.mockReturnValue({ on: false })
    await expect(page()).rejects.toThrow('NEXT_NOT_FOUND')
    expect(currentCaller).not.toHaveBeenCalled()
  })

  it('is a 404 for a member and with no caller', async () => {
    currentCaller.mockResolvedValue(as('member'))
    await expect(page()).rejects.toThrow('NEXT_NOT_FOUND')
    currentCaller.mockResolvedValue(null)
    await expect(page()).rejects.toThrow('NEXT_NOT_FOUND')
    expect(billingProfile).not.toHaveBeenCalled()
  })

  it.each(['owner', 'admin'])(
    'renders for an %s, with the live seats and the owner named',
    async (role) => {
      currentCaller.mockResolvedValue(as(role))
      render(await page())
      expect(screen.getByRole('heading', { level: 1, name: 'title' })).toBeInTheDocument()
      expect(screen.getByText('plan.baseDetail {"owner":"Ilse"}')).toBeInTheDocument()
      expect(screen.getByText('plan.extra {"count":1}')).toBeInTheDocument()
      expect(screen.getByText('Jan')).toBeInTheDocument()
      expect(screen.getByText('plan.pending {"count":1}')).toBeInTheDocument()
      expect(screen.getByText('invoices.empty')).toBeInTheDocument()
    },
  )
})
