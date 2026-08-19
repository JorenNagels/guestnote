import { eq } from 'drizzle-orm'
import { createDb, createPool } from '../src/client.ts'
import { organizations, orgMembers, users, weddings } from '../src/schema/index.ts'
import { type Principal, withTenant } from '../src/tenant.ts'

/**
 * A development fixture: one organisation you own, one you do not.
 *
 *   npm run db:seed -- you@example.com
 *
 * ## Why this exists
 *
 * `05-architecture.md` §9 asks M2 for "a synthetic two-org / three-wedding fixture".
 * `packages/db/test/harness.ts` already has one, but it belongs to the isolation suite:
 * it truncates every table on each run and seeds through a BYPASSRLS role, neither of
 * which you want pointed at the branch you are developing against. This is the same
 * shape, for a database a human is going to sign into.
 *
 * ## It seeds through `withTenant`, as `app_user`
 *
 * Deliberately, and it is the most interesting thing about this file. The test harness
 * has to bypass RLS -- its whole job is to write cross-tenant rows that no single
 * tenant context could produce, and it must be ground truth independent of the policies
 * under test. A dev seed has no such need, and reaching for
 * `unsafeDbForMigrationsAndAdminOnly` here would mean the one path that creates an
 * organisation is the one path never exercised against the policies.
 *
 * So it runs as `app_user` over DATABASE_URL, and every insert satisfies RLS the same
 * way the real thing will:
 *
 *   organizations   `with check (id = app.org_id)`     -- the id is generated first,
 *                                                         then claimed in the GUC
 *   org_members     `with check (user_id = app.user_id)`
 *   weddings        `with check (org_id = app.org_id)`
 *
 * Which means this script IS a working sketch of self-serve org creation. If it runs,
 * that flow needs no escape hatch either.
 *
 * ## `users` is written directly
 *
 * `users` carries no RLS on purpose -- `0001_rls.sql` explains that Better Auth must
 * find a user BY EMAIL before any session exists, so there is no `app.user_id` to scope
 * by at that moment. Seeding the row up front means you can sign in immediately rather
 * than having to sign in once to create it and run this again.
 *
 * ## Fixed ids, so it is idempotent
 *
 * Re-running must not produce a second Studio Wit. The ids below are hand-written
 * rather than `newId()` for exactly that reason, and every insert is
 * `onConflictDoNothing`. They are obviously-fake v4-shaped strings so that a row from
 * this file is recognisable at a glance in psql, and can never collide with the uuidv7
 * ids the application generates.
 */

const ID = {
  orgMine: 'a0000000-5eed-4000-8000-000000000001',
  orgOther: 'b0000000-5eed-4000-8000-000000000002',
  ownerOther: 'd0000000-5eed-4000-8000-000000000003',
  weddingA: '11110000-5eed-4000-8000-00000000000a',
  weddingB: '22220000-5eed-4000-8000-00000000000b',
  weddingC: '33330000-5eed-4000-8000-00000000000c',
  weddingOther: '44440000-5eed-4000-8000-00000000000d',
} as const

/** `els-en-jan` on purpose: apps/web/README.md's host matrix already curls that slug. */
const MY_WEDDINGS = [
  {
    id: ID.weddingA,
    slug: 'els-en-jan',
    coupleDisplayName: 'Els & Jan',
    weddingDate: '2027-05-22',
    status: 'live',
  },
  {
    id: ID.weddingB,
    slug: 'emma-en-joren',
    coupleDisplayName: 'Emma & Joren',
    weddingDate: '2027-07-31',
    status: 'draft',
  },
  {
    id: ID.weddingC,
    slug: 'sofie-en-pieter',
    coupleDisplayName: 'Sofie & Pieter',
    weddingDate: '2027-09-11',
    status: 'draft',
  },
] as const

function owner(userId: string, orgId: string): Principal {
  return { kind: 'orgStaff', userId, orgId, role: 'owner' }
}

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
      .values([
        { id: ID.ownerOther, email: 'ilse@huisvanelsene.test', name: 'Ilse Verhoeven' },
        { id: crypto.randomUUID(), email, emailVerified: true },
      ])
      .onConflictDoNothing()

    // The id above is discarded if the address already existed, so read back whichever
    // row actually owns this email rather than assuming the insert won.
    const [me] = await db.select({ id: users.id }).from(users).where(eq(users.email, email))
    if (!me) throw new Error(`Could not create or find a user for ${email}`)

    await seedOrg(db, owner(me.id, ID.orgMine), {
      id: ID.orgMine,
      slug: 'studio-wit',
      name: 'Studio Wit',
      type: 'planner',
      weddings: MY_WEDDINGS,
    })

    // The second organisation exists to be invisible. Nothing links you to it, so the
    // wedding list rendering three rows and not four is a live demonstration that the
    // policy holds -- not merely an assertion in a suite you have to go and read.
    await seedOrg(db, owner(ID.ownerOther, ID.orgOther), {
      id: ID.orgOther,
      slug: 'huis-van-elsene',
      name: 'Huis van Elsene',
      type: 'venue',
      weddings: [
        {
          id: ID.weddingOther,
          slug: 'anke-en-tom',
          coupleDisplayName: 'Anke & Tom',
          weddingDate: '2027-06-05',
          status: 'draft',
        },
      ],
    })

    console.info(
      `\n  Seeded.\n` +
        `    Studio Wit          3 weddings, owned by ${email}\n` +
        `    Huis van Elsene     1 wedding, owned by somebody else -- you must NOT see it\n\n` +
        `  Sign in at http://app.localhost:3000/login as ${email}.\n` +
        `  The six-digit code goes to the dev server console.\n`,
    )
  } finally {
    await pool.end()
  }
}

type OrgSeed = {
  id: string
  slug: string
  name: string
  type: string
  weddings: readonly {
    id: string
    slug: string
    coupleDisplayName: string
    weddingDate: string
    status: string
  }[]
}

/**
 * One organisation, its owner's membership and its weddings, in one transaction under
 * one tenant context. The GUCs are set from `principal` before any statement runs, so
 * every `with check` below is evaluated against the org this call claims.
 */
async function seedOrg(
  db: ReturnType<typeof createDb>,
  principal: Principal,
  org: OrgSeed,
): Promise<void> {
  await withTenant(db, principal, async (tx) => {
    await tx
      .insert(organizations)
      .values({ id: org.id, slug: org.slug, name: org.name, type: org.type })
      .onConflictDoNothing()

    await tx
      .insert(orgMembers)
      .values({ orgId: org.id, userId: principal.userId, role: 'owner' })
      .onConflictDoNothing()

    await tx
      .insert(weddings)
      .values(org.weddings.map((w) => ({ ...w, orgId: org.id })))
      .onConflictDoNothing()
  })
}

await main()
