import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * `assertWritable`, the one guard every staff write under `app/pro/(app)` calls first. The
 * dates are `trial-state.test.ts`'s; this pins what the guard does with them.
 */
const billingMode = vi.fn()
const trialFacts = vi.fn()
const currentMemberships = vi.fn()

vi.mock('./billing-mode.ts', () => ({ billingMode: () => billingMode() }))
vi.mock('./db.ts', () => ({ getDb: () => ({}) }))
vi.mock('./principal.ts', () => ({ currentMemberships: () => currentMemberships() }))
vi.mock('@guestnote/db', () => ({ trialFacts: (...a: unknown[]) => trialFacts(...a) }))

const { assertWritable, TrialEndedError } = await import('./trial.ts')

const M = { userId: 'u1', orgs: [{ orgId: 'o1', role: 'member' }], weddings: [] }
const LONG_AGO = { type: 'planner', createdAt: new Date('2020-01-01T10:00:00Z'), trialEndsAt: null }

beforeEach(() => {
  vi.clearAllMocks()
  billingMode.mockReturnValue({ on: true, from: '2020-01-01' })
  currentMemberships.mockResolvedValue(M)
  trialFacts.mockResolvedValue({ ...LONG_AGO, billingStatus: null })
})

describe('assertWritable', () => {
  it('refuses a staff write once the trial has ended, with the named error', async () => {
    await expect(assertWritable('o1')).rejects.toBeInstanceOf(TrialEndedError)
    expect(trialFacts).toHaveBeenCalledWith({}, M, 'o1')
  })

  it('lets everything through while billing is off, without a query', async () => {
    billingMode.mockReturnValue({ on: false })
    await expect(assertWritable('o1')).resolves.toBeUndefined()
    expect(trialFacts).not.toHaveBeenCalled()
    expect(currentMemberships).not.toHaveBeenCalled()
  })

  it('lets a paying studio write', async () => {
    trialFacts.mockResolvedValue({ ...LONG_AGO, billingStatus: 'active' })
    await expect(assertWritable('o1')).resolves.toBeUndefined()
  })

  it('lets a running trial write', async () => {
    trialFacts.mockResolvedValue({ ...LONG_AGO, trialEndsAt: new Date('2999-01-01T00:00:00Z') })
    await expect(assertWritable('o1')).resolves.toBeUndefined()
  })

  it('has nothing to lock with no org or no staff row, and leaves refusing to the action', async () => {
    await expect(assertWritable(null)).resolves.toBeUndefined()
    trialFacts.mockResolvedValue(null)
    await expect(assertWritable('o1')).resolves.toBeUndefined()
  })
})
