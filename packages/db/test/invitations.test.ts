import { createHash } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { acceptInvitationByHash, resolveInvitationByHash } from '../src/repos/index.ts'
import { asNobody, asPrincipal, connect, F, type Harness, reseed, seedExec } from './harness.ts'

/**
 * Migration 0007's `resolve_invitation` and `accept_invitation`.
 *
 * Every call here goes through the APP role (`app_user`), the way production does, and the
 * fixture rows are written through the seed role, so a function that only worked because
 * its caller was privileged would fail here. Refusals are asserted as VALUES (the functions
 * raise nothing) and, for each one, that nothing was written: an accept that answers
 * 'expired' but still inserted the membership is the bug this file exists to catch.
 *
 * A fresh `reseed()` before every test, because accepting is a write to shared fixture
 * state and the file's order must not matter.
 */

let h: Harness

beforeAll(() => {
  h = connect()
})
afterAll(async () => {
  await h.end()
})
beforeEach(async () => {
  await reseed()
})

const hashOf = (token: string) => createHash('sha256').update(token, 'utf8').digest('hex')

// Users the base fixture does not have. Fixed ids so a failure names the actor.
const INVITEE = '01900000-0000-7000-8000-0000000000f1'
const STRANGER = '01900000-0000-7000-8000-0000000000f2'
const INVITEE_EMAIL = 'tom@studiowit.test'

async function addUser(id: string, email: string, name: string | null = null) {
  await seedExec('insert into users (id, email, name) values ($1, $2, $3)', [id, email, name])
}

type InviteOpts = {
  token: string
  email?: string
  org?: string
  wedding?: string | null
  role?: string
  /** A Postgres interval literal relative to now(); negative means already expired. */
  expiresIn?: string
  accepted?: boolean
  invitedBy?: string | null
}

async function addInvitation(o: InviteOpts) {
  await seedExec(
    `insert into invitations
       (id, org_id, wedding_id, email, role, token_hash, expires_at, accepted_at, invited_by)
     values (gen_random_uuid(), $1, $2, $3, $4, $5, now() + $6::interval,
             case when $7::boolean then now() else null end, $8)`,
    [
      o.org ?? F.orgA,
      o.wedding ?? null,
      o.email ?? INVITEE_EMAIL,
      o.role ?? 'admin',
      hashOf(o.token),
      o.expiresIn ?? '7 days',
      o.accepted ?? false,
      o.invitedBy ?? null,
    ],
  )
}

const resolve = (token: string) =>
  asNobody(h, 'select * from resolve_invitation($1)', [hashOf(token)])

/** Accept as `actor` (the GUC), naming `userId` -- which is the same thing in every honest call. */
const accept = async (token: string, userId: string, actor: string | null = userId) => {
  const rows = await asPrincipal(
    h,
    actor ? { userId: actor } : {},
    'select * from accept_invitation($1, $2)',
    [hashOf(token), userId],
  )
  return rows[0] as {
    outcome: string
    joined_org_id: string | null
    joined_wedding_id: string | null
    joined_role: string | null
  }
}

const orgRows = async (userId: string) =>
  (await asPrincipal(h, { userId }, 'select org_id, role from org_members order by org_id')).map(
    (r) => `${r.org_id}/${r.role}`,
  )

const weddingRows = async (userId: string) =>
  (await asPrincipal(h, { userId }, 'select wedding_id, role from wedding_members order by 1')).map(
    (r) => `${r.wedding_id}/${r.role}`,
  )

describe('resolve_invitation', () => {
  it('describes a pending staff invitation, with the inviter and the org name', async () => {
    await seedExec("update users set name = 'Ilse Verhoeven' where id = $1", [F.staffA])
    await addInvitation({ token: 't-pending', invitedBy: F.staffA })

    const [row] = await resolve('t-pending')
    expect(row).toMatchObject({
      org_id: F.orgA,
      org_name: 'Studio A',
      wedding_id: null,
      email: INVITEE_EMAIL,
      role: 'admin',
      inviter_name: 'Ilse Verhoeven',
      status: 'pending',
    })
  })

  it('reports expired from the database clock, and accepted ahead of expired', async () => {
    await addInvitation({ token: 't-old', expiresIn: '-1 day' })
    await addInvitation({ token: 't-used-old', expiresIn: '-1 day', accepted: true })
    await addInvitation({ token: 't-used', accepted: true })

    expect((await resolve('t-old'))[0]?.status).toBe('expired')
    expect((await resolve('t-used-old'))[0]?.status).toBe('accepted')
    expect((await resolve('t-used'))[0]?.status).toBe('accepted')
  })

  it('returns no row for an unknown token, and for a revoked one (a deleted row)', async () => {
    expect(await resolve('never-issued')).toEqual([])

    await addInvitation({ token: 't-revoked' })
    expect(await resolve('t-revoked')).toHaveLength(1)
    await seedExec('delete from invitations where token_hash = $1', [hashOf('t-revoked')])
    expect(await resolve('t-revoked')).toEqual([])
  })

  it('returns no row once the organisation has been soft-deleted', async () => {
    await addInvitation({ token: 't-orphan' })
    await seedExec('update organizations set deleted_at = now() where id = $1', [F.orgA])
    expect(await resolve('t-orphan')).toEqual([])
  })

  it('carries the wedding id of a wedding invitation', async () => {
    await addInvitation({ token: 't-couple', wedding: F.weddingA1, role: 'couple' })
    expect((await resolve('t-couple'))[0]).toMatchObject({ wedding_id: F.weddingA1 })
  })

  it('is the ONLY way to reach the row: the app role reads no invitation with no principal', async () => {
    await addInvitation({ token: 't-door' })
    const direct = await asNobody(h, 'select count(*)::int as n from invitations')
    expect(direct[0]).toMatchObject({ n: 0 })
    // ...while the function, called the same way, finds it. Without this the line above
    // would also pass on an empty table.
    expect(await resolve('t-door')).toHaveLength(1)
  })
})

describe('the functions are locked down', () => {
  const catalog = async (name: string) =>
    (
      await asNobody(
        h,
        `select prosecdef, array_to_string(proconfig, ',') as config, proacl::text as acl,
                has_function_privilege('app_user', p.oid, 'execute') as app_can
           from pg_proc p where proname = $1`,
        [name],
      )
    )[0] as { prosecdef: boolean; config: string | null; acl: string | null; app_can: boolean }

  it.each(['resolve_invitation', 'accept_invitation'])(
    '%s is SECURITY DEFINER with a pinned search_path, and not executable by PUBLIC',
    async (name) => {
      const c = await catalog(name)
      expect(c.prosecdef, 'not SECURITY DEFINER').toBe(true)
      // An empty search_path is stored as `search_path=""`.
      expect(c.config, 'search_path is not pinned').toContain('search_path=""')
      // A `=X/owner` entry is PUBLIC. Functions get one by default unless it is revoked.
      expect(c.acl ?? '', 'PUBLIC can execute this').not.toMatch(/(^\{|,)=X\//)
      expect(c.app_can, 'app_user cannot execute this').toBe(true)
    },
  )
})

describe('accept_invitation: the accepted path', () => {
  it('writes the org_members row from the invitation, spends the token, in one go', async () => {
    await addUser(INVITEE, INVITEE_EMAIL)
    await addInvitation({ token: 't-ok', role: 'admin', invitedBy: F.staffA })

    const out = await accept('t-ok', INVITEE)
    expect(out).toEqual({
      outcome: 'accepted',
      joined_org_id: F.orgA,
      joined_wedding_id: null,
      joined_role: 'admin',
    })
    expect(await orgRows(INVITEE)).toEqual([`${F.orgA}/admin`])
    expect((await resolve('t-ok'))[0]?.status).toBe('accepted')
  })

  it('compares the two email addresses case-insensitively', async () => {
    await addUser(INVITEE, 'tom@studiowit.test')
    await addInvitation({ token: 't-case', email: 'Tom@StudioWit.TEST' })
    expect((await accept('t-case', INVITEE)).outcome).toBe('accepted')
  })

  it('a wedding invitation writes wedding_members and NEVER org_members', async () => {
    // The whole design (research/07 section 4b, CLAUDE.md invariant 3): an org_members row
    // makes a principal org-wide staff, which is how a couple would read the planner's book.
    await addUser(INVITEE, INVITEE_EMAIL)
    await addInvitation({ token: 't-couple', wedding: F.weddingA1, role: 'couple' })

    const out = await accept('t-couple', INVITEE)
    expect(out).toMatchObject({
      outcome: 'accepted',
      joined_org_id: F.orgA,
      joined_wedding_id: F.weddingA1,
      joined_role: 'couple',
    })
    expect(await weddingRows(INVITEE)).toEqual([`${F.weddingA1}/couple`])
    expect(await orgRows(INVITEE), 'a wedding invitation enrolled the couple as staff').toEqual([])
  })

  it('does not demote an existing membership: an owner accepting a member invitation stays owner', async () => {
    await seedExec('update users set email = $1 where id = $2', [INVITEE_EMAIL, F.staffA])
    await addInvitation({ token: 't-demote', role: 'member' })

    const out = await accept('t-demote', F.staffA)
    expect(out).toMatchObject({ outcome: 'accepted', joined_role: 'owner' })
    expect(await orgRows(F.staffA)).toEqual([`${F.orgA}/owner`])
  })

  it('a second accept of the same token is refused, and adds nothing', async () => {
    await addUser(INVITEE, INVITEE_EMAIL)
    await addInvitation({ token: 't-twice' })
    expect((await accept('t-twice', INVITEE)).outcome).toBe('accepted')
    // Take the membership away, so a second accept that wrongly succeeded would put it back.
    await seedExec('delete from org_members where user_id = $1', [INVITEE])

    expect((await accept('t-twice', INVITEE)).outcome).toBe('already_accepted')
    expect(await orgRows(INVITEE)).toEqual([])
  })

  it('two simultaneous accepts of one token: exactly one wins', async () => {
    // `for update` on the invitation is what serialises them. Without it both read
    // `accepted_at is null` and both answer 'accepted'. A pool of 2 gives each its own
    // connection, so the two really do overlap.
    await addUser(INVITEE, INVITEE_EMAIL)
    for (let i = 0; i < 5; i++) {
      await addInvitation({ token: `t-race-${i}` })
      const [a, b] = await Promise.all([
        accept(`t-race-${i}`, INVITEE),
        accept(`t-race-${i}`, INVITEE),
      ])
      expect([a.outcome, b.outcome].sort(), `race ${i}`).toEqual(['accepted', 'already_accepted'])
    }
  })
})

describe('accept_invitation: every refusal writes nothing', () => {
  it('an expired invitation', async () => {
    await addUser(INVITEE, INVITEE_EMAIL)
    await addInvitation({ token: 't-exp', expiresIn: '-1 minute' })

    expect((await accept('t-exp', INVITEE)).outcome).toBe('expired')
    expect(await orgRows(INVITEE)).toEqual([])
    expect((await resolve('t-exp'))[0]?.status, 'an expired token got spent').toBe('expired')
  })

  it('a revoked invitation (the row is gone) and an unknown token are one outcome', async () => {
    await addUser(INVITEE, INVITEE_EMAIL)
    await addInvitation({ token: 't-rev' })
    await seedExec('delete from invitations where token_hash = $1', [hashOf('t-rev')])

    expect((await accept('t-rev', INVITEE)).outcome).toBe('unknown')
    expect((await accept('never-issued', INVITEE)).outcome).toBe('unknown')
    expect(await orgRows(INVITEE)).toEqual([])
  })

  it('an already accepted invitation', async () => {
    await addUser(INVITEE, INVITEE_EMAIL)
    await addInvitation({ token: 't-done', accepted: true })

    expect((await accept('t-done', INVITEE)).outcome).toBe('already_accepted')
    expect(await orgRows(INVITEE)).toEqual([])
  })

  it('the wrong user: a different address, and the invitation is still usable by the right one', async () => {
    await addUser(INVITEE, INVITEE_EMAIL)
    await addUser(STRANGER, 'someone.else@elsewhere.test')
    await addInvitation({ token: 't-wrong' })

    expect((await accept('t-wrong', STRANGER)).outcome).toBe('wrong_user')
    expect(await orgRows(STRANGER), 'a stranger joined the org').toEqual([])
    expect((await resolve('t-wrong'))[0]?.status, 'the wrong user spent the token').toBe('pending')

    expect((await accept('t-wrong', INVITEE)).outcome).toBe('accepted')
  })

  it('a user id that does not exist is the wrong user, not an error', async () => {
    const ghost = '01900000-0000-7000-8000-0000000000ff'
    await addInvitation({ token: 't-ghost' })
    expect((await accept('t-ghost', ghost)).outcome).toBe('wrong_user')
  })

  it('a caller acting as somebody else: the GUC and the argument must agree', async () => {
    await addUser(INVITEE, INVITEE_EMAIL)
    await addInvitation({ token: 't-forbid' })

    // A Server Function that passed the invitee's id while running as another user...
    expect((await accept('t-forbid', INVITEE, F.staffB)).outcome).toBe('forbidden')
    // ...and one that never entered through withUser at all.
    expect((await accept('t-forbid', INVITEE, null)).outcome).toBe('forbidden')

    expect(await orgRows(INVITEE)).toEqual([])
    expect((await resolve('t-forbid'))[0]?.status).toBe('pending')
  })

  it("a wedding invitation naming another org's wedding grants nothing", async () => {
    // `invitations.wedding_id` has no foreign key, so a row can carry org A and wedding B1.
    // Accepting it must not put the invitee on org B's wedding.
    await addUser(INVITEE, INVITEE_EMAIL)
    await addInvitation({ token: 't-cross', org: F.orgA, wedding: F.weddingB1, role: 'couple' })

    expect((await accept('t-cross', INVITEE)).outcome).toBe('unknown')
    expect(await weddingRows(INVITEE)).toEqual([])
    expect(await orgRows(INVITEE)).toEqual([])
    expect((await resolve('t-cross'))[0]?.status, 'a refused accept spent the token').toBe(
      'pending',
    )
  })

  it('a soft-deleted organisation, and a soft-deleted wedding', async () => {
    await addUser(INVITEE, INVITEE_EMAIL)
    await addInvitation({ token: 't-deadwed', wedding: F.weddingA1, role: 'editor' })
    await seedExec('update weddings set deleted_at = now() where id = $1', [F.weddingA1])
    expect((await accept('t-deadwed', INVITEE)).outcome).toBe('unknown')
    expect(await weddingRows(INVITEE)).toEqual([])

    await addInvitation({ token: 't-deadorg' })
    await seedExec('update organizations set deleted_at = now() where id = $1', [F.orgA])
    expect((await accept('t-deadorg', INVITEE)).outcome).toBe('unknown')
    expect(await orgRows(INVITEE)).toEqual([])
  })
})

describe('accept_invitation: cross-org', () => {
  it("an owner of org B accepting org A's invitation gains org A and keeps org B, and no third", async () => {
    await seedExec('update users set email = $1 where id = $2', [INVITEE_EMAIL, F.staffB])
    await addInvitation({ token: 't-both', org: F.orgA, role: 'member' })

    expect((await accept('t-both', F.staffB)).outcome).toBe('accepted')
    expect(await orgRows(F.staffB)).toEqual([`${F.orgA}/member`, `${F.orgB}/owner`].sort())
  })

  it("the membership lands in the INVITATION's org, whichever tenant the caller pretends to be", async () => {
    // The function takes no org argument, but a caller could still set app.org_id to
    // another org's id before calling it. It must make no difference to where the row goes.
    await addUser(INVITEE, INVITEE_EMAIL)
    await addInvitation({ token: 't-pretend', org: F.orgA })

    const rows = await asPrincipal(
      h,
      { userId: INVITEE, orgId: F.orgB, weddingRole: 'owner' },
      'select * from accept_invitation($1, $2)',
      [hashOf('t-pretend'), INVITEE],
    )
    expect(rows[0]).toMatchObject({ outcome: 'accepted', joined_org_id: F.orgA })
    expect(await orgRows(INVITEE)).toEqual([`${F.orgA}/admin`])
  })
})

describe('the repo wrappers, over the same functions', () => {
  it('resolveInvitationByHash returns camelCase plain data, and null for a miss', async () => {
    await addInvitation({ token: 't-repo' })

    expect(await resolveInvitationByHash(h.db, hashOf('t-repo'))).toMatchObject({
      orgId: F.orgA,
      orgName: 'Studio A',
      weddingId: null,
      email: INVITEE_EMAIL,
      role: 'admin',
      status: 'pending',
    })
    expect(await resolveInvitationByHash(h.db, hashOf('nope'))).toBeNull()
  })

  it('acceptInvitationByHash accepts through withUser, and reports refusals as values', async () => {
    await addUser(INVITEE, INVITEE_EMAIL)
    await addUser(STRANGER, 'someone.else@elsewhere.test')
    await addInvitation({ token: 't-repo-accept' })

    expect(await acceptInvitationByHash(h.db, hashOf('t-repo-accept'), STRANGER)).toEqual({
      outcome: 'wrong_user',
    })
    expect(await acceptInvitationByHash(h.db, hashOf('t-repo-accept'), INVITEE)).toEqual({
      outcome: 'accepted',
      orgId: F.orgA,
      weddingId: null,
      role: 'admin',
    })
    expect(await acceptInvitationByHash(h.db, hashOf('t-repo-accept'), INVITEE)).toEqual({
      outcome: 'already_accepted',
    })
  })
})
