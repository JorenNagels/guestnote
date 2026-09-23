import { and, asc, eq, isNull } from 'drizzle-orm'
import type { Db } from '../client.ts'
import { newId } from '../id.ts'
import { budgetLines, payments } from '../schema/money.ts'
import { vendors, weddingVendors } from '../schema/vendors.ts'
import { weddings } from '../schema/weddings.ts'
import type { TenantDb } from '../tenant.ts'
import { withTenant } from '../tenant.ts'
import type { Memberships } from './memberships.ts'
import { staffPrincipal } from './staff-principal.ts'

/**
 * Slice S4 of docs/specs/0003-planner-app-screens.md: the budget's lines.
 *
 * Money is integer cents and totals are not stored (spec 0003). This file returns rows; the sums
 * are `apps/web/src/lib/money.ts`'s, computed on every read.
 *
 * ## Who may reach this
 *
 * Owner, admin, and a `member` assigned to the wedding. The `budget_lines` and `payments`
 * policies exclude `couple` and `editor` (spec 0003: no new table is readable by a couple), and
 * `staffPrincipal` refuses that shape here as well, so a `weddingMember` gets `null` -- a 404 --
 * instead of an empty budget that would say the wedding exists.
 */

export type MoneyContext = {
  readonly coupleDisplayName: string
  /** IANA name. Decides "today" for overdue; free text in the schema, so callers must tolerate junk. */
  readonly timezone: string
  /** `nl`, `en` or `fr`. Decides how amounts and dates are written on these screens. */
  readonly locale: string
}

export type BudgetLine = {
  readonly id: string
  readonly category: string
  readonly label: string
  readonly estimateCents: number
  readonly actualCents: number | null
  readonly weddingVendorId: string | null
  /** The vendor's directory name, or null when the line names none. */
  readonly vendorName: string | null
}

/** A payment as the budget needs it: enough to draw a paid bar, nothing to display a row. */
export type BudgetPayment = {
  readonly budgetLineId: string
  readonly amountCents: number
  readonly paidAt: Date | null
}

/** One entry in the vendor picker. `id` is the `wedding_vendors` id, which is what a line stores. */
export type VendorOption = {
  readonly id: string
  readonly name: string
}

export type BudgetData = {
  readonly wedding: MoneyContext
  readonly lines: BudgetLine[]
  readonly payments: BudgetPayment[]
  readonly vendors: VendorOption[]
}

export type BudgetLineInput = {
  readonly category: string
  readonly label: string
  readonly estimateCents: number
  readonly actualCents: number | null
  readonly weddingVendorId: string | null
}

/**
 * Why a write did not happen. Three parents can be missing and they are told apart so the
 * caller can say which field to fix; all of them collapse to the same 404-style answer for a
 * wedding the caller may not see (`not-found`).
 */
export type MoneyFailure = 'not-found' | 'line-not-found' | 'vendor-not-found' | 'payment-not-found'

export type MoneyResult =
  | { readonly ok: true; readonly id: string }
  | { readonly ok: false; readonly reason: MoneyFailure }

/**
 * The wedding row, read under the principal. This IS the parent read for everything below:
 * an unpinned owner would otherwise write a row whose `wedding_id` names a wedding in another
 * org, because the foreign keys are plain, not composite (spec 0003, measured in the F1 audit).
 */
export async function readMoneyContext(
  tx: TenantDb,
  weddingId: string,
): Promise<MoneyContext | null> {
  const [row] = await tx
    .select({
      coupleDisplayName: weddings.coupleDisplayName,
      timezone: weddings.timezone,
      locale: weddings.localeDefault,
    })
    .from(weddings)
    .where(and(eq(weddings.id, weddingId), isNull(weddings.deletedAt)))
  return row ?? null
}

/** Everything the budget screen draws, or `null` for a 404. One transaction. */
export async function getBudget(
  db: Db,
  m: Memberships,
  orgId: string,
  weddingId: string,
): Promise<BudgetData | null> {
  const principal = staffPrincipal(m, orgId, weddingId)
  if (!principal) return null

  return withTenant(db, principal, async (tx) => {
    const wedding = await readMoneyContext(tx, weddingId)
    if (!wedding) return null

    // Entry order, not alphabetical: categories appear in the order the planner made them, the
    // way a spreadsheet would. `id` breaks ties because it is UUIDv7 and so sorts by creation.
    const lines = await tx
      .select({
        id: budgetLines.id,
        category: budgetLines.category,
        label: budgetLines.label,
        estimateCents: budgetLines.estimateCents,
        actualCents: budgetLines.actualCents,
        weddingVendorId: budgetLines.weddingVendorId,
        vendorName: vendors.name,
      })
      .from(budgetLines)
      .leftJoin(weddingVendors, eq(weddingVendors.id, budgetLines.weddingVendorId))
      .leftJoin(vendors, eq(vendors.id, weddingVendors.vendorId))
      .where(and(eq(budgetLines.weddingId, weddingId), isNull(budgetLines.deletedAt)))
      .orderBy(asc(budgetLines.createdAt), asc(budgetLines.id))

    // Payments of live lines only: a soft-deleted line keeps its payments (nothing is destroyed),
    // so the join is what hides them.
    const paid = await tx
      .select({
        budgetLineId: payments.budgetLineId,
        amountCents: payments.amountCents,
        paidAt: payments.paidAt,
      })
      .from(payments)
      .innerJoin(budgetLines, eq(budgetLines.id, payments.budgetLineId))
      .where(and(eq(payments.weddingId, weddingId), isNull(budgetLines.deletedAt)))

    const options = await tx
      .select({ id: weddingVendors.id, name: vendors.name })
      .from(weddingVendors)
      .innerJoin(vendors, eq(vendors.id, weddingVendors.vendorId))
      .where(
        and(
          eq(weddingVendors.weddingId, weddingId),
          isNull(weddingVendors.deletedAt),
          isNull(vendors.deletedAt),
        ),
      )
      .orderBy(asc(vendors.name))

    return { wedding, lines, payments: paid, vendors: options }
  })
}

/**
 * The vendor parent read. A line may name no vendor; when it names one, that row must be a live
 * `wedding_vendors` row of THIS wedding, or the write is refused before it is attempted.
 */
async function vendorExists(tx: TenantDb, weddingId: string, weddingVendorId: string) {
  const [row] = await tx
    .select({ id: weddingVendors.id })
    .from(weddingVendors)
    .where(
      and(
        eq(weddingVendors.id, weddingVendorId),
        eq(weddingVendors.weddingId, weddingId),
        isNull(weddingVendors.deletedAt),
      ),
    )
  return row !== undefined
}

export async function createBudgetLine(
  db: Db,
  m: Memberships,
  orgId: string,
  weddingId: string,
  input: BudgetLineInput,
): Promise<MoneyResult> {
  const principal = staffPrincipal(m, orgId, weddingId)
  if (!principal) return { ok: false, reason: 'not-found' }

  return withTenant(db, principal, async (tx): Promise<MoneyResult> => {
    if (!(await readMoneyContext(tx, weddingId))) return { ok: false, reason: 'not-found' }
    if (input.weddingVendorId && !(await vendorExists(tx, weddingId, input.weddingVendorId))) {
      return { ok: false, reason: 'vendor-not-found' }
    }
    const id = newId()
    await tx.insert(budgetLines).values({
      id,
      orgId,
      weddingId,
      category: input.category,
      label: input.label,
      estimateCents: input.estimateCents,
      actualCents: input.actualCents,
      weddingVendorId: input.weddingVendorId,
    })
    return { ok: true, id }
  })
}

export async function updateBudgetLine(
  db: Db,
  m: Memberships,
  orgId: string,
  weddingId: string,
  lineId: string,
  input: BudgetLineInput,
): Promise<MoneyResult> {
  const principal = staffPrincipal(m, orgId, weddingId)
  if (!principal) return { ok: false, reason: 'not-found' }

  return withTenant(db, principal, async (tx): Promise<MoneyResult> => {
    if (!(await readMoneyContext(tx, weddingId))) return { ok: false, reason: 'not-found' }
    if (input.weddingVendorId && !(await vendorExists(tx, weddingId, input.weddingVendorId))) {
      return { ok: false, reason: 'vendor-not-found' }
    }
    // `weddingId` is in the where, not just the id: an unpinned owner's principal is org-wide, so
    // RLS alone would let this touch a line of a sibling wedding whose id was guessed.
    const rows = await tx
      .update(budgetLines)
      .set({
        category: input.category,
        label: input.label,
        estimateCents: input.estimateCents,
        actualCents: input.actualCents,
        weddingVendorId: input.weddingVendorId,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(budgetLines.id, lineId),
          eq(budgetLines.weddingId, weddingId),
          isNull(budgetLines.deletedAt),
        ),
      )
      .returning({ id: budgetLines.id })
    return rows[0] ? { ok: true, id: lineId } : { ok: false, reason: 'line-not-found' }
  })
}

/**
 * Soft delete. The line has a `deleted_at` and its payments do not, and the payments are left
 * alone on purpose: both reads join through the line, so they vanish with it and come back if the
 * line is ever restored. Hard-deleting the line would cascade and destroy a paid history.
 */
export async function deleteBudgetLine(
  db: Db,
  m: Memberships,
  orgId: string,
  weddingId: string,
  lineId: string,
): Promise<MoneyResult> {
  const principal = staffPrincipal(m, orgId, weddingId)
  if (!principal) return { ok: false, reason: 'not-found' }

  return withTenant(db, principal, async (tx): Promise<MoneyResult> => {
    const now = new Date()
    const rows = await tx
      .update(budgetLines)
      .set({ deletedAt: now, updatedAt: now })
      .where(
        and(
          eq(budgetLines.id, lineId),
          eq(budgetLines.weddingId, weddingId),
          isNull(budgetLines.deletedAt),
        ),
      )
      .returning({ id: budgetLines.id })
    return rows[0] ? { ok: true, id: lineId } : { ok: false, reason: 'line-not-found' }
  })
}
