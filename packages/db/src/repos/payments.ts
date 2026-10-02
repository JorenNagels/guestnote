import { and, asc, eq, isNull, lte, sql } from 'drizzle-orm'
import type { Db } from '../client.ts'
import { newId } from '../id.ts'
import { budgetLines, payments } from '../schema/money.ts'
import { vendors, weddingVendors } from '../schema/vendors.ts'
import { weddings } from '../schema/weddings.ts'
import type { TenantDb } from '../tenant.ts'
import { withTenant } from '../tenant.ts'
import { type MoneyContext, type MoneyResult, readMoneyContext } from './budget.ts'
import { type Memberships, principalForOrg } from './memberships.ts'
import { fail, ok } from './result.ts'
import type { WeddingScope } from './scope.ts'
import { staffPrincipal } from './staff-principal.ts'

/**
 * Slice S4 of docs/specs/0003-planner-app-screens.md: the payment schedule.
 *
 * Who may reach it, and why a couple cannot, is `staff-principal.ts`'s `staffPrincipal`. A payment is a
 * dated amount against a budget line; `paid_at` null means not yet paid. Whether one is overdue
 * is NOT decided here: it needs today's date in the wedding's timezone, and `apps/web/src/lib/
 * money.ts` computes it from the real clock at render, so a stored answer could only be stale.
 */

export type PaymentRow = {
  readonly id: string
  readonly budgetLineId: string
  readonly lineLabel: string
  readonly category: string
  /** The vendor on the line, when it has one. The payee, as far as this schema knows one. */
  readonly vendorName: string | null
  /** `date`, `YYYY-MM-DD`. A civil date, not an instant. */
  readonly dueOn: string
  readonly amountCents: number
  readonly paidAt: Date | null
}

/** One line for the "which line is this against" picker. */
export type PaymentLineOption = {
  readonly id: string
  readonly label: string
  readonly category: string
}

export type PaymentsData = {
  readonly wedding: MoneyContext
  readonly payments: PaymentRow[]
  readonly lines: PaymentLineOption[]
}

export type PaymentInput = {
  readonly budgetLineId: string
  /** `YYYY-MM-DD`. The caller has validated the shape; Postgres rejects an impossible date. */
  readonly dueOn: string
  readonly amountCents: number
  readonly paidAt: Date | null
}

/** Payments in due-date order, and the lines to pick from. `null` is a 404. One transaction. */
export async function getPayments(scope: WeddingScope): Promise<PaymentsData | null> {
  const { db, weddingId } = scope
  const principal = scope.principal
  if (!principal) return null

  return withTenant(db, principal, async (tx) => {
    const wedding = await readMoneyContext(tx, weddingId)
    if (!wedding) return null

    const rows = await tx
      .select({
        id: payments.id,
        budgetLineId: payments.budgetLineId,
        lineLabel: budgetLines.label,
        category: budgetLines.category,
        vendorName: vendors.name,
        dueOn: payments.dueOn,
        amountCents: payments.amountCents,
        paidAt: payments.paidAt,
      })
      .from(payments)
      .innerJoin(budgetLines, eq(budgetLines.id, payments.budgetLineId))
      .leftJoin(weddingVendors, eq(weddingVendors.id, budgetLines.weddingVendorId))
      .leftJoin(vendors, eq(vendors.id, weddingVendors.vendorId))
      .where(and(eq(payments.weddingId, weddingId), isNull(budgetLines.deletedAt)))
      // Unpaid first, then by date: the top of the list is what the planner has to chase, and a
      // paid row two years ago should not push a due one off the screen. `id` makes the order
      // total, and UUIDv7 makes it the entry order among payments on one day.
      .orderBy(sql`(${payments.paidAt} is not null)`, asc(payments.dueOn), asc(payments.id))

    const lines = await tx
      .select({ id: budgetLines.id, label: budgetLines.label, category: budgetLines.category })
      .from(budgetLines)
      .where(and(eq(budgetLines.weddingId, weddingId), isNull(budgetLines.deletedAt)))
      .orderBy(asc(budgetLines.createdAt), asc(budgetLines.id))

    return { wedding, payments: rows, lines }
  })
}

/** An unpaid payment and the wedding it is owed on, for the cross-wedding Today screen. */
export type DuePaymentRow = {
  readonly id: string
  readonly weddingId: string
  readonly weddingName: string
  /** `#RRGGBB` or null: the wedding's dot, never text (spec 0003). */
  readonly weddingColor: string | null
  readonly lineLabel: string
  readonly vendorName: string | null
  /** `YYYY-MM-DD`, a civil date. */
  readonly dueOn: string
  readonly amountCents: number
}

/**
 * Unpaid payments due on or before `through` (`YYYY-MM-DD`), across every wedding this user may
 * see, soonest first: Today's Betalingen section (spec 0009 C2). The overdue ones are simply the
 * earliest; there is no lower bound, so a payment three months late is still on the list.
 *
 * `through` is an argument, not "today + 7" worked out here, for the reason the header gives:
 * what today is depends on a clock and a zone, and the page reads both once and hands them down.
 *
 * Two shapes, exactly as `listAssignedTasks` and for its reason:
 *
 *   owner / admin  ONE transaction, org-wide.
 *   member         ONE TRANSACTION PER ASSIGNED WEDDING, awaited in turn: `assignedStaff` must
 *                  pin `app.wedding_id`, and N transactions at once on a pool sized for ordinary
 *                  request concurrency is how one page starves the rest (`repos/weddings.ts`).
 *
 * `staffPrincipal` and not `principalForWedding` on the member path: a couple or an outside editor
 * has a wedding membership too, and the money tables are staff-only (`budget.ts`'s header). Not
 * filtered on the wedding's status, as `listAssignedTasks` is not: an archived wedding with a
 * payment still open is money still owed, and hiding it is the failure, not showing it.
 */
export async function listDuePayments(
  db: Db,
  m: Memberships,
  orgId: string,
  through: string,
): Promise<DuePaymentRow[]> {
  const due = and(
    isNull(payments.paidAt),
    lte(payments.dueOn, through),
    isNull(budgetLines.deletedAt),
    isNull(weddings.deletedAt),
  )
  const select = (tx: TenantDb) =>
    tx
      .select({
        id: payments.id,
        weddingId: payments.weddingId,
        weddingName: weddings.coupleDisplayName,
        weddingColor: weddings.color,
        lineLabel: budgetLines.label,
        vendorName: vendors.name,
        dueOn: payments.dueOn,
        amountCents: payments.amountCents,
      })
      .from(payments)
      // Through the live line, as every money read: a soft-deleted line keeps its payments, and
      // this join is what hides them.
      .innerJoin(budgetLines, eq(budgetLines.id, payments.budgetLineId))
      .innerJoin(weddings, eq(weddings.id, payments.weddingId))
      .leftJoin(weddingVendors, eq(weddingVendors.id, budgetLines.weddingVendorId))
      .leftJoin(vendors, eq(vendors.id, weddingVendors.vendorId))

  const orgWide = principalForOrg(m, orgId)
  if (orgWide) {
    return withTenant(db, orgWide, (tx) =>
      select(tx).where(due).orderBy(asc(payments.dueOn), asc(payments.id)),
    )
  }

  const out: DuePaymentRow[] = []
  for (const assignment of m.weddings) {
    const principal = staffPrincipal(m, orgId, assignment.weddingId)
    if (!principal) continue
    // The `weddingId` clause is redundant under the pin -- deleting it left every test green,
    // measured 2026-10-02 -- and stays for the reason `listWeddings` gives for its own.
    const rows = await withTenant(db, principal, (tx) =>
      select(tx).where(and(due, eq(payments.weddingId, assignment.weddingId))),
    )
    out.push(...rows)
  }
  // The org-wide path sorts in Postgres; this one cannot, so it sorts here, in the same order.
  return out.sort((a, b) => a.dueOn.localeCompare(b.dueOn) || a.id.localeCompare(b.id))
}

/**
 * The line parent read. A payment must name a live line of THIS wedding; RLS alone does not stop
 * a row pointing at another wedding's line, because the foreign key is plain (spec 0003).
 */
async function lineExists(tx: TenantDb, weddingId: string, lineId: string) {
  const [row] = await tx
    .select({ id: budgetLines.id })
    .from(budgetLines)
    .where(
      and(
        eq(budgetLines.id, lineId),
        eq(budgetLines.weddingId, weddingId),
        isNull(budgetLines.deletedAt),
      ),
    )
  return row !== undefined
}

export async function createPayment(
  scope: WeddingScope,
  input: PaymentInput,
): Promise<MoneyResult> {
  const { db, orgId, weddingId } = scope
  const principal = scope.principal
  if (!principal) return fail('notFound')

  return withTenant(db, principal, async (tx): Promise<MoneyResult> => {
    if (!(await readMoneyContext(tx, weddingId))) return fail('notFound')
    if (!(await lineExists(tx, weddingId, input.budgetLineId))) {
      return fail('lineNotFound')
    }
    const id = newId()
    await tx.insert(payments).values({
      id,
      orgId,
      weddingId,
      budgetLineId: input.budgetLineId,
      dueOn: input.dueOn,
      amountCents: input.amountCents,
      paidAt: input.paidAt,
    })
    return ok({ id })
  })
}

export async function updatePayment(
  scope: WeddingScope,
  paymentId: string,
  input: PaymentInput,
): Promise<MoneyResult> {
  const { db, weddingId } = scope
  const principal = scope.principal
  if (!principal) return fail('notFound')

  return withTenant(db, principal, async (tx): Promise<MoneyResult> => {
    if (!(await readMoneyContext(tx, weddingId))) return fail('notFound')
    if (!(await lineExists(tx, weddingId, input.budgetLineId))) {
      return fail('lineNotFound')
    }
    const rows = await tx
      .update(payments)
      .set({
        budgetLineId: input.budgetLineId,
        dueOn: input.dueOn,
        amountCents: input.amountCents,
        paidAt: input.paidAt,
        updatedAt: new Date(),
      })
      .where(and(eq(payments.id, paymentId), eq(payments.weddingId, weddingId)))
      .returning({ id: payments.id })
    return rows[0] ? ok({ id: paymentId }) : fail('paymentNotFound')
  })
}

/** The quick toggle: `paidAt` is an instant to mark paid, or `null` to mark unpaid. */
export async function setPaymentPaidAt(
  scope: WeddingScope,
  paymentId: string,
  paidAt: Date | null,
): Promise<MoneyResult> {
  const { db, weddingId } = scope
  const principal = scope.principal
  if (!principal) return fail('notFound')

  return withTenant(db, principal, async (tx): Promise<MoneyResult> => {
    const rows = await tx
      .update(payments)
      .set({ paidAt, updatedAt: new Date() })
      .where(and(eq(payments.id, paymentId), eq(payments.weddingId, weddingId)))
      .returning({ id: payments.id })
    return rows[0] ? ok({ id: paymentId }) : fail('paymentNotFound')
  })
}

/** Hard delete: a payment is a schedule entry, and "the history of what was owed" is the line's. */
export async function deletePayment(scope: WeddingScope, paymentId: string): Promise<MoneyResult> {
  const { db, weddingId } = scope
  const principal = scope.principal
  if (!principal) return fail('notFound')

  return withTenant(db, principal, async (tx): Promise<MoneyResult> => {
    const rows = await tx
      .delete(payments)
      .where(and(eq(payments.id, paymentId), eq(payments.weddingId, weddingId)))
      .returning({ id: payments.id })
    return rows[0] ? ok({ id: paymentId }) : fail('paymentNotFound')
  })
}
