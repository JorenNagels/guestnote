import { sql } from 'drizzle-orm'
import { timestamp, uuid } from 'drizzle-orm/pg-core'

/**
 * Column helpers. Every decision here is repeated across a dozen tables, so it is
 * made once, in one place, and the reasoning lives with it.
 *
 * See research/05-architecture.md section 4 and research/07-auth-and-tenancy.md section 4.
 */

/**
 * `timestamptz`, always. Never bare `timestamp`.
 *
 * Converting `timestamp` to `timestamptz` on live data is miserable, and this
 * product is inherently multi-timezone: a Belgian planner, a couple honeymooning
 * elsewhere, and a wedding date that is a *local* civil date. The wall-clock date
 * of the wedding lives in `weddings.wedding_date` (a `date`) plus
 * `weddings.timezone`; everything else -- when a task is due, when a row was
 * written -- is an instant, and instants are `timestamptz`.
 */
export const tstz = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' })

export const createdAt = () => tstz('created_at').notNull().defaultNow()
export const updatedAt = () => tstz('updated_at').notNull().defaultNow()

/**
 * Soft delete. Deliberately NOT part of any RLS policy.
 *
 * Policies are about tenancy and nothing else. If `deleted_at IS NULL` were folded
 * into a policy, a failing isolation assertion would be ambiguous -- you would not
 * know whether you had found a cross-tenant leak or a deletion bug. Filtering
 * happens in the repository layer.
 */
export const deletedAt = () => tstz('deleted_at')

/**
 * The tenant keys, carried by every tenant-scoped table.
 *
 * Denormalised onto children on purpose: it makes every RLS policy a
 * single-column check with no joins, and every index a composite starting with
 * the tenant column. There are exactly two exceptions in the whole schema --
 * `org_members` and `wedding_members` -- because they are read *before* the
 * tenant is known, in order to determine it. Those two carry a policy on a
 * different axis (`app.user_id`). See research/07-auth-and-tenancy.md section 4a;
 * that is correct, not an oversight, and the migration says so too.
 */
export const orgId = () => uuid('org_id').notNull()
export const weddingId = () => uuid('wedding_id').notNull()

/**
 * `text` + `CHECK`, never a Postgres `enum`.
 *
 * research/09-planner-app.md section a already needs to widen
 * `wedding_members.role`, and PH2/PH3 will widen more. Widening a CHECK is an
 * ordinary `ALTER`; a Postgres enum value can never be removed once added.
 */
export const oneOf = (column: string, values: readonly string[]) =>
  sql.raw(`${column} in (${values.map((v) => `'${v}'`).join(', ')})`)
