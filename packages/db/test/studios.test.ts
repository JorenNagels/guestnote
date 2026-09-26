import { createHash } from 'node:crypto'
import { Pool } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { orgsWithTrialEnding } from '../src/cron.ts'
import {
  acceptInvitationById,
  billingProfile,
  createStudio,
  myPendingInvitations,
  renameStudio,
  resolveMemberships,
  resolveVendorLinkByHash,
  saveInvoiceDetails,
  seedTemplates,
  setLogoKey,
  studioSettings,
  trialFacts,
} from '../src/repos/index.ts'
import {
  asNobody,
  asPrincipal,
  connect,
  F,
  type Harness,
  reseed,
  SEED_URL,
  seedExec,
} from './harness.ts'

/**
 * Migration 0010 (spec 0005): `create_studio`, `my_pending_invitations`,
 * `accept_invitation_by_id`, `orgs_with_trial_ending`, `resolve_vendor_link`'s `logo_key`, and
 * `repos/studios.ts` / `seedTemplates` on top of them.
 *
 * Every call goes through `app_user`, as production does; fixtures are written through the
 * seed role. Each refusal is asserted as a value AND as nothing written, because a function
 * that answers 'already_owner' after inserting the org is the bug this file exists for.
 */

let h: Harness

beforeAll(() => {
  // Four connections, so the double-submit case below really runs two transactions at once.
  h = connect(4)
})
afterAll(async () => {
  await h.end()
})
beforeEach(async () => {
  await reseed()
})

const NEWBIE = '01900000-0000-7000-8000-0000000000a1'
const NEWBIE_EMAIL = 'Lotte@Studio-Noord.test'
const hashOf = (token: string) => createHash('sha256').update(token, 'utf8').digest('hex')

async function addUser(id: string, email: string, name: string | null = null) {
  await seedExec('insert into users (id, email, name) values ($1, $2, $3)', [id, email, name])
}

/** Every org `userId` owns, straight from the tables through the seed-free app path. */
const ownedOrgs = async (userId: string) =>
  (
    await asPrincipal(
      h,
      { userId },
      "select org_id::text as id from org_members where role = 'owner' order by 1",
    )
  ).map((r) => r.id as string)

/**
 * A read through the SEED role, for asserting what a refusal did NOT write. It has to be the
 * privileged role: `app_user` with no GUCs sees no organisation at all, so a count through it
 * would be zero whether or not a row was written.
 */
async function seedRows(sqlText: string, values: unknown[] = []) {
  const pool = new Pool({ connectionString: SEED_URL, max: 1 })
  try {
    return (await pool.query(sqlText, values)).rows as Record<string, unknown>[]
  } finally {
    await pool.end()
  }
}

const orgCount = async () =>
  Number((await seedRows('select count(*)::int as n from organizations'))[0]?.n)

const orgRow = async (orgId: string) =>
  (await seedRows('select * from organizations where id = $1', [orgId]))[0]

const createRaw = (actor: string | null, userId: string, slug: string, name = 'Studio Noord') =>
  asPrincipal(
    h,
    actor ? { userId: actor } : {},
    'select * from create_studio(gen_random_uuid(), $1, $2, $3, $4)',
    [userId, name, slug, 'Lotte'],
  ).then((rows) => rows[0] as { outcome: string; created_org_id: string | null })

describe('create_studio', () => {
  it('creates a planner org with the caller as owner and sets their name, in one go', async () => {
    await addUser(NEWBIE, NEWBIE_EMAIL)
    const before = await orgCount()

    const out = await createStudio(h.db, NEWBIE, {
      name: '  Studio Noord ',
      slugBase: 'studio-noord',
      ownerName: ' Lotte Peeters ',
    })
    expect(out).toMatchObject({ ok: true, value: { slug: 'studio-noord' } })
    if (!out.ok) return

    expect(await orgCount()).toBe(before + 1)
    expect(await orgRow(out.value.orgId)).toMatchObject({
      name: 'Studio Noord',
      slug: 'studio-noord',
      type: 'planner',
      logo_key: null,
      billing_status: null,
    })
    expect(await ownedOrgs(NEWBIE)).toEqual([out.value.orgId])
    const m = await resolveMemberships(h.db, NEWBIE)
    expect(m.orgs).toEqual([{ orgId: out.value.orgId, role: 'owner' }])
    const [me] = await asPrincipal(h, { userId: NEWBIE }, 'select name from users where id = $1', [
      NEWBIE,
    ])
    // `users` carries no RLS (UNSCOPED_TABLES), so this read is not what is under test.
    expect(me).toMatchObject({ name: 'Lotte Peeters' })
  })

  it('refuses a user who already owns a live studio, and writes nothing', async () => {
    const before = await orgCount()
    const out = await createStudio(h.db, F.staffA, {
      name: 'Second studio',
      slugBase: 'second-studio',
      ownerName: 'X',
    })
    expect(out).toEqual({ ok: false, reason: 'alreadyOwner' })
    expect(await orgCount()).toBe(before)
    expect(await ownedOrgs(F.staffA)).toEqual([F.orgA])
    const [me] = await asPrincipal(
      h,
      { userId: F.staffA },
      'select name from users where id = $1',
      [F.staffA],
    )
    expect(me).toMatchObject({ name: null })
  })

  it('lets an owner whose only studio was soft-deleted start again', async () => {
    await seedExec('update organizations set deleted_at = now() where id = $1', [F.orgA])
    const out = await createStudio(h.db, F.staffA, {
      name: 'Studio A again',
      slugBase: 'org-a',
      ownerName: '',
    })
    // The dead org's slug is free again: the unique index is partial on `deleted_at is null`.
    expect(out).toMatchObject({ ok: true, value: { slug: 'org-a' } })
  })

  it('lets an admin or member of someone else studio create their own', async () => {
    // memberA is a `member` of org A; staffDual is `admin` of A but already OWNS org C.
    const out = await createStudio(h.db, F.memberA, {
      name: 'Eigen zaak',
      slugBase: 'eigen-zaak',
      ownerName: 'Mira',
    })
    expect(out.ok).toBe(true)
    const dual = await createStudio(h.db, F.staffDual, {
      name: 'Third',
      slugBase: 'third',
      ownerName: '',
    })
    expect(dual).toEqual({ ok: false, reason: 'alreadyOwner' })
  })

  it('suffixes a slug taken by a live org: -2, then -3', async () => {
    await addUser(NEWBIE, NEWBIE_EMAIL)
    const first = await createStudio(h.db, NEWBIE, {
      name: 'A',
      slugBase: 'org-a',
      ownerName: '',
    })
    expect(first).toMatchObject({ ok: true, value: { slug: 'org-a-2' } })

    const out = await createStudio(h.db, F.memberA, {
      name: 'A',
      slugBase: 'org-a',
      ownerName: '',
    })
    expect(out).toMatchObject({ ok: true, value: { slug: 'org-a-3' } })
  })

  it('refuses a slug base that is not a DNS label, a blank name, and a name over 80', async () => {
    await addUser(NEWBIE, NEWBIE_EMAIL)
    const before = await orgCount()
    for (const [name, slugBase] of [
      ['Studio', 'Has Spaces'],
      ['Studio', ''],
      ['Studio', '-leading'],
      ['   ', 'blank-name'],
      ['x'.repeat(81), 'long-name'],
    ] as const) {
      expect(await createStudio(h.db, NEWBIE, { name, slugBase, ownerName: '' })).toEqual({
        ok: false,
        reason: 'invalid',
      })
    }
    expect(await orgCount()).toBe(before)
    expect(
      await createStudio(h.db, NEWBIE, { name: 'x'.repeat(80), slugBase: 'ok', ownerName: '' }),
    ).toMatchObject({ ok: true })
  })

  it('keeps the existing display name when the owner name is blank', async () => {
    await addUser(NEWBIE, NEWBIE_EMAIL, 'From Google')
    await createStudio(h.db, NEWBIE, { name: 'S', slugBase: 'sss', ownerName: '   ' })
    const [me] = await asPrincipal(h, { userId: NEWBIE }, 'select name from users where id = $1', [
      NEWBIE,
    ])
    expect(me).toMatchObject({ name: 'From Google' })
  })

  it('is forbidden when app.user_id is not the user it creates for, and writes nothing', async () => {
    await addUser(NEWBIE, NEWBIE_EMAIL)
    const before = await orgCount()
    expect((await createRaw(F.staffB, NEWBIE, 'hijack')).outcome).toBe('forbidden')
    expect((await createRaw(null, NEWBIE, 'hijack')).outcome).toBe('forbidden')
    expect(await orgCount()).toBe(before)
    expect(await ownedOrgs(NEWBIE)).toEqual([])
  })

  it('creates exactly one studio from a double submit, when the two really overlap', async () => {
    // Two held transactions rather than `Promise.all`: measured 2026-09-24, two
    // `createStudio` calls through `Promise.all` did not overlap on the local container, so
    // removing the `for update` on the users row left that version green. Here the first
    // call's transaction is still open when the second starts, which is the race.
    await addUser(NEWBIE, NEWBIE_EMAIL)
    const call = 'select outcome from create_studio(gen_random_uuid(), $1, $2, $3, $4)'
    const args = [NEWBIE, 'Twice', 'twice', '']
    const first = await h.pool.connect()
    const second = await h.pool.connect()
    try {
      for (const c of [first, second]) {
        await c.query('begin')
        await c.query("select set_config('app.user_id', $1, true)", [NEWBIE])
      }
      const a = await first.query(call, args)
      let settled = false
      const pendingB = second.query(call, args).then((r) => {
        settled = true
        return r
      })
      await new Promise((resolve) => setTimeout(resolve, 300))
      expect(settled, 'the second call did not wait for the first').toBe(false)
      await first.query('commit')
      const b = await pendingB
      await second.query('commit')

      expect(a.rows[0]).toEqual({ outcome: 'created' })
      // Without the lock the second waits on the slug index instead, then takes `twice-2`.
      expect(b.rows[0]).toEqual({ outcome: 'already_owner' })
      expect(await ownedOrgs(NEWBIE)).toHaveLength(1)
    } finally {
      await first.query('rollback').catch(() => {})
      await second.query('rollback').catch(() => {})
      first.release()
      second.release()
    }
  })
})

async function addInvitation(o: {
  token: string
  email: string
  org?: string
  wedding?: string | null
  role?: string
  expiresIn?: string
  accepted?: boolean
}) {
  await seedExec(
    `insert into invitations
       (id, org_id, wedding_id, email, role, token_hash, expires_at, accepted_at, invited_by)
     values (gen_random_uuid(), $1, $2, $3, $4, $5, now() + $6::interval,
             case when $7::boolean then now() else null end, $8)`,
    [
      o.org ?? F.orgA,
      o.wedding ?? null,
      o.email,
      o.role ?? 'member',
      hashOf(o.token),
      o.expiresIn ?? '7 days',
      o.accepted ?? false,
      F.staffA,
    ],
  )
}

const invitationId = async (token: string) =>
  (await seedRows('select id from invitations where token_hash = $1', [hashOf(token)]))[0]
    ?.id as string

describe('my_pending_invitations', () => {
  beforeEach(async () => {
    await addUser(NEWBIE, NEWBIE_EMAIL)
    await seedExec("update users set name = 'Ilse' where id = $1", [F.staffA])
  })

  it("returns the caller's own pending invitations, matched case-insensitively", async () => {
    await addInvitation({ token: 'mine-staff', email: 'lotte@studio-noord.test', role: 'admin' })
    await addInvitation({
      token: 'mine-couple',
      email: 'LOTTE@studio-noord.test',
      wedding: F.weddingA1,
      role: 'couple',
    })

    const rows = await myPendingInvitations(h.db, NEWBIE)
    expect(rows).toHaveLength(2)
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          orgId: F.orgA,
          orgName: 'Studio A',
          weddingId: null,
          weddingName: null,
          role: 'admin',
          inviterName: 'Ilse',
        }),
        expect.objectContaining({
          weddingId: F.weddingA1,
          weddingName: 'A One',
          role: 'couple',
        }),
      ]),
    )
    expect(rows[0]?.expiresAt).toBeInstanceOf(Date)
  })

  it('leaves out expired, accepted, dead-org and dead-wedding invitations', async () => {
    const email = NEWBIE_EMAIL
    await addInvitation({ token: 'live', email })
    await addInvitation({ token: 'old', email, expiresIn: '-1 minute' })
    await addInvitation({ token: 'used', email, accepted: true })
    await addInvitation({ token: 'dead-org', email, org: F.orgB })
    await addInvitation({ token: 'dead-wed', email, wedding: F.weddingA2, role: 'couple' })
    // A wedding of org B named on an org-A invitation: no FK stops it, the function must.
    await addInvitation({ token: 'cross', email, wedding: F.weddingB1, role: 'couple' })
    await seedExec('update organizations set deleted_at = now() where id = $1', [F.orgB])
    await seedExec('update weddings set deleted_at = now() where id = $1', [F.weddingA2])

    const rows = await myPendingInvitations(h.db, NEWBIE)
    expect(rows.map((r) => r.invitationId)).toEqual([await invitationId('live')])
  })

  it("never shows another user's invitations, and shows nothing to a mismatched caller", async () => {
    await addInvitation({ token: 'someone-else', email: 'someone@else.test' })
    await addInvitation({ token: 'mine', email: NEWBIE_EMAIL })

    // The fixture's own staff invitation (newstaff@a.test) plus someone-else exist...
    expect(await myPendingInvitations(h.db, F.staffA)).toEqual([])
    const mine = await myPendingInvitations(h.db, NEWBIE)
    expect(mine.map((r) => r.invitationId)).toEqual([await invitationId('mine')])

    // ...and naming NEWBIE while app.user_id is somebody else returns nothing at all.
    const hijack = await asPrincipal(
      h,
      { userId: F.staffB },
      'select * from my_pending_invitations($1)',
      [NEWBIE],
    )
    expect(hijack).toEqual([])
    expect(await asNobody(h, 'select * from my_pending_invitations($1)', [NEWBIE])).toEqual([])
  })
})

describe('accept_invitation_by_id', () => {
  beforeEach(async () => {
    await addUser(NEWBIE, NEWBIE_EMAIL)
  })

  it('accepts by id: membership written, token spent', async () => {
    await addInvitation({ token: 'join', email: NEWBIE_EMAIL, role: 'admin' })
    const id = await invitationId('join')

    expect(await acceptInvitationById(h.db, id, NEWBIE)).toEqual({
      outcome: 'accepted',
      orgId: F.orgA,
      weddingId: null,
      role: 'admin',
    })
    expect((await resolveMemberships(h.db, NEWBIE)).orgs).toEqual([
      { orgId: F.orgA, role: 'admin' },
    ])
    expect(await myPendingInvitations(h.db, NEWBIE)).toEqual([])
    expect(await acceptInvitationById(h.db, id, NEWBIE)).toEqual({ outcome: 'already_accepted' })
  })

  it("refuses an invitation addressed to someone else as 'unknown', and writes nothing", async () => {
    await addInvitation({ token: 'not-yours', email: 'someone@else.test', role: 'admin' })
    const id = await invitationId('not-yours')

    expect(await acceptInvitationById(h.db, id, NEWBIE)).toEqual({ outcome: 'unknown' })
    expect((await resolveMemberships(h.db, NEWBIE)).orgs).toEqual([])
    // Not spent: the real invitee can still accept it.
    const [row] = await asNobody(h, 'select status from resolve_invitation($1)', [
      hashOf('not-yours'),
    ])
    expect(row).toMatchObject({ status: 'pending' })
  })

  // This cannot tell `accept_invitation_by_id`'s own `app.user_id` check from the one inside
  // `accept_invitation`, which it hands on to: deleting the first leaves this green (measured
  // 2026-09-24, mutation sweep). Both are kept -- the first means the by-id lookup never runs
  // for a caller who is not the user named -- but only the pair is under test here.
  it('is forbidden when app.user_id is not the user it accepts for', async () => {
    await addInvitation({ token: 'join2', email: NEWBIE_EMAIL })
    const id = await invitationId('join2')
    const [row] = await asPrincipal(
      h,
      { userId: F.staffB },
      'select * from accept_invitation_by_id($1, $2)',
      [id, NEWBIE],
    )
    expect(row).toMatchObject({ outcome: 'forbidden' })
    expect((await resolveMemberships(h.db, NEWBIE)).orgs).toEqual([])
  })

  it("passes accept_invitation's own refusals through: expired", async () => {
    await addInvitation({ token: 'late', email: NEWBIE_EMAIL, expiresIn: '-1 hour' })
    expect(await acceptInvitationById(h.db, await invitationId('late'), NEWBIE)).toEqual({
      outcome: 'expired',
    })
    expect(
      await acceptInvitationById(h.db, '01900000-0000-7000-8000-00000000dead', NEWBIE),
    ).toEqual({ outcome: 'unknown' })
  })
})

describe('orgs_with_trial_ending', () => {
  // Org A created 2026-09-10 (Brussels), billing from 2026-10-01: the trial counts from the
  // later of the two, so it ends 2026-11-01. Org B was created after billing started.
  beforeEach(async () => {
    await seedExec("update organizations set created_at = '2026-09-10 12:00+02' where id = $1", [
      F.orgA,
    ])
    await seedExec("update organizations set created_at = '2026-10-05 23:30+02' where id = $1", [
      F.orgB,
    ])
    await seedExec("update organizations set created_at = '2026-01-01 00:00+01' where id = $1", [
      F.orgC,
    ])
  })

  it('computes the end from max(created_at, billing start) + 1 month, with the owner email', async () => {
    expect(await orgsWithTrialEnding(h.db, '2026-11-01', '2026-10-01')).toEqual([
      // org C was also created before billing: same end day, its owner is staffDual.
      { orgId: F.orgA, orgName: 'Studio A', trialEndsOn: '2026-11-01', ownerEmail: 'staff@a.test' },
      {
        orgId: F.orgC,
        orgName: 'Atelier Zero',
        trialEndsOn: '2026-11-01',
        ownerEmail: 'dual@a.test',
      },
    ])
    expect(await orgsWithTrialEnding(h.db, '2026-11-05', '2026-10-01')).toEqual([
      expect.objectContaining({ orgId: F.orgB, trialEndsOn: '2026-11-05' }),
    ])
  })

  it('reads the creation day in Europe/Brussels, not UTC', async () => {
    // 2026-10-05 23:30 in Brussels is 21:30 UTC the same day, so no difference there;
    // 00:30 on the 6th in Brussels is still the 5th in UTC. Brussels must win.
    await seedExec("update organizations set created_at = '2026-10-06 00:30+02' where id = $1", [
      F.orgB,
    ])
    expect(await orgsWithTrialEnding(h.db, '2026-11-06', '2026-10-01')).toEqual([
      expect.objectContaining({ orgId: F.orgB }),
    ])
  })

  it('lets trial_ends_at override, and leaves out paying, deleted and non-planner orgs', async () => {
    await seedExec("update organizations set trial_ends_at = '2026-12-24 23:59+01' where id = $1", [
      F.orgA,
    ])
    await seedExec("update organizations set billing_status = 'active' where id = $1", [F.orgC])
    expect(await orgsWithTrialEnding(h.db, '2026-11-01', '2026-10-01')).toEqual([])
    expect(await orgsWithTrialEnding(h.db, '2026-12-24', '2026-10-01')).toEqual([
      expect.objectContaining({ orgId: F.orgA }),
    ])

    await seedExec(
      "update organizations set billing_status = 'trialing', type = 'venue' where id = $1",
      [F.orgC],
    )
    expect(await orgsWithTrialEnding(h.db, '2026-11-01', '2026-10-01')).toEqual([])
    await seedExec("update organizations set type = 'planner', deleted_at = now() where id = $1", [
      F.orgC,
    ])
    expect(await orgsWithTrialEnding(h.db, '2026-11-01', '2026-10-01')).toEqual([])
  })

  it('returns nothing when billing is off (no start date)', async () => {
    const rows = await asNobody(h, 'select * from orgs_with_trial_ending($1, null)', ['2026-02-01'])
    expect(rows).toEqual([])
    // ...while the same day with a start date does find org C, so the line above is not an
    // empty answer by coincidence.
    expect(await orgsWithTrialEnding(h.db, '2026-02-01', '2025-01-01')).toEqual([
      expect.objectContaining({ orgId: F.orgC }),
    ])
  })
})

describe('resolve_vendor_link returns the studio logo key', () => {
  it('null by default, the key once set', async () => {
    expect((await resolveVendorLinkByHash(h.db, 'hash-link-a1'))?.logoKey).toBeNull()
    await seedExec('update organizations set logo_key = $2 where id = $1', [
      F.orgA,
      `${F.orgA}/brand/logo-1`,
    ])
    expect(await resolveVendorLinkByHash(h.db, 'hash-link-a1')).toMatchObject({
      orgName: 'Studio A',
      status: 'live',
      logoKey: `${F.orgA}/brand/logo-1`,
    })
  })
})

describe('the 0010 functions are locked down', () => {
  it.each([
    'create_studio',
    'my_pending_invitations',
    'accept_invitation_by_id',
    'orgs_with_trial_ending',
    'resolve_vendor_link',
  ])('%s is SECURITY DEFINER, search_path pinned, not executable by PUBLIC', async (name) => {
    const rows = await asNobody(
      h,
      `select prosecdef, array_to_string(proconfig, ',') as config, proacl::text as acl,
              has_function_privilege('app_user', p.oid, 'execute') as app_can
         from pg_proc p where proname = $1`,
      [name],
    )
    expect(rows).toHaveLength(1)
    const c = rows[0] as {
      prosecdef: boolean
      config: string | null
      acl: string | null
      app_can: boolean
    }
    expect(c.prosecdef, 'not SECURITY DEFINER').toBe(true)
    expect(c.config, 'search_path is not pinned').toContain('search_path=""')
    expect(c.acl ?? '', 'PUBLIC can execute this').not.toMatch(/(^\{|,)=X\//)
    expect(c.app_can, 'app_user cannot execute this').toBe(true)
  })
})

describe('repos/studios.ts', () => {
  // The outsider half cannot tell `studioSettings`' early membership check from 0005's
  // `org_read_for_members` policy, which filters the row anyway: deleting the check leaves this
  // green (mutation sweep, 2026-09-24). The check saves a round trip; the policy is the line.
  it('studioSettings: any staff member reads name and logo; an outsider reads nothing', async () => {
    await seedExec("update organizations set logo_key = 'k' where id = $1", [F.orgA])
    const member = await resolveMemberships(h.db, F.memberA)
    expect(await studioSettings(h.db, member, F.orgA)).toEqual({
      id: F.orgA,
      name: 'Studio A',
      logoKey: 'k',
    })
    const other = await resolveMemberships(h.db, F.staffB)
    expect(await studioSettings(h.db, other, F.orgA)).toBeNull()
  })

  it('trialFacts: any staff member reads the trial columns and nothing else', async () => {
    await seedExec(
      "update organizations set trial_ends_at = '2026-12-01T10:00:00Z', billing_status = 'active', billing_name = 'secret' where id = $1",
      [F.orgA],
    )
    const member = await resolveMemberships(h.db, F.memberA)
    const facts = await trialFacts(h.db, member, F.orgA)
    expect(facts).toEqual({
      type: 'planner',
      createdAt: expect.any(Date),
      trialEndsAt: new Date('2026-12-01T10:00:00Z'),
      billingStatus: 'active',
    })
    // The select list is the boundary: nothing else from the row reaches a member.
    expect(Object.keys(facts ?? {}).sort()).toEqual([
      'billingStatus',
      'createdAt',
      'trialEndsAt',
      'type',
    ])
    const other = await resolveMemberships(h.db, F.staffB)
    expect(await trialFacts(h.db, other, F.orgA)).toBeNull()
  })

  it('renameStudio: owner and admin rename, a member is refused and changes nothing', async () => {
    const member = await resolveMemberships(h.db, F.memberA)
    expect(await renameStudio(h.db, member, F.orgA, 'Hacked')).toEqual({
      ok: false,
      reason: 'forbidden',
    })
    const admin = await resolveMemberships(h.db, F.staffDual)
    expect(await renameStudio(h.db, admin, F.orgA, '  Studio Wit ')).toEqual({
      ok: true,
      value: null,
    })
    expect(await renameStudio(h.db, admin, F.orgA, '  ')).toEqual({ ok: false, reason: 'invalid' })
    expect((await orgRow(F.orgA))?.name).toBe('Studio Wit')
  })

  it('setLogoKey: saves, returns the key it replaced, refuses a key outside the org prefix', async () => {
    const owner = await resolveMemberships(h.db, F.staffA)
    const first = `${F.orgA}/brand/one`
    expect(await setLogoKey(h.db, owner, F.orgA, first)).toEqual({
      ok: true,
      value: { previous: null },
    })
    expect(await setLogoKey(h.db, owner, F.orgA, `${F.orgA}/brand/two`)).toEqual({
      ok: true,
      value: { previous: first },
    })
    expect(await setLogoKey(h.db, owner, F.orgA, `${F.orgB}/brand/x`)).toEqual({
      ok: false,
      reason: 'invalid',
    })
    expect(await setLogoKey(h.db, owner, F.orgA, `${F.orgA}/${F.weddingA1}/x`)).toEqual({
      ok: false,
      reason: 'invalid',
    })
    expect((await orgRow(F.orgA))?.logo_key).toBe(`${F.orgA}/brand/two`)
    const member = await resolveMemberships(h.db, F.memberA)
    expect(await setLogoKey(h.db, member, F.orgA, null)).toEqual({ ok: false, reason: 'forbidden' })
    expect(await setLogoKey(h.db, owner, F.orgA, null)).toMatchObject({ ok: true })
    expect((await orgRow(F.orgA))?.logo_key).toBeNull()
  })

  it('billingProfile and saveInvoiceDetails: owner and admin only, blanks stored as null', async () => {
    const member = await resolveMemberships(h.db, F.memberA)
    expect(await billingProfile(h.db, member, F.orgA)).toBeNull()
    expect(
      await saveInvoiceDetails(h.db, member, F.orgA, {
        billingName: 'x',
        billingEmail: null,
        vatNumber: null,
      }),
    ).toEqual({ ok: false, reason: 'forbidden' })

    const admin = await resolveMemberships(h.db, F.staffDual)
    expect(
      await saveInvoiceDetails(h.db, admin, F.orgA, {
        billingName: ' Studio A BV ',
        billingEmail: 'boekhouding@a.test',
        vatNumber: '  ',
      }),
    ).toEqual({ ok: true, value: null })
    expect(await billingProfile(h.db, admin, F.orgA)).toMatchObject({
      orgId: F.orgA,
      billingName: 'Studio A BV',
      billingEmail: 'boekhouding@a.test',
      vatNumber: null,
      billingStatus: null,
      billingCycle: null,
      trialEndsAt: null,
    })
    // Org A's admin is not org C's -- C's profile is untouched and A's principal reads only A.
    expect((await orgRow(F.orgC))?.billing_name).toBeNull()
  })
})

describe('seedTemplates', () => {
  const STARTERS = [
    {
      name: 'Volledige planning',
      description: '12 maanden',
      items: [
        {
          title: 'Locatie vastleggen',
          dueOffsetDays: -360,
          visibility: 'shared',
          assigneeRole: 'planner',
        },
        {
          title: 'Budget opstellen',
          dueOffsetDays: -350,
          visibility: 'internal',
          assigneeRole: 'planner',
        },
      ],
    },
    {
      name: 'Dagcoördinatie',
      description: null,
      items: [
        {
          title: 'Draaiboek delen',
          dueOffsetDays: -14,
          visibility: 'shared',
          assigneeRole: 'planner',
        },
      ],
    },
  ] as const

  it('writes every template and its items, in order, for the owner of a fresh studio', async () => {
    await addUser(NEWBIE, NEWBIE_EMAIL)
    const made = await createStudio(h.db, NEWBIE, { name: 'N', slugBase: 'nnn', ownerName: '' })
    if (!made.ok) throw new Error('fixture')
    const m = await resolveMemberships(h.db, NEWBIE)

    const out = await seedTemplates(h.db, m, made.value.orgId, STARTERS)
    expect(out.ok && out.value.ids).toHaveLength(2)
    const rows = await asPrincipal(
      h,
      { userId: NEWBIE, orgId: made.value.orgId, weddingRole: 'owner' },
      `select t.name, i.title, i.position from task_templates t
         join template_items i on i.template_id = t.id order by t.name, i.position`,
    )
    expect(rows).toEqual([
      { name: 'Dagcoördinatie', title: 'Draaiboek delen', position: 0 },
      { name: 'Volledige planning', title: 'Locatie vastleggen', position: 0 },
      { name: 'Volledige planning', title: 'Budget opstellen', position: 1 },
    ])
  })

  it('refuses a member, and an empty template, writing nothing', async () => {
    const member = await resolveMemberships(h.db, F.memberA)
    expect(await seedTemplates(h.db, member, F.orgA, STARTERS)).toEqual({
      ok: false,
      reason: 'forbidden',
    })
    const owner = await resolveMemberships(h.db, F.staffA)
    expect(
      await seedTemplates(h.db, owner, F.orgA, [
        ...STARTERS,
        { name: 'Empty', description: null, items: [] },
      ]),
    ).toEqual({ ok: false, reason: 'empty' })
    const count = await asPrincipal(
      h,
      { userId: F.staffA, orgId: F.orgA, weddingRole: 'owner' },
      'select count(*)::int as n from task_templates',
    )
    expect(count[0]).toMatchObject({ n: 1 })
  })
})
