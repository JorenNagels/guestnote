import { eq } from 'drizzle-orm'
import { createDb, createPool } from '../src/client.ts'
import { organizations, orgMembers, users, weddings } from '../src/schema/index.ts'
import { type Principal, withTenant } from '../src/tenant.ts'

/**
 * The development fixture: one user, one organisation, one wedding.
 *
 *   npm run db:reset -- --yes            # first, if there is anything to clear
 *   npm run db:seed  -- you@example.com
 *
 * ## It seeds through `withTenant`, as `app_user`
 *
 * Deliberately, and it is the most interesting thing about this file.
 * `packages/db/test/harness.ts` has to bypass RLS -- its whole job is to write
 * cross-tenant rows that no single tenant context could produce, and it must be ground
 * truth independent of the policies under test. A dev seed has no such need, and reaching
 * for `unsafeDbForMigrationsAndAdminOnly` here would mean the one path that creates an
 * organisation is the one path never exercised against the policies.
 *
 * So it runs as `app_user` over DATABASE_URL, and every insert satisfies RLS the same way
 * the real thing will:
 *
 *   organizations   `with check (id = app.org_id)`      -- the id is generated first,
 *                                                          then claimed in the GUC
 *   org_members     `with check (user_id = app.user_id)`
 *   weddings        `with check (org_id = app.org_id)`
 *
 * Which means this script IS a working sketch of self-serve org creation. If it runs, that
 * flow needs no escape hatch either.
 *
 * ## `users` is written directly
 *
 * `users` carries no RLS on purpose -- `0001_rls.sql` explains that Better Auth must find a
 * user BY EMAIL before any session exists, so there is no `app.user_id` to scope by at that
 * moment. Seeding the row up front means you can sign in immediately rather than having to
 * sign in once to create it and run this again.
 *
 * ## Fixed ids, so it is idempotent
 *
 * Re-running must not produce a second JJCo. The ids below are hand-written rather than
 * `newId()` for exactly that reason, and every insert is `onConflictDoNothing`. They are
 * obviously-fake v4-shaped strings so a row from this file is recognisable at a glance in
 * psql, and can never collide with the uuidv7 ids the application generates.
 */

const ID = {
  org: 'a0000000-5eed-4000-8000-000000000001',
  wedding: '11110000-5eed-4000-8000-00000000000a',
} as const

/**
 * `planner`, not `couple_direct`.
 *
 * Both produce an identical `orgStaff` owner principal, so nothing in the code behaves
 * differently today -- the type is a billing and branding fact that only matters once
 * `organizations.plan` gates anything. `planner` is the persona the whole PH0-PH3 build
 * is aimed at, so the fixture exercises the shape being developed. One word to change if
 * you would rather it modelled a couple who bought direct.
 */
const ORG = {
  id: ID.org,
  slug: 'jjco',
  name: 'JJCo',
  type: 'planner',
} as const

const WEDDING = {
  id: ID.wedding,
  slug: 'emma-en-joren',
  coupleDisplayName: 'Emma & Joren',
  /** A `date` column: a local civil date, no timezone. 31 July 2027. */
  weddingDate: '2027-07-31',
  status: 'draft',
} as const

async function main(): Promise<void> {
  const email = process.argv[2]?.trim().toLowerCase()
  if (!email?.includes('@')) {
    throw new Error(
      'Usage: npm run db:seed -- you@example.com\n' +
        'The address is the one you will type into the sign-in form; it becomes the ' +
        'owner of the seeded organisation.',
    )
  }

  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error(
      'DATABASE_URL is not set. Run this through `npm run db:seed`, which passes ' +
        '--env-file=.env.local. It must be the app_user POOLED url: withTenant needs ' +
        'interactive transactions, and seeding as an owner or a BYPASSRLS role would ' +
        'defeat the point of this script.',
    )
  }

  const pool = createPool({ connectionString, max: 1 })
  const db = createDb(pool)

  try {
    // `users` first, and outside any tenant context -- there is no tenant yet, and the
    // table has no policy to satisfy.
    await db
      .insert(users)
      .values({ id: crypto.randomUUID(), email, emailVerified: true })
      .onConflictDoNothing()

    // The id above is discarded if the address already existed, so read back whichever
    // row actually owns this email rather than assuming the insert won.
    const [me] = await db.select({ id: users.id }).from(users).where(eq(users.email, email))
    if (!me) throw new Error(`Could not create or find a user for ${email}`)

    const principal: Principal = {
      kind: 'orgStaff',
      userId: me.id,
      orgId: ORG.id,
      role: 'owner',
    }

    // One transaction, one tenant context. The GUCs are set from `principal` before any
    // statement runs, so every `with check` is evaluated against the org claimed here --
    // including the organisation row that does not exist yet when the GUC names it.
    await withTenant(db, principal, async (tx) => {
      await tx.insert(organizations).values(ORG).onConflictDoNothing()

      await tx
        .insert(orgMembers)
        .values({ orgId: ORG.id, userId: me.id, role: 'owner' })
        .onConflictDoNothing()

      await tx
        .insert(weddings)
        .values({ ...WEDDING, orgId: ORG.id })
        .onConflictDoNothing()
    })

    console.info(
      `\n  Seeded.\n` +
        `    user      ${email}  (owner)\n` +
        `    org       ${ORG.name}\n` +
        `    wedding   ${WEDDING.coupleDisplayName}, ${WEDDING.weddingDate}\n\n` +
        `  Sign in at http://app.guestnote.localhost:3000/login as ${email}.\n`,
    )
  } finally {
    await pool.end()
  }
}

await main()
