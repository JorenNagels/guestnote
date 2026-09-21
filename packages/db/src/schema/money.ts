import { sql } from 'drizzle-orm'
import { check, date, index, integer, pgTable, text, uuid } from 'drizzle-orm/pg-core'
import { createdAt, deletedAt, orgId, tstz, updatedAt, weddingId } from './_shared.ts'
import { weddingVendors } from './vendors.ts'
import { weddings } from './weddings.ts'

/**
 * Money is integer cents, EUR only (spec 0003; research/09-planner-app.md). Never a float,
 * never `numeric`: a sum of cents is exact, and a currency column is a decision nobody has
 * made. `integer` holds 21 million euros, which is a budget line and not a wedding.
 *
 * The CHECKs forbid a negative amount rather than model one. A refund or a discount is not
 * a shape this product has, and a sign error in a form is far more likely than either.
 * Lifting a CHECK is an ordinary `ALTER`.
 *
 * Totals are computed, not stored (spec 0003, Still open).
 */
export const budgetLines = pgTable(
  'budget_lines',
  {
    id: uuid('id').primaryKey(),
    orgId: orgId(),
    weddingId: weddingId().references(() => weddings.id, { onDelete: 'cascade' }),
    category: text('category').notNull(),
    label: text('label').notNull(),
    estimateCents: integer('estimate_cents').notNull(),
    actualCents: integer('actual_cents'),
    weddingVendorId: uuid('wedding_vendor_id').references(() => weddingVendors.id, {
      onDelete: 'set null',
    }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [
    check('budget_lines_estimate_check', sql.raw('estimate_cents >= 0')),
    check('budget_lines_actual_check', sql.raw('actual_cents >= 0')),
    index('budget_lines_org_wedding_idx').on(t.orgId, t.weddingId),
  ],
)

/**
 * A payment is a dated amount against a budget line; `paid_at` null means not yet paid.
 * `due_on` is a civil `date` and `paid_at` an instant, the same split `_shared.ts` makes
 * between a local date and a moment.
 *
 * Hard-deleted with its line (`cascade`), not soft: the wedding's history of what was owed
 * is the budget line's, and a payment with no line has nothing to mean.
 */
export const payments = pgTable(
  'payments',
  {
    id: uuid('id').primaryKey(),
    orgId: orgId(),
    weddingId: weddingId().references(() => weddings.id, { onDelete: 'cascade' }),
    budgetLineId: uuid('budget_line_id')
      .notNull()
      .references(() => budgetLines.id, { onDelete: 'cascade' }),
    dueOn: date('due_on').notNull(),
    amountCents: integer('amount_cents').notNull(),
    paidAt: tstz('paid_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check('payments_amount_check', sql.raw('amount_cents >= 0')),
    index('payments_org_wedding_due_idx').on(t.orgId, t.weddingId, t.dueOn),
    index('payments_org_budget_line_idx').on(t.orgId, t.budgetLineId),
  ],
)
