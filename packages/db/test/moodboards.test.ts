import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  confirmFile,
  createBoard,
  createPendingFile,
  createWedding,
  deleteBoard,
  getVendorLinkView,
  listBoards,
  listSharedBoards,
  type Memberships,
  moveImage,
  newId,
  renameBoard,
  resolveMemberships,
  setBoardShares,
  updateWeddingVendor,
  WeddingScope,
} from '../src/index.ts'
import {
  AS,
  asNobody,
  asPrincipal,
  connect,
  F,
  type Gucs,
  type Harness,
  NOT_FOUND,
  reseed,
  seedExec,
  unwrap,
} from './harness.ts'

/**
 * Spec 0007, migration 0012: named boards, per-vendor shares, and the full-day run sheet.
 *
 * Two halves, as elsewhere in this suite. The RLS half sets GUCs by hand, because a repo that
 * filters in its own query returns the right answer even when a policy is wrong (`db-migration`
 * 4b). The repo half is what only the repo can say: the parent reads, the default-board rule,
 * the pending sweep on delete.
 *
 * The fixture (harness.ts) puts two boards on A1 -- the default and `boardA1Photo` -- one image
 * on each, and exactly one share: `boardA1Photo` with `wedVendorA1`, whose link is
 * `AS.linkVendorA1`. So every "sees X, not Y" below has a Y that shares the wedding and the org.
 */

let h: Harness
let owner: Memberships
let member: Memberships

beforeAll(async () => {
  h = connect()
})
afterAll(async () => {
  await h.end()
})
beforeEach(async () => {
  await reseed()
  owner = await resolveMemberships(h.db, F.staffA)
  member = await resolveMemberships(h.db, F.memberA)
})

/** `unwrap`, but a miss fails the test here rather than as a null deref three lines later. */
function must<T>(r: { readonly ok: true; readonly value: T } | { readonly ok: false }): T {
  const v = unwrap(r)
  if (v === null) throw new Error(`expected ok, got ${JSON.stringify(r)}`)
  return v
}

const a1 = (m: Memberships = owner) => WeddingScope.of(h.db, m, F.orgA, F.weddingA1)
const ids = async (gucs: Gucs, sql: string) =>
  (await asPrincipal(h, gucs, sql)).map((r) => (r as { id: string }).id)

// A second vendor on A1, so a share for "someone else" exists on the same wedding.
const SIBLING = '66666666-0000-0000-0000-0000000000a8'
async function addSibling() {
  await seedExec(
    `insert into wedding_vendors (id, org_id, wedding_id, vendor_id) values ($1, $2, $3, $4)`,
    [SIBLING, F.orgA, F.weddingA1, F.vendorA2],
  )
}

describe('link_read (migration 0012), by hand-set GUCs', () => {
  it('the fixture holds what these assertions count on', async () => {
    expect(await ids(AS.staffAOnA1, `select id from moodboards order by id`)).toEqual([
      F.boardA1,
      F.boardA1Photo,
    ])
    expect(
      await ids(AS.staffAOnA1, `select id from files where kind = 'image' order by id`),
    ).toEqual([F.imageA1Default, F.imageA1Photo])
  })

  it('a link reads the board shared with its vendor, not the default board beside it', async () => {
    expect(await ids(AS.linkVendorA1, `select id from moodboards`)).toEqual([F.boardA1Photo])
  })

  it("a link reads that board's images, and no other file of the wedding", async () => {
    // Not the default board's image, and not the plain files (kind = 'file') on A1.
    expect(await ids(AS.linkVendorA1, `select id from files`)).toEqual([F.imageA1Photo])
  })

  it("a link reads its own share rows, not a sibling vendor's on the same wedding", async () => {
    await addSibling()
    await seedExec(
      `insert into moodboard_shares (moodboard_id, wedding_vendor_id, org_id, wedding_id)
         values ($1, $2, $3, $4)`,
      [F.boardA1, SIBLING, F.orgA, F.weddingA1],
    )
    const rows = await asPrincipal(h, AS.linkVendorA1, `select moodboard_id from moodboard_shares`)
    expect(rows).toEqual([{ moodboard_id: F.boardA1Photo }])
    // And the sibling's board stays invisible to this link.
    expect(await ids(AS.linkVendorA1, `select id from moodboards`)).toEqual([F.boardA1Photo])
  })

  it('unsharing takes the board and its images away', async () => {
    await seedExec(`delete from moodboard_shares`)
    expect(await ids(AS.linkVendorA1, `select id from moodboards`)).toEqual([])
    expect(await ids(AS.linkVendorA1, `select id from files`)).toEqual([])
  })

  it('a deleted image and a pending one are invisible to a link', async () => {
    const pendingId = newId()
    await seedExec(
      `insert into files (id, org_id, wedding_id, kind, name, storage_key, size_bytes, mime,
                          moodboard_id, created_at, deleted_at)
         values ($1, $2, $3, 'image', 'p.jpg', $4, 1, 'image/jpeg', $5, $6, $6)`,
      [pendingId, F.orgA, F.weddingA1, `a/a1/${pendingId}`, F.boardA1Photo, new Date()],
    )
    await seedExec(`update files set deleted_at = now() where id = $1`, [F.imageA1Photo])
    expect(await ids(AS.linkVendorA1, `select id from files`)).toEqual([])
  })

  it('an image staff marked internal is not shown to a link, even on a shared board', async () => {
    // The moodboard UI never does this; a hand-built POST or the Files screen's action could.
    await seedExec(`update files set visibility = 'internal' where id = $1`, [F.imageA1Photo])
    expect(await ids(AS.linkVendorA1, `select id from files`)).toEqual([])
  })

  it('the link GUCs on a staff role grant nothing extra: the role clause is what opens it', async () => {
    // `app.wedding_vendor_id` set on an owner of ANOTHER org: every link_read starts with
    // `wedding_role = 'link'`, so this reads nothing of A.
    //
    // CANNOT DISCRIMINATE for `files.link_read`, measured 2026-09-28 by deleting its role clause:
    // this test still passes. That policy's `exists` reads `moodboard_shares` under the caller's
    // own RLS, which shows share rows only to org staff (who read the files anyway) and to the
    // link itself -- so no principal exists that sees a share row and not the file, and the role
    // clause is a second lock behind that one. Kept, because a future share policy widened to a
    // couple would make it the only lock.
    const gucs = { ...AS.staffB, weddingId: F.weddingA1, weddingVendorId: F.wedVendorA1 }
    expect(await ids(gucs, `select id from moodboards`)).toEqual([])
    expect(await ids(gucs, `select id from files`)).toEqual([])
  })

  it('a link writes nothing: no share, no board, no image move', async () => {
    await expect(
      asPrincipal(
        h,
        AS.linkVendorA1,
        `insert into moodboard_shares (moodboard_id, wedding_vendor_id, org_id, wedding_id)
           values ($1, $2, $3, $4)`,
        [F.boardA1, F.wedVendorA1, F.orgA, F.weddingA1],
      ),
    ).rejects.toThrow(/row-level security/)
    expect(
      await asPrincipal(
        h,
        AS.linkVendorA1,
        `update moodboards set name = 'x' where id = $1 returning id`,
        [F.boardA1Photo],
      ),
    ).toEqual([])
    // On the rows the link CAN read, so a `link_read` made `for all` by mistake would show here.
    expect(
      await asPrincipal(
        h,
        AS.linkVendorA1,
        `update files set name = 'x' where id = $1 returning id`,
        [F.imageA1Photo],
      ),
    ).toEqual([])
    for (const [table, key, id] of [
      ['files', 'id', F.imageA1Photo],
      ['moodboards', 'id', F.boardA1Photo],
      ['moodboard_shares', 'moodboard_id', F.boardA1Photo],
    ] as const) {
      expect(
        await asPrincipal(
          h,
          AS.linkVendorA1,
          `delete from ${table} where ${key} = $1 returning 1`,
          [id],
        ),
      ).toEqual([])
    }
  })

  it('a couple, and a member of the sibling wedding, cannot write a share (WITH CHECK)', async () => {
    const share = [F.boardA1, F.wedVendorA1, F.orgA, F.weddingA1]
    const sql = `insert into moodboard_shares (moodboard_id, wedding_vendor_id, org_id, wedding_id)
                   values ($1, $2, $3, $4)`
    await expect(asPrincipal(h, { ...AS.coupleA1, orgId: F.orgA }, sql, share)).rejects.toThrow(
      /row-level security/,
    )
    await expect(
      asPrincipal(h, { ...AS.memberOnA1, weddingId: F.weddingA2 }, sql, share),
    ).rejects.toThrow(/row-level security/)
    // The positive control, so the two refusals above are the policy and not the SQL.
    expect(await asPrincipal(h, AS.memberOnA1, `${sql} returning 1`, share)).toHaveLength(1)
  })

  it('a couple and an editor read no board and no share (spec 0003: nothing new for a couple)', async () => {
    for (const gucs of [AS.coupleA1, AS.editorOnA1]) {
      expect(await ids(gucs, `select id from moodboards`)).toEqual([])
      expect(await asPrincipal(h, gucs, `select 1 from moodboard_shares`)).toEqual([])
    }
  })

  it("an assigned member reads their wedding's boards and not its sibling's", async () => {
    // Exact, so `F.boardA2` (same org, the sibling wedding) being absent is asserted too. The
    // pin itself -- which wedding a member's GUC names -- is `principalForWedding`'s, not RLS's.
    expect(await ids(AS.memberOnA1, `select id from moodboards order by id`)).toEqual([
      F.boardA1,
      F.boardA1Photo,
    ])
  })

  it("another org's owner reads none of org A's boards or shares", async () => {
    expect(await ids(AS.staffB, `select id from moodboards`)).toEqual([F.boardB1])
    expect(await asPrincipal(h, AS.staffB, `select 1 from moodboard_shares`)).toEqual([])
  })
})

describe('vendor_link_run_sheet() (migration 0012)', () => {
  const run = (gucs: Gucs) => asPrincipal(h, gucs, `select * from vendor_link_run_sheet()`)
  const UNASSIGNED = '99999999-0000-0000-0000-0000000000a7'
  const SIBLING_ITEM = '99999999-0000-0000-0000-0000000000a8'

  async function aFullDay() {
    await addSibling()
    await seedExec(`update run_sheet_items set wedding_vendor_id = $1 where id = $2`, [
      F.wedVendorA1,
      F.runItemA1,
    ])
    await seedExec(
      `insert into run_sheet_items
         (id, org_id, wedding_id, event_id, starts_at, duration_min, title, wedding_vendor_id,
          owner_user_id, position)
       values ($1, $3, $4, $5, '11:00', 20, 'Florist setup', $6, $7, 1),
              ($2, $3, $4, $5, '17:00', 15, 'Speeches', null, null, 2)`,
      [SIBLING_ITEM, UNASSIGNED, F.orgA, F.weddingA1, F.eventA1, SIBLING, F.staffA],
    )
    await seedExec(`update wedding_vendors set notes = 'private to the florist' where id = $1`, [
      SIBLING,
    ])
  }

  it('returns nothing while the toggle is off, even with rows on the sheet', async () => {
    await aFullDay()
    expect(await run(AS.linkVendorA1)).toEqual([])
  })

  it('with the toggle on: every row of the day, other vendors named, own rows marked', async () => {
    await aFullDay()
    await seedExec(`update wedding_vendors set full_run_sheet = true where id = $1`, [
      F.wedVendorA1,
    ])
    const rows = (await run(AS.linkVendorA1)) as {
      id: string
      title: string
      vendor_name: string | null
      is_own: boolean
      starts_at: string
    }[]
    expect(rows.map((r) => r.id)).toEqual([F.runItemA1, SIBLING_ITEM, UNASSIGNED])
    expect(rows.find((r) => r.id === F.runItemA1)).toMatchObject({
      is_own: true,
      vendor_name: 'Traiteur A',
      starts_at: '15:30',
    })
    expect(rows.find((r) => r.id === SIBLING_ITEM)).toMatchObject({
      is_own: false,
      vendor_name: 'Bloemen A',
    })
    expect(rows.find((r) => r.id === UNASSIGNED)).toMatchObject({
      is_own: false,
      vendor_name: null,
    })
  })

  it("never returns an owner, or any vendor's notes, whatever the row holds", async () => {
    await aFullDay()
    await seedExec(`update wedding_vendors set full_run_sheet = true where id = $1`, [
      F.wedVendorA1,
    ])
    const rows = await run(AS.linkVendorA1)
    expect(Object.keys(rows[0] as object).sort()).toEqual(
      [
        'duration_min',
        'event_id',
        'event_label',
        'id',
        'is_own',
        'place',
        'starts_at',
        'title',
        'vendor_name',
      ].sort(),
    )
    expect(JSON.stringify(rows)).not.toContain('private to the florist')
    expect(JSON.stringify(rows)).not.toContain(F.staffA)
  })

  it("never follows a row's plain FK into another wedding's event or vendor", async () => {
    await aFullDay()
    await seedExec(`update wedding_vendors set full_run_sheet = true where id = $1`, [
      F.wedVendorA1,
    ])
    // Rows the repo would refuse, written past it: one naming A2's event, one A2's vendor.
    await seedExec(`update run_sheet_items set event_id = $1 where id = $2`, [
      F.eventA2,
      SIBLING_ITEM,
    ])
    await seedExec(`update run_sheet_items set wedding_vendor_id = $1 where id = $2`, [
      F.wedVendorA2,
      UNASSIGNED,
    ])
    const rows = (await run(AS.linkVendorA1)) as { id: string; vendor_name: string | null }[]
    expect(rows.map((r) => r.id)).not.toContain(SIBLING_ITEM)
    expect(rows.find((r) => r.id === UNASSIGNED)?.vendor_name).toBeNull()
  })

  it('stays shut for a staff role, a mismatched wedding, and a removed vendor', async () => {
    await aFullDay()
    await seedExec(`update wedding_vendors set full_run_sheet = true where id = $1`, [
      F.wedVendorA1,
    ])
    // Staff carrying the link GUC: the role is the gate, not the vendor id.
    expect(await run({ ...AS.staffAOnA1, weddingVendorId: F.wedVendorA1 })).toEqual([])
    // The vendor's id under another wedding.
    expect(await run({ ...AS.linkVendorA1, weddingId: F.weddingA2 })).toEqual([])
    // Removed from the wedding.
    await seedExec(`update wedding_vendors set deleted_at = now() where id = $1`, [F.wedVendorA1])
    expect(await run(AS.linkVendorA1)).toEqual([])
  })

  it('is SECURITY DEFINER with a pinned search_path, and not executable by PUBLIC', async () => {
    const [row] = await asNobody(
      h,
      `select prosecdef, array_to_string(proconfig, ',') as config, proacl::text as acl,
              has_function_privilege('app_user', p.oid, 'execute') as app_can
         from pg_proc p where proname = 'vendor_link_run_sheet'`,
    )
    const c = row as {
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

describe('the repo', () => {
  const link = {
    kind: 'link' as const,
    orgId: F.orgA,
    weddingId: F.weddingA1,
    weddingVendorId: F.wedVendorA1,
  }

  it('createWedding makes exactly one default board with the wedding', async () => {
    const w = must(
      await createWedding(h.db, owner, F.orgA, {
        slugBase: 'with-a-board',
        status: 'draft',
        coupleDisplayName: 'Board & Co',
        weddingDate: null,
        venue: null,
        headcount: null,
        notes: null,
        color: null,
      }),
    )
    const boards = await listBoards(WeddingScope.of(h.db, owner, F.orgA, w.id))
    expect(boards?.map((b) => [b.name, b.isDefault])).toEqual([['Moodboard', true]])
  })

  it('lists boards in order, with image counts and the vendors each is shared with', async () => {
    const boards = await listBoards(a1())
    expect(boards).toEqual([
      expect.objectContaining({ id: F.boardA1, isDefault: true, imageCount: 1, sharedWith: [] }),
      expect.objectContaining({
        id: F.boardA1Photo,
        isDefault: false,
        imageCount: 1,
        sharedWith: [F.wedVendorA1],
      }),
    ])
  })

  it('a member creates and shares a board (any staff, spec 0007)', async () => {
    const { id } = must(await createBoard(a1(member), 'Bloemen'))
    expect(unwrap(await setBoardShares(a1(member), id, [F.wedVendorA1]))).toBeNull()
    const boards = await listBoards(a1(member))
    expect(boards?.at(-1)).toMatchObject({ id, name: 'Bloemen', sharedWith: [F.wedVendorA1] })
  })

  it("refuses to share with another wedding's vendor, and changes nothing", async () => {
    // wedVendorA2 is on A2: the FK alone would accept it.
    expect(await setBoardShares(a1(), F.boardA1Photo, [F.wedVendorA1, F.wedVendorA2])).toEqual(
      NOT_FOUND,
    )
    expect((await listBoards(a1()))?.[1]?.sharedWith).toEqual([F.wedVendorA1])
  })

  it('an empty list unshares', async () => {
    unwrap(await setBoardShares(a1(), F.boardA1Photo, []))
    expect(await listSharedBoards(h.db, link)).toEqual([])
  })

  it('refuses to delete the default board', async () => {
    expect(await deleteBoard(a1(), F.boardA1)).toEqual({ ok: false, reason: 'isDefault' })
  })

  it('deletes a board, soft-deletes its images, and leaves a pending upload unconfirmable', async () => {
    const pendingId = newId()
    expect(
      await createPendingFile(a1(), {
        id: pendingId,
        kind: 'image',
        moodboardId: F.boardA1Photo,
        name: 'late.jpg',
        storageKey: `${F.orgA}/${F.weddingA1}/${pendingId}`,
        sizeBytes: 10,
        mime: 'image/jpeg',
        visibility: 'shared',
      }),
    ).toEqual({ ok: true, value: null })

    expect(must(await deleteBoard(a1(), F.boardA1Photo))).toEqual({ images: 1 })
    expect((await listBoards(a1()))?.map((b) => b.id)).toEqual([F.boardA1])
    // The image is gone from every list, and the default board did not inherit it.
    expect((await listBoards(a1()))?.[0]?.imageCount).toBe(1)
    // Without the sweep, this confirm would bring the upload back alive on the default board.
    expect(await confirmFile(a1(), pendingId)).toEqual(NOT_FOUND)
  })

  it("never moves another wedding's image onto this wedding's board", async () => {
    // An owner is org-wide, so only the repo's wedding clause stops this. Without it, A2's image
    // would land on A1's photographer board -- and in front of A1's vendor.
    expect(await moveImage(a1(), F.fileA2Shared, F.boardA1Photo)).toEqual(NOT_FOUND)
    expect(await ids(AS.linkVendorA1, `select id from files`)).toEqual([F.imageA1Photo])
  })

  it("refuses to rename, share or delete another wedding's board from this one", async () => {
    const a2 = WeddingScope.of(h.db, owner, F.orgA, F.weddingA2)
    const { id: a2Extra } = must(await createBoard(a2, 'A2 extra'))
    expect(await renameBoard(a1(), F.boardA2, 'x')).toEqual(NOT_FOUND)
    expect(await setBoardShares(a1(), F.boardA2, [F.wedVendorA1])).toEqual(NOT_FOUND)
    expect(await deleteBoard(a1(), a2Extra)).toEqual(NOT_FOUND)
    expect((await listBoards(a2))?.map((b) => [b.id, b.name])).toEqual([
      [F.boardA2, 'Moodboard'],
      [a2Extra, 'A2 extra'],
    ])
  })

  it('refuses a removed vendor, tolerates a repeated one, and hides a removed vendor from the chips', async () => {
    expect(await setBoardShares(a1(), F.boardA1Photo, [F.wedVendorA1, F.wedVendorA1])).toEqual({
      ok: true,
      value: null,
    })
    await seedExec(`update wedding_vendors set deleted_at = now() where id = $1`, [F.wedVendorA1])
    expect((await listBoards(a1()))?.[1]?.sharedWith).toEqual([])
    expect(await setBoardShares(a1(), F.boardA1Photo, [F.wedVendorA1])).toEqual(NOT_FOUND)
  })

  it("moves an image, and refuses another wedding's board", async () => {
    unwrap(await moveImage(a1(), F.imageA1Default, F.boardA1Photo))
    expect((await listBoards(a1()))?.map((b) => b.imageCount)).toEqual([0, 2])
    expect(await moveImage(a1(), F.imageA1Photo, F.boardA2)).toEqual(NOT_FOUND)
  })

  it("listSharedBoards gives a link its board and that board's images", async () => {
    expect(await listSharedBoards(h.db, link)).toEqual([
      {
        id: F.boardA1Photo,
        name: 'Fotograaf',
        images: [{ id: F.imageA1Photo, name: 'Golden hour.jpg', storageKey: 'a/a1/golden' }],
      },
    ])
  })

  it('getVendorLinkView: the switch on over an empty sheet is still the whole day, just empty', async () => {
    await seedExec(`delete from run_sheet_items where wedding_id = $1`, [F.weddingA1])
    await seedExec(`update wedding_vendors set full_run_sheet = true where id = $1`, [
      F.wedVendorA1,
    ])
    expect(await getVendorLinkView(h.db, link)).toMatchObject({ fullDay: true, timeline: [] })
  })

  it('getVendorLinkView: own rows by default, the whole day once any staff switches it on', async () => {
    await seedExec(`update run_sheet_items set wedding_vendor_id = $1 where id = $2`, [
      F.wedVendorA1,
      F.runItemA1,
    ])
    await seedExec(
      `insert into run_sheet_items (id, org_id, wedding_id, event_id, starts_at, duration_min, title, position)
         values ($1, $2, $3, $4, '17:00', 15, 'Speeches', 2)`,
      ['99999999-0000-0000-0000-0000000000a6', F.orgA, F.weddingA1, F.eventA1],
    )
    await seedExec(`update wedding_vendors set notes = 'Bring the long lens.' where id = $1`, [
      F.wedVendorA1,
    ])
    const before = await getVendorLinkView(h.db, link)
    expect(before.fullDay).toBe(false)
    expect(before.timeline.map((t) => t.title)).toEqual(['Ceremony'])

    unwrap(await updateWeddingVendor(a1(member), F.wedVendorA1, { fullRunSheet: true }))
    const after = await getVendorLinkView(h.db, link)
    expect(after.fullDay).toBe(true)
    expect(after.timeline).toEqual([
      expect.objectContaining({
        title: 'Ceremony',
        isOwn: true,
        vendorName: 'Traiteur A',
        startsAt: '15:30',
        durationMin: 40,
      }),
      expect.objectContaining({ title: 'Speeches', isOwn: false, vendorName: null }),
    ])
    expect(after.plannerNote).toBe('Bring the long lens.')
  })
})
