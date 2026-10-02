import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  addWeddingVendor,
  createPayment,
  deleteBudgetLine,
  getWeddingGlance,
  listDuePayments,
  type Memberships,
  removeWeddingVendor,
  resolveMemberships,
  setPaymentPaidAt,
  updateBudgetLine,
  updateWeddingVendor,
  WeddingScope,
} from '../src/repos/index.ts'
import { connect, F, type Harness, reseed, seedExec } from './harness.ts'

/**
 * Spec 0009 C2: the two reads behind "where are we?" -- the overview's money and vendor figures
 * (`getWeddingGlance`) and Today's payments due (`listDuePayments`), through the real policies.
 *
 * The fixture's payments: A1 owes 5 040,00 on 2027-07-24, A2 4 000,00 on 2027-08-07 (both org
 * A), B1 2 000,00 on 2027-08-28 (org B). `memberA` is assigned to A1 only. Every cross-wedding
 * case runs as the OWNER, whose principal is org-wide and so the one RLS alone would let wander.
 */

let h: Harness
let owner: Memberships
let member: Memberships
let couple: Memberships
let otherOrgOwner: Memberships

const A1 = F.weddingA1
const A2 = F.weddingA2
const FAR = '2099-12-31'

beforeAll(async () => {
  h = connect()
  await reseed()
  owner = await resolveMemberships(h.db, F.staffA)
  member = await resolveMemberships(h.db, F.memberA)
  couple = await resolveMemberships(h.db, F.coupleA1)
  otherOrgOwner = await resolveMemberships(h.db, F.staffB)
})

beforeEach(async () => {
  await reseed()
})

afterAll(async () => {
  await h.end()
})

const ids = (rows: readonly { id: string }[]) => rows.map((r) => r.id)

describe('listDuePayments', () => {
  it("gives the owner every wedding's due payments in one list, soonest first", async () => {
    const rows = await listDuePayments(h.db, owner, F.orgA, FAR)
    expect(ids(rows)).toEqual([F.paymentA1, F.paymentA2])
    expect(rows[0]).toMatchObject({
      weddingId: A1,
      weddingName: 'A One',
      lineLabel: 'Dinner',
      vendorName: null,
      dueOn: '2027-07-24',
      amountCents: 504_000,
    })
  })

  // A2's payment falls between A1's two, so neither Postgres' row order nor the order the owner's
  // query met the weddings in can pass for "soonest first".
  it('orders by due date across weddings, not wedding by wedding', async () => {
    await createPayment(WeddingScope.of(h.db, owner, F.orgA, A1), {
      budgetLineId: F.budgetLineA1,
      dueOn: '2027-09-01',
      amountCents: 1_000,
      paidAt: null,
    })
    await createPayment(WeddingScope.of(h.db, owner, F.orgA, A2), {
      budgetLineId: F.budgetLineA2,
      dueOn: '2027-01-01',
      amountCents: 1_000,
      paidAt: null,
    })
    const owned = await listDuePayments(h.db, owner, F.orgA, FAR)
    expect(owned.map((r) => r.dueOn)).toEqual([
      '2027-01-01',
      '2027-07-24',
      '2027-08-07',
      '2027-09-01',
    ])

    // The member path is one transaction per wedding, so it has to sort for itself.
    await seedExec(
      `insert into wedding_members (wedding_id, user_id, role) values ($1, $2, 'editor')`,
      [A2, F.memberA],
    )
    const both = await resolveMemberships(h.db, F.memberA)
    const assigned = await listDuePayments(h.db, both, F.orgA, FAR)
    expect(assigned.map((r) => r.dueOn)).toEqual(owned.map((r) => r.dueOn))
  })

  it('walks only the weddings a member is assigned to', async () => {
    expect(ids(await listDuePayments(h.db, member, F.orgA, FAR))).toEqual([F.paymentA1])
  })

  it("reads nothing of another org's weddings, and nothing for a couple", async () => {
    expect(await listDuePayments(h.db, otherOrgOwner, F.orgA, FAR)).toEqual([])
    // Org B's owner in their own org sees B's payment and none of A's.
    expect(ids(await listDuePayments(h.db, otherOrgOwner, F.orgB, FAR))).toEqual([F.paymentB1])
    // A couple has a wedding membership, and the money tables are staff-only. This does NOT
    // discriminate the repo's `staffPrincipal`: swapping it for `principalForWedding` left the
    // file green (measured 2026-10-02), because the `payments` policy's role list refuses a
    // couple on its own. The policy is load-bearing here and the repo's refusal is the belt.
    expect(await listDuePayments(h.db, couple, F.orgA, FAR)).toEqual([])
  })

  it('stops at `through`, inclusive', async () => {
    expect(ids(await listDuePayments(h.db, owner, F.orgA, '2027-08-06'))).toEqual([F.paymentA1])
    expect(ids(await listDuePayments(h.db, owner, F.orgA, '2027-08-07'))).toEqual([
      F.paymentA1,
      F.paymentA2,
    ])
  })

  // An archived wedding with a payment still open is money still owed (the repo's header).
  it("keeps an archived wedding's open payments", async () => {
    await seedExec(`update weddings set status = 'archived' where id = $1`, [A2])
    expect(ids(await listDuePayments(h.db, owner, F.orgA, FAR))).toEqual([F.paymentA1, F.paymentA2])
  })

  it('leaves out a paid payment', async () => {
    await setPaymentPaidAt(WeddingScope.of(h.db, owner, F.orgA, A1), F.paymentA1, new Date())
    expect(ids(await listDuePayments(h.db, owner, F.orgA, FAR))).toEqual([F.paymentA2])
  })

  it('leaves out the payments of a deleted budget line', async () => {
    await deleteBudgetLine(WeddingScope.of(h.db, owner, F.orgA, A1), F.budgetLineA1)
    expect(ids(await listDuePayments(h.db, owner, F.orgA, FAR))).toEqual([F.paymentA2])
  })

  // Through the seed role: a soft-deleted wedding is not a state the app can write to a payment's
  // wedding and still read back. `beforeEach` reseeds.
  it('leaves out the payments of a deleted wedding', async () => {
    await seedExec('update weddings set deleted_at = now() where id = $1', [A1])
    expect(ids(await listDuePayments(h.db, owner, F.orgA, FAR))).toEqual([F.paymentA2])
  })

  it("names the line's vendor as the payee when there is one", async () => {
    await updateBudgetLine(WeddingScope.of(h.db, owner, F.orgA, A1), F.budgetLineA1, {
      category: 'Catering',
      label: 'Dinner',
      estimateCents: 1_176_000,
      actualCents: null,
      weddingVendorId: F.wedVendorA1,
    })
    const [row] = await listDuePayments(h.db, member, F.orgA, FAR)
    expect(row?.vendorName).toBe('Traiteur A')
  })
})

describe('getWeddingGlance', () => {
  const scope = (m: Memberships = owner, wedding: string = A1) =>
    WeddingScope.of(h.db, m, F.orgA, wedding)

  it("reads one wedding's lines, its next payment and its vendors by status", async () => {
    const glance = await getWeddingGlance(scope())
    expect(glance).toEqual({
      locale: 'nl',
      timezone: 'Europe/Brussels',
      lines: [{ category: 'Catering', estimateCents: 1_176_000, actualCents: null }],
      nextPayment: { dueOn: '2027-07-24', amountCents: 504_000 },
      vendorStatuses: [{ status: 'booked', count: 1 }],
    })
  })

  // The owner is org-wide: without the wedding clause, A2's line and payment would join in.
  it("does not mix in a sibling wedding's money or vendors", async () => {
    const glance = await getWeddingGlance(scope(owner, A2))
    expect(glance?.lines.map((l) => l.estimateCents)).toEqual([900_000])
    expect(glance?.nextPayment).toEqual({ dueOn: '2027-08-07', amountCents: 400_000 })
    expect(glance?.vendorStatuses).toEqual([{ status: 'quoted', count: 1 }])
  })

  it('takes the earliest unpaid payment, and skips a paid one that falls earlier', async () => {
    const pay = (dueOn: string, paidAt: Date | null) =>
      createPayment(scope(), { budgetLineId: F.budgetLineA1, dueOn, amountCents: 1_000, paidAt })
    await pay('2027-01-01', new Date())
    await pay('2027-03-01', null)
    expect((await getWeddingGlance(scope()))?.nextPayment).toEqual({
      dueOn: '2027-03-01',
      amountCents: 1_000,
    })
  })

  it('has no next payment once everything is paid', async () => {
    await setPaymentPaidAt(scope(), F.paymentA1, new Date())
    expect((await getWeddingGlance(scope()))?.nextPayment).toBeNull()
  })

  it("drops a deleted line and that line's payments", async () => {
    await deleteBudgetLine(scope(), F.budgetLineA1)
    const glance = await getWeddingGlance(scope())
    expect(glance?.lines).toEqual([])
    expect(glance?.nextPayment).toBeNull()
  })

  it('counts each status, declined included, and drops a removed vendor', async () => {
    const added = await addWeddingVendor(scope(), F.vendorA2)
    if (!added.ok) throw new Error('fixture: could not link vendorA2')
    await updateWeddingVendor(scope(), added.value.id, { status: 'declined' })
    const statuses = (await getWeddingGlance(scope()))?.vendorStatuses ?? []
    expect([...statuses].sort((a, b) => a.status.localeCompare(b.status))).toEqual([
      { status: 'booked', count: 1 },
      { status: 'declined', count: 1 },
    ])

    await removeWeddingVendor(scope(), F.wedVendorA1)
    expect((await getWeddingGlance(scope()))?.vendorStatuses).toEqual([
      { status: 'declined', count: 1 },
    ])
  })

  it('reads for an assigned member, and is null for everyone else', async () => {
    expect((await getWeddingGlance(scope(member)))?.nextPayment?.amountCents).toBe(504_000)
    expect(await getWeddingGlance(scope(member, A2))).toBeNull()
    expect(await getWeddingGlance(scope(couple))).toBeNull()
    expect(await getWeddingGlance(WeddingScope.of(h.db, otherOrgOwner, F.orgA, A1))).toBeNull()
  })
})
