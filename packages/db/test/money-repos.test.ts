import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  createBudgetLine,
  createPayment,
  deleteBudgetLine,
  deletePayment,
  getBudget,
  getPayments,
  type Memberships,
  resolveMemberships,
  setPaymentPaidAt,
  updateBudgetLine,
  updatePayment,
} from '../src/repos/index.ts'
import { AS, asPrincipal, connect, F, type Harness, reseed } from './harness.ts'

/**
 * Slice S4: the budget and payment repos, through the real policies.
 *
 * What these can and cannot prove is the same caveat `repos.test.ts` makes: the repo filters too,
 * so several cases would still pass with a wrong policy. `planner-isolation.test.ts` is where the
 * policies stand on their own. What is asserted HERE is the part that only the repo can do -- the
 * parent reads. The foreign keys between the new tables are plain, not composite, so nothing in
 * Postgres stops a row naming another wedding's line or vendor; the repo has to.
 *
 * The owner's principal is org-wide (`app.wedding_id` unset), which is the dangerous shape: RLS
 * admits every wedding in the org, so every cross-wedding case below is run as the OWNER of both.
 */

let h: Harness
let owner: Memberships
let member: Memberships
let couple: Memberships
let otherOrgOwner: Memberships

const A1 = F.weddingA1
const A2 = F.weddingA2

const line = {
  category: 'Music',
  label: 'DJ',
  estimateCents: 180_000,
  actualCents: null,
  weddingVendorId: null,
}

beforeAll(async () => {
  h = connect()
  await reseed()
  owner = await resolveMemberships(h.db, F.staffA)
  member = await resolveMemberships(h.db, F.memberA)
  couple = await resolveMemberships(h.db, F.coupleA1)
  otherOrgOwner = await resolveMemberships(h.db, F.staffB)
})

// Each case may write, and a fixed fixture is what makes the assertions below exact.
beforeEach(async () => {
  await reseed()
})

afterAll(async () => {
  await h.end()
})

describe('getBudget', () => {
  it("reads one wedding's lines, with the wedding's zone and locale", async () => {
    const data = await getBudget(h.db, owner, F.orgA, A1)
    expect(data?.lines.map((l) => l.id)).toEqual([F.budgetLineA1])
    expect(data?.lines[0]?.estimateCents).toBe(1_176_000)
    expect(data?.wedding).toMatchObject({ timezone: 'Europe/Brussels', locale: 'nl' })
    expect(data?.payments).toHaveLength(1)
  })

  it("lists only this wedding's vendors in the picker", async () => {
    const data = await getBudget(h.db, owner, F.orgA, A1)
    expect(data?.vendors.map((v) => v.id)).toEqual([F.wedVendorA1])
  })

  it('is null for a wedding the caller cannot see: another org, unassigned member, couple', async () => {
    expect(await getBudget(h.db, otherOrgOwner, F.orgA, A1)).toBeNull()
    expect(await getBudget(h.db, otherOrgOwner, F.orgB, A1)).toBeNull()
    expect(await getBudget(h.db, member, F.orgA, A2)).toBeNull()
    // A couple is refused by the repo AND by the policy; `staffPrincipal` is the repo's half.
    expect(await getBudget(h.db, couple, F.orgA, A1)).toBeNull()
  })

  it('reads for an assigned member', async () => {
    expect((await getBudget(h.db, member, F.orgA, A1))?.lines).toHaveLength(1)
  })
})

describe('createBudgetLine', () => {
  it('inserts, and the line reads back', async () => {
    const r = await createBudgetLine(h.db, owner, F.orgA, A1, line)
    expect(r.ok).toBe(true)
    const data = await getBudget(h.db, owner, F.orgA, A1)
    expect(data?.lines.map((l) => l.label)).toEqual(['Dinner', 'DJ'])
  })

  it('refuses a vendor that belongs to a sibling wedding', async () => {
    const r = await createBudgetLine(h.db, owner, F.orgA, A1, {
      ...line,
      weddingVendorId: F.wedVendorA2,
    })
    expect(r).toEqual({ ok: false, reason: 'vendor-not-found' })
    expect((await getBudget(h.db, owner, F.orgA, A1))?.lines).toHaveLength(1)
  })

  it("accepts this wedding's vendor, and names it on the line", async () => {
    await createBudgetLine(h.db, owner, F.orgA, A1, { ...line, weddingVendorId: F.wedVendorA1 })
    const data = await getBudget(h.db, owner, F.orgA, A1)
    expect(data?.lines.find((l) => l.label === 'DJ')?.vendorName).toBe('Traiteur A')
  })

  it('writes nothing for a caller with no standing', async () => {
    expect(await createBudgetLine(h.db, couple, F.orgA, A1, line)).toEqual({
      ok: false,
      reason: 'not-found',
    })
    expect(await createBudgetLine(h.db, member, F.orgA, A2, line)).toEqual({
      ok: false,
      reason: 'not-found',
    })
  })
})

describe('updateBudgetLine and deleteBudgetLine', () => {
  it('will not touch a line of a sibling wedding, even for the org-wide owner', async () => {
    const r = await updateBudgetLine(h.db, owner, F.orgA, A1, F.budgetLineA2, line)
    expect(r).toEqual({ ok: false, reason: 'line-not-found' })
    expect((await getBudget(h.db, owner, F.orgA, A2))?.lines[0]?.label).toBe('Dinner')

    const d = await deleteBudgetLine(h.db, owner, F.orgA, A1, F.budgetLineA2)
    expect(d).toEqual({ ok: false, reason: 'line-not-found' })
    expect((await getBudget(h.db, owner, F.orgA, A2))?.lines).toHaveLength(1)
  })

  it('updates in place, and can clear the actual', async () => {
    await updateBudgetLine(h.db, owner, F.orgA, A1, F.budgetLineA1, {
      ...line,
      actualCents: 1_200_000,
    })
    await updateBudgetLine(h.db, owner, F.orgA, A1, F.budgetLineA1, { ...line, actualCents: null })
    const l = (await getBudget(h.db, owner, F.orgA, A1))?.lines[0]
    expect(l).toMatchObject({ label: 'DJ', estimateCents: 180_000, actualCents: null })
  })

  it('hides a deleted line and its payments from both screens, and keeps the payment row', async () => {
    expect((await deleteBudgetLine(h.db, owner, F.orgA, A1, F.budgetLineA1)).ok).toBe(true)
    expect((await getBudget(h.db, owner, F.orgA, A1))?.lines).toEqual([])
    expect((await getBudget(h.db, owner, F.orgA, A1))?.payments).toEqual([])
    expect((await getPayments(h.db, owner, F.orgA, A1))?.payments).toEqual([])
    // Not destroyed: the row is still there for a restore.
    const rows = await asPrincipal(h, AS.staffA, 'select 1 from payments where id = $1', [
      F.paymentA1,
    ])
    expect(rows).toHaveLength(1)
  })
})

describe('payments', () => {
  const pay = {
    budgetLineId: F.budgetLineA1,
    dueOn: '2027-01-15',
    amountCents: 100_000,
    paidAt: null,
  }

  it('lists unpaid before paid, each by due date', async () => {
    await createPayment(h.db, owner, F.orgA, A1, {
      ...pay,
      dueOn: '2027-01-01',
      paidAt: new Date(),
    })
    await createPayment(h.db, owner, F.orgA, A1, pay)
    const data = await getPayments(h.db, owner, F.orgA, A1)
    expect(data?.payments.map((p) => [p.dueOn, p.paidAt !== null])).toEqual([
      ['2027-01-15', false],
      ['2027-07-24', false],
      ['2027-01-01', true],
    ])
    expect(data?.payments[0]).toMatchObject({ lineLabel: 'Dinner', category: 'Catering' })
    expect(data?.lines.map((l) => l.id)).toEqual([F.budgetLineA1])
  })

  it('refuses a line of a sibling wedding on create and on update', async () => {
    const c = await createPayment(h.db, owner, F.orgA, A1, { ...pay, budgetLineId: F.budgetLineA2 })
    expect(c).toEqual({ ok: false, reason: 'line-not-found' })
    const u = await updatePayment(h.db, owner, F.orgA, A1, F.paymentA1, {
      ...pay,
      budgetLineId: F.budgetLineA2,
    })
    expect(u).toEqual({ ok: false, reason: 'line-not-found' })
    expect((await getPayments(h.db, owner, F.orgA, A1))?.payments).toHaveLength(1)
  })

  it('will not mark, edit or delete a payment of a sibling wedding', async () => {
    expect(await setPaymentPaidAt(h.db, owner, F.orgA, A1, F.paymentA2, new Date())).toEqual({
      ok: false,
      reason: 'payment-not-found',
    })
    expect((await updatePayment(h.db, owner, F.orgA, A1, F.paymentA2, pay)).ok).toBe(false)
    expect((await deletePayment(h.db, owner, F.orgA, A1, F.paymentA2)).ok).toBe(false)
    expect((await getPayments(h.db, owner, F.orgA, A2))?.payments[0]?.paidAt).toBeNull()
    expect((await getPayments(h.db, owner, F.orgA, A2))?.payments).toHaveLength(1)
  })

  it('marks paid, then unpaid, then deletes', async () => {
    const at = new Date('2027-01-08T09:00:00Z')
    await setPaymentPaidAt(h.db, owner, F.orgA, A1, F.paymentA1, at)
    expect((await getPayments(h.db, owner, F.orgA, A1))?.payments[0]?.paidAt).toEqual(at)
    await setPaymentPaidAt(h.db, owner, F.orgA, A1, F.paymentA1, null)
    expect((await getPayments(h.db, owner, F.orgA, A1))?.payments[0]?.paidAt).toBeNull()
    expect((await deletePayment(h.db, owner, F.orgA, A1, F.paymentA1)).ok).toBe(true)
    expect((await getPayments(h.db, owner, F.orgA, A1))?.payments).toEqual([])
  })

  it('is null or refused for a couple and for an unassigned member', async () => {
    expect(await getPayments(h.db, couple, F.orgA, A1)).toBeNull()
    expect(await getPayments(h.db, member, F.orgA, A2)).toBeNull()
    expect((await createPayment(h.db, member, F.orgA, A2, pay)).ok).toBe(false)
  })
})
