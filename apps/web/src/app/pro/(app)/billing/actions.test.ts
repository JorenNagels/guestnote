import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The Billing screen's Server Functions re-ask the page's two questions -- billing on, owner or
 * admin -- because each is a POST to its own route (invariant 7). `principalForOrg` is real.
 */
const billingMode = vi.fn()
const currentCaller = vi.fn()
const billingProfile = vi.fn()
const listTeam = vi.fn()
const saveInvoiceDetails = vi.fn()
const startCheckout = vi.fn()

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@guestnote/db', async (orig) => ({
  ...(await orig<typeof import('@guestnote/db')>()),
  billingProfile: (...a: unknown[]) => billingProfile(...a),
  listTeam: (...a: unknown[]) => listTeam(...a),
  saveInvoiceDetails: (...a: unknown[]) => saveInvoiceDetails(...a),
}))
vi.mock('../../../../lib/db.ts', () => ({ getDb: () => ({}) }))
vi.mock('../../../../lib/billing-mode.ts', () => ({ billingMode: () => billingMode() }))
vi.mock('../../../../lib/principal.ts', () => ({ currentCaller: () => currentCaller() }))
vi.mock('../../../../lib/app-url.ts', () => ({
  appBillingUrl: () => 'https://app.guestnote.be/billing',
}))
vi.mock('../../../../lib/billing.ts', async () => {
  const { createNoopProvider } = await import('@guestnote/billing')
  const real = createNoopProvider()
  return {
    getBillingProvider: () => ({
      ...real,
      startCheckout: (...a: unknown[]) => startCheckout(...a),
    }),
  }
})

const { openPortalAction, saveInvoiceDetailsAction, startCheckoutAction } = await import(
  './actions.ts'
)

const ORG = '019a0000-0000-7000-8000-00000000000a'
const as = (role: string) => ({
  memberships: { userId: 'u1', orgs: [{ orgId: ORG, role }], weddings: [] },
  orgId: ORG,
})
const PROFILE = {
  orgId: ORG,
  billingCustomerId: null,
  billingEmail: 'boek@wit.be',
  vatNumber: null,
}
const fd = (o: Record<string, string>) => {
  const f = new FormData()
  for (const [k, v] of Object.entries(o)) f.set(k, v)
  return f
}

beforeEach(() => {
  vi.clearAllMocks()
  billingMode.mockReturnValue({ on: true, from: '2027-01-01' })
  currentCaller.mockResolvedValue(as('owner'))
  billingProfile.mockResolvedValue(PROFILE)
  listTeam.mockResolvedValue([{ userId: 'u1' }, { userId: 'u2' }, { userId: 'u3' }])
  saveInvoiceDetails.mockResolvedValue({ ok: true, value: null })
  startCheckout.mockResolvedValue({ ok: false, reason: 'unavailable' })
})

describe('startCheckoutAction', () => {
  it('sends the live seat count and the cycle, never a client number, and passes the answer on', async () => {
    expect(await startCheckoutAction('yearly')).toEqual({ ok: false, reason: 'unavailable' })
    expect(startCheckout).toHaveBeenCalledWith({
      orgId: ORG,
      cycle: 'yearly',
      seats: 3,
      customerId: null,
      billingEmail: 'boek@wit.be',
      vatNumber: null,
      returnUrl: 'https://app.guestnote.be/billing?checkout=done',
    })
  })

  it('refuses a cycle that is not one of the two words', async () => {
    expect(await startCheckoutAction('weekly')).toEqual({ ok: false, reason: 'failed' })
    expect(startCheckout).not.toHaveBeenCalled()
  })

  it('refuses a member, and anyone while billing is off, before reading anything', async () => {
    currentCaller.mockResolvedValue(as('member'))
    expect(await startCheckoutAction('monthly')).toEqual({ ok: false, reason: 'forbidden' })
    currentCaller.mockResolvedValue(as('admin'))
    billingMode.mockReturnValue({ on: false })
    expect(await startCheckoutAction('monthly')).toEqual({ ok: false, reason: 'forbidden' })
    expect(await openPortalAction()).toEqual({ ok: false, reason: 'forbidden' })
    expect(billingProfile).not.toHaveBeenCalled()
  })
})

describe('saveInvoiceDetailsAction', () => {
  it('normalises the VAT number and saves for an admin', async () => {
    currentCaller.mockResolvedValue(as('admin'))
    const out = await saveInvoiceDetailsAction(
      {},
      fd({
        billingName: ' Studio Wit BV ',
        billingEmail: 'boek@wit.be',
        vatNumber: 'be 0123.456.789',
      }),
    )
    expect(out).toMatchObject({ saved: true })
    expect(saveInvoiceDetails).toHaveBeenCalledWith({}, expect.anything(), ORG, {
      billingName: 'Studio Wit BV',
      billingEmail: 'boek@wit.be',
      vatNumber: 'BE0123456789',
    })
  })

  it('refuses a bad email and a bad VAT number with codes, keeping the values, writing nothing', async () => {
    const out = await saveInvoiceDetailsAction(
      {},
      fd({ billingName: 'x', billingEmail: 'not-an-email', vatNumber: '12' }),
    )
    expect(out.errors).toEqual({ billingEmail: 'invalid', vatNumber: 'invalid' })
    expect(out.values?.billingEmail).toBe('not-an-email')
    expect(saveInvoiceDetails).not.toHaveBeenCalled()
  })

  it('answers failed for a member', async () => {
    currentCaller.mockResolvedValue(as('member'))
    expect(await saveInvoiceDetailsAction({}, fd({ billingName: 'x' }))).toMatchObject({
      form: 'failed',
    })
    expect(saveInvoiceDetails).not.toHaveBeenCalled()
  })
})
