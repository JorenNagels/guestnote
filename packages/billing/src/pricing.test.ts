import { describe, expect, it } from 'vitest'
import { createNoopProvider } from './noop.ts'
import { quote } from './pricing.ts'

describe('quote', () => {
  it('charges the base alone for the owner, plus 21% VAT', () => {
    expect(quote(1, 'monthly')).toEqual({
      cycle: 'monthly',
      seats: 1,
      extraSeats: 0,
      baseCents: 4900,
      seatCents: 1900,
      extraCents: 0,
      subtotalCents: 4900,
      vatPercent: 21,
      vatCents: 1029,
      totalCents: 5929,
    })
  })

  it('adds one seat price per planner beyond the owner', () => {
    const q = quote(3, 'monthly')
    expect(q.extraSeats).toBe(2)
    expect(q.extraCents).toBe(3800)
    expect(q.subtotalCents).toBe(8700)
  })

  it('makes a year ten months, on both lines', () => {
    const q = quote(2, 'yearly')
    expect(q.baseCents).toBe(49_000)
    expect(q.seatCents).toBe(19_000)
    expect(q.subtotalCents).toBe(68_000)
  })

  it('drops VAT when a VAT number is given, and not for a blank one', () => {
    expect(quote(1, 'monthly', 'BE0123456789').vatCents).toBe(0)
    expect(quote(1, 'monthly', 'BE0123456789').totalCents).toBe(4900)
    expect(quote(1, 'monthly', '   ').vatPercent).toBe(21)
  })

  it('rounds VAT once on the subtotal, half up', () => {
    // 4900 + 1900 = 6800 * 21% = 1428 exactly; 4900 + 3*1900 = 10600 * 21% = 2226.
    expect(quote(2, 'monthly').vatCents).toBe(1428)
    expect(quote(4, 'monthly').vatCents).toBe(2226)
  })

  it('never quotes fewer than the owner', () => {
    expect(quote(0, 'monthly').seats).toBe(1)
    expect(quote(Number.NaN, 'monthly').seats).toBe(1)
  })
})

describe('the no-op provider', () => {
  it('answers unavailable instead of pretending a checkout happened', async () => {
    const p = createNoopProvider()
    expect(
      await p.startCheckout({
        orgId: 'o',
        cycle: 'monthly',
        seats: 1,
        customerId: null,
        billingEmail: null,
        vatNumber: null,
        returnUrl: 'https://app.guestnote.be/billing',
      }),
    ).toEqual({ ok: false, reason: 'unavailable' })
    expect(await p.openPortal({ customerId: null, returnUrl: 'x' })).toEqual({
      ok: false,
      reason: 'unavailable',
    })
    await expect(p.setSeats({ orgId: 'o', seats: 3 })).resolves.toBeUndefined()
    expect(await p.invoices(null)).toEqual([])
  })
})
