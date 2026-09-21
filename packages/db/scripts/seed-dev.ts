import { eq } from 'drizzle-orm'
import { createDb, createPool } from '../src/client.ts'
import {
  budgetLines,
  files,
  organizations,
  orgMembers,
  payments,
  runSheetItems,
  taskComments,
  tasks,
  taskTemplates,
  templateItems,
  users,
  vendorLinks,
  vendors,
  weddingEvents,
  weddingMembers,
  weddings,
  weddingVendors,
} from '../src/schema/index.ts'
import { type Principal, withTenant, withUser } from '../src/tenant.ts'

/**
 * The development fixture: one organisation with two users, two weddings, and sample data
 * in every planner-app table (spec 0003).
 *
 *   npm run db:reset -- --yes            # first, if there is anything to clear
 *   npm run db:seed  -- you@example.com
 *
 * You sign in as the OWNER (the address you pass). The second user is a `member`, at
 * `<you>+member@<domain>`, assigned to the first wedding only -- sign in as them to see what
 * an assigned planner sees: one wedding in the sidebar, the whole vendor directory, and no
 * link management.
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
 *   everything else `with check (org_id = app.org_id ...)` plus the role clause -- and the
 *                   seed principal is an `owner`, which is what that clause admits
 *
 * Which means this script IS a working sketch of self-serve org creation. If it runs, that
 * flow needs no escape hatch either.
 *
 * ## The member's two membership rows go through `withUser`
 *
 * `own_memberships` is `with check (user_id = app.user_id)`, so the OWNER's transaction
 * cannot write another user's membership -- and it should not be able to; that is the
 * property. The member's rows are written in a transaction whose `app.user_id` is the
 * member, which `withUser` provides without pretending they hold a role. (Real invitation
 * acceptance works the same way: the invitee is signed in, and writes their own row.)
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
 * psql, and can never collide with the uuidv7 ids the application generates. The one
 * exception is the two `weddings` columns spec 0003 added (`venue` and friends), which are
 * UPDATED on conflict so a database seeded before 0006 picks them up on the next run.
 *
 * ## The `files` rows point at objects that do not exist
 *
 * `storage_key` names a key in S3, and this script has no bucket. The rows are there so the
 * Files and Moodboard screens have something to list; opening or downloading one fails
 * until slice S5's upload path has put real bytes at a key.
 *
 * ## Which driver runs this
 *
 * `createPool` is the Neon WebSocket driver, so this script needs a Neon `DATABASE_URL`.
 * Against the local container (`packages/db/scripts/local-db.sh`) it will not connect; the
 * container is for `test:db`, which uses node-postgres.
 */

/** A fixed, recognisable uuid: `<kind>-5eed-4000-8000-<n as 12 hex digits>`. */
const sid = (kind: string, n: number): string =>
  `${kind}-5eed-4000-8000-${n.toString(16).padStart(12, '0')}`

const ID = {
  org: 'a0000000-5eed-4000-8000-000000000001',
  wedding: '11110000-5eed-4000-8000-00000000000a',
  wedding2: '11110000-5eed-4000-8000-00000000000b',
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
  venue: 'Kasteel van Brasschaat',
  headcount: 140,
  notes: 'Two-day wedding. The couple prefer WhatsApp voice notes to email.',
  color: '#206560',
} as const

/** A sparse second wedding, so the sidebar, the T-minus and the member's pin have a sibling. */
const WEDDING2 = {
  id: ID.wedding2,
  slug: 'julie-en-kasper',
  coupleDisplayName: 'Julie & Kasper',
  weddingDate: '2027-09-11',
  status: 'draft',
  venue: 'Hoeve De Linde',
  headcount: 80,
  notes: null,
  color: '#7A6A9B',
} as const

/** Same wall-clock day at noon UTC, plus an offset in days -- what `due_offset_days` means. */
const dueAt = (weddingDate: string, offsetDays: number): Date =>
  new Date(Date.parse(`${weddingDate}T12:00:00Z`) + offsetDays * 86_400_000)

async function main(): Promise<void> {
  const email = process.argv[2]?.trim().toLowerCase()
  if (!email?.includes('@')) {
    throw new Error(
      'Usage: npm run db:seed -- you@example.com\n' +
        'The address is the one you will type into the sign-in form; it becomes the ' +
        'owner of the seeded organisation.',
    )
  }
  const [local = '', domain = ''] = email.split('@')
  const memberEmail = `${local}+member@${domain}`

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
    for (const address of [email, memberEmail]) {
      await db
        .insert(users)
        .values({ id: crypto.randomUUID(), email: address, emailVerified: true })
        .onConflictDoNothing()
    }

    // The ids above are discarded if an address already existed, so read back whichever
    // row actually owns each email rather than assuming the insert won.
    const [me] = await db.select({ id: users.id }).from(users).where(eq(users.email, email))
    const [member] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, memberEmail))
    if (!me) throw new Error(`Could not create or find a user for ${email}`)
    if (!member) throw new Error(`Could not create or find a user for ${memberEmail}`)

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

      for (const w of [WEDDING, WEDDING2]) {
        await tx
          .insert(weddings)
          .values({ ...w, orgId: ORG.id })
          .onConflictDoUpdate({
            target: weddings.id,
            set: { venue: w.venue, headcount: w.headcount, notes: w.notes, color: w.color },
          })
      }
    })

    // The member: staff of the org, assigned to the FIRST wedding only. `principalForWedding`
    // needs both rows -- `org_members` for the org, `wedding_members` for the assignment.
    await withUser(db, member.id, async (tx) => {
      await tx
        .insert(orgMembers)
        .values({ orgId: ORG.id, userId: member.id, role: 'member' })
        .onConflictDoNothing()
      await tx
        .insert(weddingMembers)
        .values({ weddingId: ID.wedding, userId: member.id, role: 'editor' })
        .onConflictDoNothing()
    })

    await withTenant(db, principal, async (tx) => {
      const org = ORG.id

      // ---- vendors: the org directory, and who is on which wedding ---------------------
      const V = {
        venue: sid('55550000', 1),
        caterer: sid('55550000', 2),
        photo: sid('55550000', 3),
        flowers: sid('55550000', 4),
        dj: sid('55550000', 5),
        cake: sid('55550000', 6),
        farm: sid('55550000', 7),
      }
      await tx
        .insert(vendors)
        .values([
          {
            id: V.venue,
            orgId: org,
            name: 'Kasteel van Brasschaat',
            category: 'Venue',
            email: 'events@kasteelbrasschaat.be',
            phone: '03 651 04 18',
            notes: 'Contact: Isabelle Maes',
          },
          {
            id: V.caterer,
            orgId: org,
            name: 'Traiteur Vandenberghe',
            category: 'Catering',
            email: 'geert@traiteurvandenberghe.be',
            phone: '050 34 77 09',
            notes: null,
          },
          {
            id: V.photo,
            orgId: org,
            name: 'Fotografie Lien Dewaele',
            category: 'Photography',
            email: 'hallo@liendewaele.be',
            phone: '0478 21 66 40',
            notes: null,
          },
          {
            id: V.flowers,
            orgId: org,
            name: 'Bloemen Atelier Roos',
            category: 'Flowers',
            email: 'roos@bloemenatelierroos.be',
            phone: '09 224 11 52',
            notes: 'Peonies out of season in October',
          },
          {
            id: V.dj,
            orgId: org,
            name: 'DJ Maxim Peeters',
            category: 'Music',
            email: 'boekingen@djmaxim.be',
            phone: '0495 70 12 33',
            notes: null,
          },
          {
            id: V.cake,
            orgId: org,
            name: 'Patisserie Delvaux',
            category: 'Cake',
            email: 'bestel@patisseriedelvaux.be',
            phone: '03 232 88 41',
            notes: null,
          },
          {
            id: V.farm,
            orgId: org,
            name: 'Hoeve De Linde',
            category: 'Venue',
            email: null,
            phone: null,
            notes: null,
          },
        ])
        .onConflictDoNothing()

      const WV = {
        venue: sid('66660000', 1),
        caterer: sid('66660000', 2),
        photo: sid('66660000', 3),
        flowers: sid('66660000', 4),
        dj: sid('66660000', 5),
        cake: sid('66660000', 6),
        farm: sid('66660000', 7),
        photo2: sid('66660000', 8),
      }
      await tx
        .insert(weddingVendors)
        .values([
          {
            id: WV.venue,
            orgId: org,
            weddingId: ID.wedding,
            vendorId: V.venue,
            status: 'booked',
            notes: 'Deposit paid, balance at T-14',
          },
          {
            id: WV.caterer,
            orgId: org,
            weddingId: ID.wedding,
            vendorId: V.caterer,
            status: 'booked',
            notes: '30% deposit paid',
          },
          {
            id: WV.photo,
            orgId: org,
            weddingId: ID.wedding,
            vendorId: V.photo,
            status: 'booked',
            notes: null,
          },
          {
            id: WV.flowers,
            orgId: org,
            weddingId: ID.wedding,
            vendorId: V.flowers,
            status: 'quoted',
            notes: 'Quote under margin review',
          },
          {
            id: WV.dj,
            orgId: org,
            weddingId: ID.wedding,
            vendorId: V.dj,
            status: 'booked',
            notes: null,
          },
          {
            id: WV.cake,
            orgId: org,
            weddingId: ID.wedding,
            vendorId: V.cake,
            status: 'contacted',
            notes: null,
          },
          {
            id: WV.farm,
            orgId: org,
            weddingId: ID.wedding2,
            vendorId: V.farm,
            status: 'considering',
            notes: null,
          },
          {
            id: WV.photo2,
            orgId: org,
            weddingId: ID.wedding2,
            vendorId: V.photo,
            status: 'contacted',
            notes: null,
          },
        ])
        .onConflictDoNothing()

      // ---- events and the run sheet ----------------------------------------------------
      const EV = {
        civil: sid('44440000', 1),
        main: sid('44440000', 2),
        brunch: sid('44440000', 3),
        farm: sid('44440000', 4),
      }
      await tx
        .insert(weddingEvents)
        .values([
          {
            id: EV.civil,
            orgId: org,
            weddingId: ID.wedding,
            label: 'Civil ceremony',
            startsOn: '2027-07-30',
            startsAt: '11:00',
            venue: 'Stadhuis Brasschaat',
            position: 0,
          },
          {
            id: EV.main,
            orgId: org,
            weddingId: ID.wedding,
            label: 'Wedding day',
            startsOn: '2027-07-31',
            startsAt: '15:30',
            venue: 'Kasteel van Brasschaat',
            position: 1,
          },
          {
            id: EV.brunch,
            orgId: org,
            weddingId: ID.wedding,
            label: 'Guest brunch',
            startsOn: '2027-08-01',
            startsAt: '11:00',
            venue: 'Kasteel van Brasschaat',
            position: 2,
          },
          {
            id: EV.farm,
            orgId: org,
            weddingId: ID.wedding2,
            label: 'Wedding day',
            startsOn: '2027-09-11',
            startsAt: '14:00',
            venue: 'Hoeve De Linde',
            position: 0,
          },
        ])
        .onConflictDoNothing()

      // The main day runs past midnight, which is why `position` and not `starts_at` orders
      // it -- the last two rows sort BEFORE the first on the clock alone.
      const run: [string, number, string, string | null, string | null][] = [
        ['09:30', 30, 'Supplier access, floor-plan walk with the venue', 'Orangery', null],
        ['10:00', 90, 'Flowers delivered and installed', 'Chapel and Orangery', WV.flowers],
        ['14:00', 45, 'Couple arrives, first look and portraits', 'Rose garden', WV.photo],
        ['15:30', 40, 'Ceremony', 'Chapel', null],
        ['16:30', 90, 'Reception, canapes and cava', 'Terrace', WV.caterer],
        ['18:00', 15, 'Guests seated, dinner service begins', 'Orangery', WV.caterer],
        ['20:30', 15, 'Cake cutting', 'Orangery', WV.cake],
        ['21:00', 10, 'First dance, floor opens', 'Barn', WV.dj],
        ['01:30', 15, 'Last dance', 'Barn', WV.dj],
        ['02:00', 30, 'Bar closes, shuttles depart', 'Courtyard', null],
      ]
      await tx
        .insert(runSheetItems)
        .values(
          run.map(([startsAt, durationMin, title, place, weddingVendorId], i) => ({
            id: sid('99990000', i + 1),
            orgId: org,
            weddingId: ID.wedding,
            eventId: EV.main,
            startsAt,
            durationMin,
            title,
            place,
            weddingVendorId,
            position: i,
          })),
        )
        .onConflictDoNothing()

      // ---- budget and payments (integer cents) -----------------------------------------
      const BL = {
        venue: sid('77770000', 1),
        dinner: sid('77770000', 2),
        photo: sid('77770000', 3),
        flowers: sid('77770000', 4),
        dj: sid('77770000', 5),
        fee: sid('77770000', 6),
      }
      await tx
        .insert(budgetLines)
        .values([
          {
            id: BL.venue,
            orgId: org,
            weddingId: ID.wedding,
            category: 'Venue and rental',
            label: 'Venue hire, exclusive use',
            estimateCents: 840_000,
            actualCents: 840_000,
            weddingVendorId: WV.venue,
          },
          {
            id: BL.dinner,
            orgId: org,
            weddingId: ID.wedding,
            category: 'Catering and drinks',
            label: 'Dinner, menu B',
            estimateCents: 1_176_000,
            actualCents: null,
            weddingVendorId: WV.caterer,
          },
          {
            id: BL.photo,
            orgId: org,
            weddingId: ID.wedding,
            category: 'Photography and film',
            label: 'Full-day photography',
            estimateCents: 320_000,
            actualCents: 320_000,
            weddingVendorId: WV.photo,
          },
          {
            id: BL.flowers,
            orgId: org,
            weddingId: ID.wedding,
            category: 'Flowers and styling',
            label: 'Ceremony and chapel flowers',
            estimateCents: 220_000,
            actualCents: 248_000,
            weddingVendorId: WV.flowers,
          },
          {
            id: BL.dj,
            orgId: org,
            weddingId: ID.wedding,
            category: 'Music and entertainment',
            label: 'DJ, 21:00 to 02:00',
            estimateCents: 180_000,
            actualCents: null,
            weddingVendorId: WV.dj,
          },
          {
            id: BL.fee,
            orgId: org,
            weddingId: ID.wedding,
            category: 'Planning fee',
            label: 'Planning fee',
            estimateCents: 450_000,
            actualCents: null,
            weddingVendorId: null,
          },
        ])
        .onConflictDoNothing()

      const paid = (d: string) => new Date(`${d}T09:00:00Z`)
      // [budget line, due date, cents, paid date | null]
      const pay: [string, string, number, string | null][] = [
        [BL.venue, '2027-01-10', 490_000, '2027-01-08'],
        [BL.venue, '2027-07-17', 350_000, null],
        [BL.dinner, '2027-04-30', 504_000, '2027-04-29'],
        [BL.dinner, '2027-07-24', 672_000, null],
        [BL.photo, '2027-02-01', 140_000, '2027-02-01'],
        [BL.photo, '2027-07-10', 180_000, null],
        [BL.flowers, '2027-06-26', 248_000, null],
        [BL.dj, '2027-03-15', 80_000, '2027-03-15'],
        [BL.dj, '2027-07-21', 100_000, null],
        [BL.fee, '2027-01-10', 225_000, '2027-01-10'],
        [BL.fee, '2027-07-30', 225_000, null],
      ]
      await tx
        .insert(payments)
        .values(
          pay.map(([budgetLineId, dueOn, amountCents, paidOn], i) => ({
            id: sid('88880000', i + 1),
            orgId: org,
            weddingId: ID.wedding,
            budgetLineId,
            dueOn,
            amountCents,
            paidAt: paidOn ? paid(paidOn) : null,
          })),
        )
        .onConflictDoNothing()

      // ---- files and moodboard ---------------------------------------------------------
      const file = (
        n: number,
        weddingId: string,
        kind: 'file' | 'image',
        name: string,
        sizeBytes: number,
        mime: string,
        visibility: 'shared' | 'internal',
      ) => ({
        id: sid('12120000', n),
        orgId: org,
        weddingId,
        kind,
        name,
        storageKey: `seed/${org}/${weddingId}/${n}`,
        sizeBytes,
        mime,
        visibility,
        uploadedBy: me.id,
      })
      await tx
        .insert(files)
        .values([
          file(
            1,
            ID.wedding,
            'file',
            'Venue contract, Kasteel van Brasschaat.pdf',
            412_000,
            'application/pdf',
            'shared',
          ),
          file(
            2,
            ID.wedding,
            'file',
            'Catering quote, 140 covers.pdf',
            208_000,
            'application/pdf',
            'shared',
          ),
          file(
            3,
            ID.wedding,
            'file',
            'Rentals quote comparison.xlsx',
            62_000,
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'internal',
          ),
          file(
            4,
            ID.wedding,
            'image',
            'Chapel aisle, narrow ribbon.jpg',
            1_800_000,
            'image/jpeg',
            'shared',
          ),
          file(
            5,
            ID.wedding,
            'image',
            'Table No. 4, taper candles.jpg',
            1_400_000,
            'image/jpeg',
            'shared',
          ),
          file(
            6,
            ID.wedding2,
            'file',
            'Farm contract draft.pdf',
            150_000,
            'application/pdf',
            'internal',
          ),
        ])
        .onConflictDoNothing()

      // ---- a signed link, TABLE ONLY: the link principal is S10's ------------------------
      await tx
        .insert(vendorLinks)
        .values({
          id: sid('13130000', 1),
          orgId: org,
          weddingId: ID.wedding,
          weddingVendorId: WV.photo,
          // Not a real token's hash: nothing can present a token that hashes to this, so the
          // row exists to be listed and revoked, not to be used.
          tokenHash: 'seed-not-a-real-token-hash-photo',
          expiresAt: new Date(Date.parse('2027-08-31T00:00:00Z')),
        })
        .onConflictDoNothing()

      // ---- templates -------------------------------------------------------------------
      const T = { full: sid('14140000', 1), dayof: sid('14140000', 2) }
      await tx
        .insert(taskTemplates)
        .values([
          {
            id: T.full,
            orgId: org,
            name: 'Full planning, 12 months',
            description: 'The house standard. Starts at T-365 and ends at T-0.',
          },
          {
            id: T.dayof,
            orgId: org,
            name: 'Day-of coordination',
            description: 'Two weeks out only.',
          },
        ])
        .onConflictDoNothing()
      const items: [string, string, number, 'shared' | 'internal', 'planner' | 'couple'][] = [
        [T.full, 'Set the budget ceiling with the couple', -365, 'shared', 'planner'],
        [T.full, 'Sign the venue contract', -300, 'shared', 'planner'],
        [T.full, 'Agree the planning fee schedule', -240, 'internal', 'planner'],
        [T.full, 'Send the save-the-dates', -150, 'shared', 'couple'],
        [T.full, 'Collect dietary requirements', -30, 'shared', 'couple'],
        [T.full, 'Confirm the final headcount', -21, 'shared', 'planner'],
        [T.dayof, 'Print the run sheets', -10, 'shared', 'planner'],
        [T.dayof, 'Confirm arrival times with every vendor', -7, 'shared', 'planner'],
      ]
      await tx
        .insert(templateItems)
        .values(
          items.map(([templateId, title, dueOffsetDays, visibility, assigneeRole], i) => ({
            id: sid('15150000', i + 1),
            orgId: org,
            templateId,
            title,
            dueOffsetDays,
            visibility,
            assigneeRole,
            position: i,
          })),
        )
        .onConflictDoNothing()

      // ---- tasks (S2's table, seeded so the checklist has something to show) ------------
      type Task = [
        title: string,
        status: 'open' | 'in_progress' | 'done',
        visibility: 'shared' | 'internal',
        offset: number,
        assignee: string | null,
        role: 'planner' | 'couple' | null,
      ]
      const taskRows: Task[] = [
        ['Set the budget ceiling with the couple', 'done', 'shared', -365, me.id, 'planner'],
        ['Sign the venue contract', 'done', 'shared', -300, me.id, 'planner'],
        ['Book the photographer', 'done', 'shared', -270, me.id, 'planner'],
        ['Agree the planning fee schedule', 'done', 'internal', -240, me.id, 'planner'],
        ['Send the save-the-dates', 'in_progress', 'shared', -150, null, 'couple'],
        ['Menu choice confirmed', 'open', 'shared', -90, null, 'couple'],
        ['Chase the late florist invoice', 'open', 'internal', -35, member.id, 'planner'],
        ['Confirm the final headcount', 'open', 'shared', -21, member.id, 'planner'],
        ['Print the run sheets', 'open', 'shared', -10, me.id, 'planner'],
        ['Confirm arrival times with every vendor', 'open', 'shared', -7, me.id, 'planner'],
      ]
      await tx
        .insert(tasks)
        .values(
          taskRows.map(
            ([title, status, visibility, dueOffsetDays, assigneeUserId, assigneeRole], i) => ({
              id: sid('11110001', i + 1),
              orgId: org,
              weddingId: ID.wedding,
              title,
              status,
              visibility,
              dueOffsetDays,
              dueAt: dueAt(WEDDING.weddingDate, dueOffsetDays),
              assigneeUserId,
              assigneeRole,
              createdBy: me.id,
              completedAt: status === 'done' ? dueAt(WEDDING.weddingDate, dueOffsetDays - 2) : null,
            }),
          ),
        )
        .onConflictDoNothing()
      await tx
        .insert(tasks)
        .values([
          {
            id: sid('11110001', 101),
            orgId: org,
            weddingId: ID.wedding2,
            title: 'Visit the farm with the couple',
            status: 'open',
            visibility: 'shared',
            dueOffsetDays: -200,
            dueAt: dueAt(WEDDING2.weddingDate, -200),
            assigneeUserId: me.id,
            assigneeRole: 'planner',
            createdBy: me.id,
          },
          {
            id: sid('11110001', 102),
            orgId: org,
            weddingId: ID.wedding2,
            title: 'Compare two caterer quotes',
            status: 'open',
            visibility: 'internal',
            dueOffsetDays: -150,
            dueAt: dueAt(WEDDING2.weddingDate, -150),
            assigneeUserId: me.id,
            assigneeRole: 'planner',
            createdBy: me.id,
          },
        ])
        .onConflictDoNothing()

      // Comments inherit org, wedding and visibility from their task by trigger (0001), so
      // the values given here for those are overwritten -- the second lands `internal`.
      await tx
        .insert(taskComments)
        .values([
          {
            id: sid('11110002', 1),
            orgId: org,
            weddingId: ID.wedding,
            taskId: sid('11110001', 5),
            authorUserId: me.id,
            body: 'Proofs are with the printer; couple to approve the wording.',
          },
          {
            id: sid('11110002', 2),
            orgId: org,
            weddingId: ID.wedding,
            taskId: sid('11110001', 7),
            authorUserId: member.id,
            body: 'Second reminder sent. Roos says the invoice is with her accountant.',
          },
        ])
        .onConflictDoNothing()
    })

    console.info(
      `\n  Seeded.\n` +
        `    owner     ${email}\n` +
        `    member    ${memberEmail}  (assigned to ${WEDDING.coupleDisplayName} only)\n` +
        `    org       ${ORG.name}\n` +
        `    weddings  ${WEDDING.coupleDisplayName}, ${WEDDING.weddingDate}  (full sample data)\n` +
        `              ${WEDDING2.coupleDisplayName}, ${WEDDING2.weddingDate}  (sparse)\n\n` +
        `  Sign in at http://app.guestnote.localhost:3000/login as either address.\n`,
    )
  } finally {
    await pool.end()
  }
}

await main()
