import { describe, expect, it } from 'vitest'
import {
  budgetTotals,
  centsToInput,
  civilToday,
  cleanText,
  daysBetween,
  formatCents,
  groupByCategory,
  isUuid,
  MAX_CENTS,
  moneyLocale,
  paidInstant,
  parseCents,
  parseCivilDate,
  paymentState,
  paymentTotals,
} from './money.ts'

describe('parseCents', () => {
  it.each([
    ['1234,50', 123_450],
    ['1.234,50', 123_450],
    ['1,234.50', 123_450],
    ['1234.50', 123_450],
    ['1234', 123_400],
    ['1.234', 123_400],
    ['12,5', 1_250],
    ['0,05', 5],
    ['€ 99', 9_900],
  ])('reads %s as %i cents', (input, cents) => {
    expect(parseCents(input)).toBe(cents)
  })

  it.each(['', ' ', '-5', 'abc', '1,2,3', '1.23.4', '12,3456', '1234,567', '1..2', '12,'])(
    'refuses %j',
    (input) => {
      expect(parseCents(input)).toBeNull()
    },
  )

  it('accepts the largest amount Postgres integer holds and refuses one cent more', () => {
    expect(parseCents('21474836,47')).toBe(MAX_CENTS)
    expect(parseCents('21474836,48')).toBeNull()
  })

  it('never lets a huge digit string reach Number', () => {
    expect(parseCents('99999999999999999999')).toBeNull()
  })
})

describe('centsToInput', () => {
  it.each([
    [123_450, 'nl', '1234,50'],
    [123_450, 'en', '1234.50'],
    [5, 'fr', '0,05'],
    [0, 'nl', '0,00'],
  ])('%i in %s is %s', (cents, locale, text) => {
    expect(centsToInput(cents, locale)).toBe(text)
  })

  it('round-trips through parseCents', () => {
    for (const cents of [0, 1, 99, 100, 123_456, MAX_CENTS]) {
      expect(parseCents(centsToInput(cents, 'nl'))).toBe(cents)
      expect(parseCents(centsToInput(cents, 'en'))).toBe(cents)
    }
  })
})

describe('formatting', () => {
  it('maps the wedding locale to a Belgian tag where there is one', () => {
    expect(moneyLocale('nl')).toBe('nl-BE')
    expect(moneyLocale('fr')).toBe('fr-BE')
    expect(moneyLocale('en')).toBe('en-GB')
    expect(moneyLocale('xx')).toBe('nl-BE')
  })

  it('writes euros with two decimals, in the wedding locale', () => {
    expect(formatCents(123_450, 'en').replace(/\s/g, ' ')).toBe('€1,234.50')
    expect(formatCents(123_450, 'nl')).toContain('1.234,50')
    expect(formatCents(1_250, 'nl')).toContain('12,50')
    expect(formatCents(-5_000, 'en')).toContain('50.00')
  })
})

describe('civil dates', () => {
  it('reads today in the wedding zone, not the runtime zone', () => {
    // 23:30 UTC on the 1st is already the 2nd in Brussels (UTC+2 in summer).
    const now = new Date('2027-06-01T23:30:00Z')
    expect(civilToday('Europe/Brussels', now)).toBe('2027-06-02')
    expect(civilToday('UTC', now)).toBe('2027-06-01')
    expect(civilToday('America/Los_Angeles', now)).toBe('2027-06-01')
  })

  it('falls back to Brussels for a zone name that does not exist', () => {
    const now = new Date('2027-06-01T23:30:00Z')
    expect(civilToday('Not/AZone', now)).toBe('2027-06-02')
  })

  it('counts whole days, signed', () => {
    expect(daysBetween('2027-06-01', '2027-06-04')).toBe(3)
    expect(daysBetween('2027-06-04', '2027-06-01')).toBe(-3)
    expect(daysBetween('2027-03-27', '2027-03-29')).toBe(2) // across the spring clock change
  })

  it('accepts real calendar days only', () => {
    expect(parseCivilDate('2027-02-28')).toBe('2027-02-28')
    expect(parseCivilDate('2028-02-29')).toBe('2028-02-29')
    expect(parseCivilDate('2027-02-30')).toBeNull()
    expect(parseCivilDate('2027-13-01')).toBeNull()
    expect(parseCivilDate('27-02-01')).toBeNull()
    expect(parseCivilDate('')).toBeNull()
  })

  it('stores a paid-on date at noon UTC so it reads the same civil day in Brussels', () => {
    const instant = paidInstant('2027-06-01')
    expect(instant.toISOString()).toBe('2027-06-01T12:00:00.000Z')
  })
})

describe('paymentState', () => {
  const today = '2027-06-10'
  it('is paid whenever paid_at is set, however old the due date', () => {
    expect(paymentState({ dueOn: '2020-01-01', paidAt: new Date() }, today)).toBe('paid')
  })
  it('is overdue strictly before today', () => {
    expect(paymentState({ dueOn: '2027-06-09', paidAt: null }, today)).toBe('overdue')
  })
  it('is due, not overdue, on the day itself', () => {
    expect(paymentState({ dueOn: '2027-06-10', paidAt: null }, today)).toBe('due')
    expect(paymentState({ dueOn: '2027-06-11', paidAt: null }, today)).toBe('due')
  })
})

describe('totals', () => {
  const lines = [
    { id: 'a', category: 'Venue', estimateCents: 500_000, actualCents: 520_000 },
    { id: 'b', category: 'Venue', estimateCents: 50_000, actualCents: null },
    { id: 'c', category: 'Flowers', estimateCents: 100_000, actualCents: 60_000 },
  ]

  it('sums estimates and actuals, a missing actual counting as zero', () => {
    expect(budgetTotals(lines)).toEqual({
      allocatedCents: 650_000,
      spentCents: 580_000,
      remainingCents: 70_000,
    })
  })

  it('goes negative when over, and is zero for no lines', () => {
    expect(
      budgetTotals([{ category: 'x', estimateCents: 10, actualCents: 30 }]).remainingCents,
    ).toBe(-20)
    expect(budgetTotals([])).toEqual({ allocatedCents: 0, spentCents: 0, remainingCents: 0 })
  })

  it('groups in entry order and counts only paid payments toward a category', () => {
    const groups = groupByCategory(lines, [
      { budgetLineId: 'a', amountCents: 100_000, paidAt: new Date() },
      { budgetLineId: 'a', amountCents: 400_000, paidAt: null },
      { budgetLineId: 'c', amountCents: 20_000, paidAt: new Date() },
    ])
    expect(groups.map((g) => g.category)).toEqual(['Venue', 'Flowers'])
    expect(groups[0]?.lines).toHaveLength(2)
    expect(groups[0]?.paidCents).toBe(100_000)
    expect(groups[0]?.totals.allocatedCents).toBe(550_000)
    expect(groups[1]?.paidCents).toBe(20_000)
  })

  it('splits payments into paid, outstanding and overdue', () => {
    const t = paymentTotals(
      [
        { dueOn: '2027-06-01', amountCents: 100, paidAt: new Date() },
        { dueOn: '2027-06-01', amountCents: 200, paidAt: null },
        { dueOn: '2027-06-10', amountCents: 400, paidAt: null },
        { dueOn: '2027-07-01', amountCents: 800, paidAt: null },
      ],
      '2027-06-10',
    )
    expect(t).toEqual({
      paidCents: 100,
      outstandingCents: 1_400,
      overdueCents: 200,
      overdueCount: 1,
    })
  })
})

describe('input guards', () => {
  it('recognises uuids', () => {
    expect(isUuid('0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b')).toBe(true)
    expect(isUuid('not-a-uuid')).toBe(false)
    expect(isUuid('')).toBe(false)
  })

  it('trims text and refuses empty or over-long', () => {
    expect(cleanText('  Venue ', 10)).toBe('Venue')
    expect(cleanText('   ', 10)).toBeNull()
    expect(cleanText('12345678901', 10)).toBeNull()
    expect(cleanText('1234567890', 10)).toBe('1234567890')
  })
})
