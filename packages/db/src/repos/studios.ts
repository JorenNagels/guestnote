import { and, eq, isNull, sql } from 'drizzle-orm'
import type { Db, TenantDb } from '../client.ts'
import { newId } from '../id.ts'
import { organizations } from '../schema/orgs.ts'
import { withTenant, withUser } from '../tenant.ts'
import { type Memberships, principalForOrg } from './memberships.ts'
import { fail, ok, type Result } from './result.ts'

/**
 * Spec 0005: a studio made by its own owner, its settings, and its (switched-off) billing
 * profile. Migration 0010 has the SQL side and the reasoning for each function.
 *
 * ## Three doors, by who is asking
 *
 *   * `createStudio` -- a signed-in user with no principal yet. One call of the SECURITY
 *     DEFINER `create_studio` through `withUser`, the shape `acceptInvitationByHash` has: the
 *     function checks `app.user_id` against the user it creates for, so the wrong id fails
 *     closed. It is not a third unscoped writer (CLAUDE.md invariant 1).
 *   * `studioSettings` -- any staff of the org (the logo shows in every member's sidebar),
 *     through `withUser` and 0005's `org_read_for_members`, which is the one policy that lets a
 *     `member` read their organisation. Two columns and the id: that policy admits the whole
 *     row, so the select list is the boundary (see `listOrgsForUser`).
 *   * Everything else -- owner or admin only, refused before any SQL when `principalForOrg`
 *     says no, then through `withTenant`. The billing columns are read ONLY by
 *     `billingProfile`, so a member never reaches them by any function in this package.
 *
 * `trial_ends_at` and `billing_status` are not written here: the first is set by hand (spec
 * 0005, Trial), the second by a provider that does not exist yet.
 */

export type CreateStudioInput = {
  readonly name: string
  /** Already cleaned by the app (`lib/slug.ts`): ASCII, a DNS label, not a reserved word. */
  readonly slugBase: string
  /** The owner's display name; blank leaves `users.name` as it is. */
  readonly ownerName: string
}

export type CreateStudioResult = Result<
  { readonly orgId: string; readonly slug: string },
  'alreadyOwner' | 'invalid' | 'forbidden'
>

export type StudioSettings = {
  readonly id: string
  readonly name: string
  readonly logoKey: string | null
}

export type BillingProfile = {
  readonly orgId: string
  readonly createdAt: Date
  readonly trialEndsAt: Date | null
  readonly billingCycle: 'monthly' | 'yearly' | null
  readonly billingStatus: 'trialing' | 'active' | 'past_due' | 'canceled' | null
  readonly billingName: string | null
  readonly billingEmail: string | null
  readonly vatNumber: string | null
  readonly billingCustomerId: string | null
  readonly billingSubscriptionId: string | null
}

export type InvoiceDetails = {
  readonly billingName: string | null
  readonly billingEmail: string | null
  readonly vatNumber: string | null
}

export type StudioWriteResult<T = null> = Result<T, 'forbidden' | 'notFound' | 'invalid'>

/** Spec 0005, Sign-up step 4: 1-80 characters. `create_studio` checks the same bound. */
export const MAX_STUDIO_NAME = 80

type CreateRow = { outcome: string; created_org_id: string | null; created_slug: string | null }

async function rowsOf<T>(pending: Promise<unknown>): Promise<T[]> {
  return ((await pending) as { rows: T[] }).rows
}

const CREATE_REFUSALS = {
  already_owner: 'alreadyOwner',
  invalid: 'invalid',
  forbidden: 'forbidden',
} as const

/**
 * Creates a planner org with `userId` as its owner and sets their display name, in one
 * transaction (migration 0010, `create_studio`). `alreadyOwner` when the user already owns a
 * live studio -- which is also what a double submit gets on its second call.
 *
 * The caller's `Memberships` are stale afterwards: re-resolve them before seeding templates
 * or creating a wedding in the new org.
 */
export async function createStudio(
  db: Db,
  userId: string,
  input: CreateStudioInput,
): Promise<CreateStudioResult> {
  const orgId = newId()
  const [row] = await withUser(db, userId, (tx: TenantDb) =>
    rowsOf<CreateRow>(
      tx.execute(
        sql`select * from public.create_studio(${orgId}::uuid, ${userId}::uuid, ${input.name}, ${input.slugBase}, ${input.ownerName})`,
      ),
    ),
  )
  if (!row) throw new Error('create_studio returned no row (migration 0010)')
  if (row.outcome === 'created') {
    if (!row.created_org_id || !row.created_slug) {
      throw new Error('create_studio said created with no org or slug (migration 0010)')
    }
    return ok({ orgId: row.created_org_id, slug: row.created_slug })
  }
  const reason = CREATE_REFUSALS[row.outcome as keyof typeof CREATE_REFUSALS]
  if (!reason) {
    throw new Error(`create_studio returned an unknown outcome '${row.outcome}' (migration 0010)`)
  }
  return fail(reason)
}

/** Name and logo key for any staff member of the org; `null` for anyone else. */
export async function studioSettings(
  db: Db,
  m: Memberships,
  orgId: string,
): Promise<StudioSettings | null> {
  if (!m.orgs.some((o) => o.orgId === orgId)) return null
  const [row] = await withUser(db, m.userId, (tx) =>
    tx
      .select({ id: organizations.id, name: organizations.name, logoKey: organizations.logoKey })
      .from(organizations)
      .where(and(eq(organizations.id, orgId), isNull(organizations.deletedAt))),
  )
  return row ?? null
}

/** Owner or admin. The name is trimmed; blank or over `MAX_STUDIO_NAME` is `invalid`. */
export async function renameStudio(
  db: Db,
  m: Memberships,
  orgId: string,
  name: string,
): Promise<StudioWriteResult> {
  const principal = principalForOrg(m, orgId)
  if (!principal) return fail('forbidden')
  const clean = name.trim()
  if (clean.length === 0 || clean.length > MAX_STUDIO_NAME) return fail('invalid')
  const changed = await withTenant(db, principal, (tx) =>
    tx
      .update(organizations)
      .set({ name: clean, updatedAt: new Date() })
      .where(and(eq(organizations.id, orgId), isNull(organizations.deletedAt)))
      .returning({ id: organizations.id }),
  )
  return changed.length === 0 ? fail('notFound') : ok(null)
}

/**
 * Owner or admin. Saves the logo's storage key (or clears it with `null`) and returns the key
 * it replaced, so the caller deletes that object only AFTER the new key is saved (spec 0005,
 * Studio logo). A key outside this org's `<org>/brand/` prefix is `invalid`: the storage seam
 * builds the key, and this refuses to record one that would point at another org's object.
 */
export async function setLogoKey(
  db: Db,
  m: Memberships,
  orgId: string,
  logoKey: string | null,
): Promise<StudioWriteResult<{ readonly previous: string | null }>> {
  const principal = principalForOrg(m, orgId)
  if (!principal) return fail('forbidden')
  if (logoKey !== null && !logoKey.startsWith(`${orgId}/brand/`)) return fail('invalid')
  return withTenant(db, principal, async (tx) => {
    const [before] = await tx
      .select({ logoKey: organizations.logoKey })
      .from(organizations)
      .where(and(eq(organizations.id, orgId), isNull(organizations.deletedAt)))
      .for('update')
    if (!before) return fail('notFound')
    await tx
      .update(organizations)
      .set({ logoKey, updatedAt: new Date() })
      .where(eq(organizations.id, orgId))
    return ok({ previous: before.logoKey })
  })
}

/** Owner or admin; `null` for anyone else, including a member of the same org. */
export async function billingProfile(
  db: Db,
  m: Memberships,
  orgId: string,
): Promise<BillingProfile | null> {
  const principal = principalForOrg(m, orgId)
  if (!principal) return null
  const [row] = await withTenant(db, principal, (tx) =>
    tx
      .select({
        orgId: organizations.id,
        createdAt: organizations.createdAt,
        trialEndsAt: organizations.trialEndsAt,
        billingCycle: organizations.billingCycle,
        billingStatus: organizations.billingStatus,
        billingName: organizations.billingName,
        billingEmail: organizations.billingEmail,
        vatNumber: organizations.vatNumber,
        billingCustomerId: organizations.billingCustomerId,
        billingSubscriptionId: organizations.billingSubscriptionId,
      })
      .from(organizations)
      .where(and(eq(organizations.id, orgId), isNull(organizations.deletedAt))),
  )
  // The column CHECKs hold the two value lists, so the casts are what the schema promises.
  return row
    ? {
        ...row,
        billingCycle: row.billingCycle as BillingProfile['billingCycle'],
        billingStatus: row.billingStatus as BillingProfile['billingStatus'],
      }
    : null
}

const blankToNull = (v: string | null): string | null => {
  const t = v?.trim() ?? ''
  return t === '' ? null : t
}

/**
 * Owner or admin. The Billing screen's "Invoice details": billed-to, billing email, VAT
 * number. Blank becomes null. Format checks (an email, a VAT number) are the form's; this is
 * the write.
 */
export async function saveInvoiceDetails(
  db: Db,
  m: Memberships,
  orgId: string,
  details: InvoiceDetails,
): Promise<StudioWriteResult> {
  const principal = principalForOrg(m, orgId)
  if (!principal) return fail('forbidden')
  const changed = await withTenant(db, principal, (tx) =>
    tx
      .update(organizations)
      .set({
        billingName: blankToNull(details.billingName),
        billingEmail: blankToNull(details.billingEmail),
        vatNumber: blankToNull(details.vatNumber),
        updatedAt: new Date(),
      })
      .where(and(eq(organizations.id, orgId), isNull(organizations.deletedAt)))
      .returning({ id: organizations.id }),
  )
  return changed.length === 0 ? fail('notFound') : ok(null)
}

export type TrialEnding = {
  readonly orgId: string
  readonly orgName: string
  /** The trial's last day, `YYYY-MM-DD`, Europe/Brussels. */
  readonly trialEndsOn: string
  readonly ownerEmail: string
}

type TrialRow = { org_id: string; org_name: string; trial_ends_on: string; owner_email: string }

/**
 * For the trial-reminder cron only, which has no principal: every live planner org whose
 * trial's last day is `on`, with one owner's email. `billingFrom` is
 * `GUESTNOTE_BILLING_FROM`; the function returns nothing without it. Both dates are
 * `YYYY-MM-DD`. A plain `Db` and one SECURITY DEFINER call, like `resolveInvitationByHash`
 * -- migration 0010 says why this is the only cross-tenant read in the schema.
 */
export async function orgsWithTrialEnding(
  db: Db,
  on: string,
  billingFrom: string,
): Promise<TrialEnding[]> {
  const rows = await rowsOf<TrialRow>(
    db.execute(sql`select * from public.orgs_with_trial_ending(${on}::date, ${billingFrom}::date)`),
  )
  return rows.map((r) => ({
    orgId: r.org_id,
    orgName: r.org_name,
    trialEndsOn: r.trial_ends_on,
    ownerEmail: r.owner_email,
  }))
}
