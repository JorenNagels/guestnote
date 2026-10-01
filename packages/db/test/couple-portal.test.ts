import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  AS,
  asNobody,
  asPrincipal,
  connect,
  F,
  type Gucs,
  type Harness,
  reseed,
  seedExec,
} from './harness.ts'

/**
 * Spec 0008, migration 0013: the couple's functions, and the policies tightened around them.
 *
 * Everything here sets GUCs by hand (`asPrincipal`), for `db-migration` 4b's reason: a repo that
 * filters in its own query answers correctly while the database underneath is wrong. The
 * fixture's A1 is `live` with `AS.coupleA1` as its couple and `memberA` assigned as editor;
 * every "gets nothing" assertion is paired with one proving the same call returns rows to the
 * principal that should have them, so an empty result is never vacuous.
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

const call = (gucs: Gucs, sql: string, values: unknown[] = []) => asPrincipal(h, gucs, sql, values)
const ok = async (gucs: Gucs, sql: string, values: unknown[] = []) => {
  const [row] = await call(gucs, sql, values)
  return Object.values(row ?? {})[0] as boolean
}
const newUuid = () => crypto.randomUUID()

/** A1's second partner, so "either partner" is observable. */
const PARTNER = 'cccccccc-0000-0000-0000-0000000000c2'
const addPartner = async () => {
  await seedExec(`insert into users (id, email, name) values ($1, 'partner@a1.test', 'Tom')`, [
    PARTNER,
  ])
  await seedExec(
    `insert into wedding_members (wedding_id, user_id, role) values ($1, $2, 'couple')`,
    [F.weddingA1, PARTNER],
  )
}
const partnerA1: Gucs = { ...AS.coupleA1, userId: PARTNER }

describe('every couple function is a locked-down SECURITY DEFINER', () => {
  const PUBLIC_FNS = [
    'my_couple_weddings',
    'couple_home',
    'couple_run_sheet',
    'couple_vendors',
    'couple_budget_lines',
    'couple_payments',
    'couple_moodboards',
    'couple_board_images',
    'couple_file_comments',
    'couple_set_task_done',
    'couple_add_task_comment',
    'couple_delete_task_comment',
    'couple_start_image',
    'couple_confirm_image',
    'couple_delete_image',
    'couple_add_file_comment',
    'couple_delete_file_comment',
    'remove_wedding_couple',
    'wedding_couple_members',
    'couple_invite_blocker',
    'gn_couple_module_open',
  ]

  it.each(PUBLIC_FNS)('%s: definer, search_path pinned, app_user only', async (name) => {
    const [row] = await asNobody(
      h,
      `select prosecdef, array_to_string(proconfig, ',') as config, proacl::text as acl,
              has_function_privilege('app_user', p.oid, 'execute') as app_can
         from pg_proc p where proname = $1`,
      [name],
    )
    const c = row as {
      prosecdef: boolean
      config: string | null
      acl: string | null
      app_can: boolean
    }
    expect(c, `${name} does not exist`).toBeDefined()
    expect(c.prosecdef, 'not SECURITY DEFINER').toBe(true)
    expect(c.config, 'search_path is not pinned').toContain('search_path=""')
    expect(c.acl ?? '', 'PUBLIC can execute this').not.toMatch(/(^\{|,)=X\//)
    expect(c.app_can, 'app_user cannot execute this').toBe(true)
  })

  it.each(['gn_couple_wedding', 'gn_couple_image', 'gn_can_manage_couple'])(
    '%s is internal: app_user cannot call it',
    async (name) => {
      const [row] = await asNobody(
        h,
        `select has_function_privilege('app_user', p.oid, 'execute') as app_can
           from pg_proc p where proname = $1`,
        [name],
      )
      expect((row as { app_can: boolean }).app_can).toBe(false)
    },
  )
})

describe('couple_home and my_couple_weddings', () => {
  it('returns the wedding, studio and assigned planner, and has no notes column', async () => {
    await seedExec(`update weddings set notes = 'marge 18%' where id = $1`, [F.weddingA1])
    const rows = await call(AS.coupleA1, 'select * from couple_home()')
    expect(rows).toHaveLength(1)
    const r = rows[0] as Record<string, unknown>
    expect(r.couple_display_name).toBe('A One')
    expect(r.studio_name).toBe('Studio A')
    expect(r.contact_email).toBe('member@a.test')
    expect(r.couple_user_ids).toEqual([F.coupleA1])
    expect(Object.keys(r)).not.toContain('notes')
    expect(JSON.stringify(r)).not.toContain('marge')
  })

  it('falls back to the org owner when nobody is assigned', async () => {
    await seedExec(`delete from wedding_members where wedding_id = $1 and role = 'editor'`, [
      F.weddingA1,
    ])
    const [r] = await call(AS.coupleA1, 'select contact_email from couple_home()')
    expect(r?.contact_email).toBe('staff@a.test')
  })

  it('returns a draft wedding too, so the portal can say it is not open', async () => {
    await seedExec(`update weddings set status = 'draft' where id = $1`, [F.weddingA1])
    const [r] = await call(AS.coupleA1, 'select status from couple_home()')
    expect(r?.status).toBe('draft')
  })

  it('returns nothing to staff, or to a couple whose GUCs name a wedding they are not on', async () => {
    expect(await call(AS.staffAOnA1, 'select * from couple_home()')).toEqual([])
    expect(
      await call({ ...AS.coupleA1, weddingId: F.weddingA2 }, 'select * from couple_home()'),
    ).toEqual([])
  })

  it('re-reads the couple membership rather than trusting the role GUC', async () => {
    // memberA holds an `editor` row on A1; claiming `couple` must not make it one.
    expect(
      await call({ ...AS.coupleA1, userId: F.memberA }, 'select * from couple_home()'),
    ).toEqual([])
    expect(await call({ ...AS.coupleA1, userId: F.staffB }, 'select * from couple_home()')).toEqual(
      [],
    )
  })

  it('my_couple_weddings reads by user alone and gives the org id the couple cannot read', async () => {
    const rows = await call({ userId: F.coupleA1 }, 'select * from my_couple_weddings()')
    expect(rows.map((r) => [r.wedding_id, r.org_id])).toEqual([[F.weddingA1, F.orgA]])
    // Staff hold an `editor` row on A1, not a `couple` one.
    expect(await call({ userId: F.memberA }, 'select * from my_couple_weddings()')).toEqual([])
    expect(await call({}, 'select * from my_couple_weddings()')).toEqual([])
  })
})

describe('module reads honour status and the switch', () => {
  const READS: [string, string][] = [
    ['run_sheet', 'select * from couple_run_sheet()'],
    ['vendors', 'select * from couple_vendors()'],
    ['budget', 'select * from couple_budget_lines()'],
    ['budget', 'select * from couple_payments()'],
  ]

  it.each(READS)('%s: rows when on and live, none when off, draft, or staff', async (mod, sql) => {
    expect(
      (await call(AS.coupleA1, sql)).length,
      'fixture gives this module no rows',
    ).toBeGreaterThan(0)
    expect(await call(AS.staffAOnA1, sql)).toEqual([])

    await seedExec(
      `update weddings set couple_modules = array_remove(couple_modules, $2) where id = $1`,
      [F.weddingA1, mod],
    )
    expect(await call(AS.coupleA1, sql), 'switch off still returns rows').toEqual([])

    await reseed()
    await seedExec(`update weddings set status = 'draft' where id = $1`, [F.weddingA1])
    expect(await call(AS.coupleA1, sql), 'draft still returns rows').toEqual([])

    await reseed()
    await seedExec(`update weddings set status = 'archived' where id = $1`, [F.weddingA1])
    expect((await call(AS.coupleA1, sql)).length, 'archived must stay readable').toBeGreaterThan(0)
  })

  it('run sheet: only the couple own wedding, named columns only', async () => {
    const rows = await call(AS.coupleA1, 'select * from couple_run_sheet()')
    expect(rows.map((r) => r.id)).toEqual([F.runItemA1])
    expect(Object.keys(rows[0] ?? {})).not.toContain('owner_user_id')
  })

  it('vendors: booked only, name and category only', async () => {
    await seedExec(
      `insert into wedding_vendors (id, org_id, wedding_id, vendor_id, status)
         values (gen_random_uuid(), $1, $2, $3, 'considering')`,
      [F.orgA, F.weddingA1, F.vendorA2],
    )
    const rows = await call(AS.coupleA1, 'select * from couple_vendors()')
    expect(rows).toEqual([{ id: F.wedVendorA1, name: 'Traiteur A', category: 'Catering' }])
  })

  it('budget: this wedding only', async () => {
    const lines = await call(AS.coupleA1, 'select id from couple_budget_lines()')
    expect(lines.map((r) => r.id)).toEqual([F.budgetLineA1])
    const pays = await call(AS.coupleA1, 'select id from couple_payments()')
    expect(pays.map((r) => r.id)).toEqual([F.paymentA1])
  })
})

describe('moodboards: only boards shared with the couple', () => {
  const share = (board: string) =>
    seedExec(`update moodboards set shared_with_couple = true where id = $1`, [board])

  it('lists nothing until a board is shared, then that board and its live shared images', async () => {
    expect(await call(AS.coupleA1, 'select * from couple_moodboards()')).toEqual([])
    await share(F.boardA1Photo)
    const boards = await call(AS.coupleA1, 'select id, image_count from couple_moodboards()')
    expect(boards).toEqual([{ id: F.boardA1Photo, image_count: 1 }])

    const images = await call(
      AS.coupleA1,
      'select id, comment_count, by_couple, is_own from couple_board_images($1)',
      [F.boardA1Photo],
    )
    expect(images).toEqual([
      { id: F.imageA1Photo, comment_count: 1, by_couple: false, is_own: false },
    ])
    // The unshared default board's image stays out, even asked for by id.
    expect(await call(AS.coupleA1, 'select id from couple_board_images($1)', [F.boardA1])).toEqual(
      [],
    )
  })

  it('drops an internal image from a shared board, and from its count', async () => {
    await share(F.boardA1Photo)
    await seedExec(`update files set visibility = 'internal' where id = $1`, [F.imageA1Photo])
    expect(
      await call(AS.coupleA1, 'select id from couple_board_images($1)', [F.boardA1Photo]),
    ).toEqual([])
    expect(await call(AS.coupleA1, 'select image_count from couple_moodboards()')).toEqual([
      { image_count: 0 },
    ])
  })

  it('reads image comments only on an image it may see', async () => {
    expect(
      await call(AS.coupleA1, 'select * from couple_file_comments($1)', [F.imageA1Photo]),
    ).toEqual([])
    await share(F.boardA1Photo)
    const rows = await call(
      AS.coupleA1,
      'select body, by_couple, is_own from couple_file_comments($1)',
      [F.imageA1Photo],
    )
    expect(rows).toEqual([{ body: 'Mooi licht', by_couple: false, is_own: false }])
  })
})

describe('couple_set_task_done: own tasks, live weddings', () => {
  const tick = (gucs: Gucs, task: string, done = true) =>
    ok(gucs, 'select couple_set_task_done($1, $2)', [task, done])
  const statusOf = async (task: string) =>
    (
      await call(AS.staffAOnA1, 'select status, couple_activity_at from tasks where id = $1', [
        task,
      ])
    )[0]

  it('refuses a shared task that is not assigned to the couple', async () => {
    expect(await tick(AS.coupleA1, F.taskA1Shared)).toBe(false)
    expect((await statusOf(F.taskA1Shared))?.status).toBe('open')
  })

  it('ticks a task assigned to the couple, and stamps the planner activity', async () => {
    await seedExec(`update tasks set assignee_role = 'couple' where id = $1`, [F.taskA1Shared])
    expect(await tick(AS.coupleA1, F.taskA1Shared)).toBe(true)
    const row = await statusOf(F.taskA1Shared)
    expect(row?.status).toBe('done')
    expect(row?.couple_activity_at).not.toBeNull()
    expect(await tick(AS.coupleA1, F.taskA1Shared, false)).toBe(true)
    expect((await statusOf(F.taskA1Shared))?.status).toBe('open')
  })

  it('lets either partner tick a task assigned to the other one', async () => {
    await addPartner()
    await seedExec(`update tasks set assignee_user_id = $2 where id = $1`, [
      F.taskA1Shared,
      F.coupleA1,
    ])
    expect(await tick(partnerA1, F.taskA1Shared)).toBe(true)
  })

  it('refuses an internal task even when assigned to the couple', async () => {
    await seedExec(`update tasks set assignee_role = 'couple' where id = $1`, [F.taskA1Internal])
    expect(await tick(AS.coupleA1, F.taskA1Internal)).toBe(false)
  })

  it("refuses another wedding's couple task, in the same org and in another", async () => {
    for (const task of [F.taskA2Shared, F.taskB1Shared]) {
      await seedExec(`update tasks set assignee_role = 'couple' where id = $1`, [task])
      expect(await tick(AS.coupleA1, task), task).toBe(false)
    }
    // Read back as each org's own staff: RLS hides both rows from a principal-less read.
    const [a2] = await call(AS.staffA, 'select status from tasks where id = $1', [F.taskA2Shared])
    const [b1] = await call(AS.staffB, 'select status from tasks where id = $1', [F.taskB1Shared])
    expect([a2?.status, b1?.status]).toEqual(['open', 'open'])
  })

  it('refuses on an archived wedding, and with the tasks module off', async () => {
    await seedExec(`update tasks set assignee_role = 'couple' where id = $1`, [F.taskA1Shared])
    await seedExec(`update weddings set status = 'archived' where id = $1`, [F.weddingA1])
    expect(await tick(AS.coupleA1, F.taskA1Shared)).toBe(false)
    await seedExec(
      `update weddings set status = 'live', couple_modules = array['budget'] where id = $1`,
      [F.weddingA1],
    )
    expect(await tick(AS.coupleA1, F.taskA1Shared)).toBe(false)
  })

  it('refuses a staff principal (the function is the couple door only)', async () => {
    await seedExec(`update tasks set assignee_role = 'couple' where id = $1`, [F.taskA1Shared])
    expect(await tick(AS.staffAOnA1, F.taskA1Shared)).toBe(false)
  })
})

describe('task comments by the couple', () => {
  const add = (gucs: Gucs, task: string, body = 'Welke DJ?') =>
    ok(gucs, 'select couple_add_task_comment($1, $2, $3)', [newUuid(), task, body])

  it('comments on any shared task of the wedding, and nothing else', async () => {
    expect(await add(AS.coupleA1, F.taskA1Shared)).toBe(true)
    expect(await add(AS.coupleA1, F.taskA1Internal)).toBe(false)
    expect(await add(AS.coupleA1, F.taskA2Shared)).toBe(false)
    expect(await add(AS.coupleA1, F.taskA1Shared, '   ')).toBe(false)
    expect(await add(AS.coupleA1, F.taskA1Shared, 'x'.repeat(4001))).toBe(false)
    const [row] = await call(AS.staffAOnA1, 'select couple_activity_at from tasks where id = $1', [
      F.taskA1Shared,
    ])
    expect(row?.couple_activity_at).not.toBeNull()
  })

  it('deletes its own comment, never a planner one', async () => {
    const id = newUuid()
    expect(
      await ok(AS.coupleA1, 'select couple_add_task_comment($1, $2, $3)', [
        id,
        F.taskA1Shared,
        'x',
      ]),
    ).toBe(true)
    expect(await ok(AS.coupleA1, 'select couple_delete_task_comment($1)', [id])).toBe(true)
    const [staffComment] = await call(
      AS.staffAOnA1,
      'select id from task_comments where task_id = $1 and deleted_at is null',
      [F.taskA1Shared],
    )
    expect(await ok(AS.coupleA1, 'select couple_delete_task_comment($1)', [staffComment?.id])).toBe(
      false,
    )
  })
})

describe('couple uploads and image comments', () => {
  const keyFor = (id: string) => `${F.orgA}/${F.weddingA1}/${id}`
  const start = (gucs: Gucs, id: string, board: string, key = keyFor(id)) =>
    ok(gucs, 'select couple_start_image($1, $2, $3, $4, $5, $6)', [
      id,
      board,
      'pin.jpg',
      key,
      1000,
      'image/jpeg',
    ])

  beforeEach(async () => {
    await seedExec(`update moodboards set shared_with_couple = true where id = $1`, [
      F.boardA1Photo,
    ])
  })

  it('uploads to a shared board: pending, then confirmed, then visible', async () => {
    const id = newUuid()
    expect(await start(AS.coupleA1, id, F.boardA1Photo)).toBe(true)
    const before = await call(AS.coupleA1, 'select id from couple_board_images($1)', [
      F.boardA1Photo,
    ])
    expect(before.map((r) => r.id)).not.toContain(id)
    expect(await ok(AS.coupleA1, 'select couple_confirm_image($1)', [id])).toBe(true)
    const after = await call(
      AS.coupleA1,
      'select id, is_own, by_couple, uploader_name from couple_board_images($1)',
      [F.boardA1Photo],
    )
    // A nameless partner is named by address (invited accounts have no name).
    expect(after).toContainEqual({
      id,
      is_own: true,
      by_couple: true,
      uploader_name: 'couple@a1.test',
    })
  })

  it('refuses an unshared board, and a key aimed anywhere but its own slot', async () => {
    expect(await start(AS.coupleA1, newUuid(), F.boardA1)).toBe(false)
    const id = newUuid()
    expect(await start(AS.coupleA1, id, F.boardA1Photo, `${F.orgB}/${F.weddingB1}/${id}`)).toBe(
      false,
    )
    expect(await start(AS.coupleA1, id, F.boardA1Photo, keyFor(newUuid()))).toBe(false)
  })

  it('deletes its own upload, never a planner image', async () => {
    const id = newUuid()
    await start(AS.coupleA1, id, F.boardA1Photo)
    await ok(AS.coupleA1, 'select couple_confirm_image($1)', [id])
    expect(await ok(AS.coupleA1, 'select couple_delete_image($1)', [id])).toBe(true)
    expect(await ok(AS.coupleA1, 'select couple_delete_image($1)', [F.imageA1Photo])).toBe(false)
  })

  it("names a nameless partner by address, and never a nameless planner's", async () => {
    // Fixture users have no name, like every account made through an invitation.
    await ok(AS.coupleA1, 'select couple_add_file_comment($1, $2, $3)', [
      newUuid(),
      F.imageA1Photo,
      'Ja!',
    ])
    const rows = await call(
      AS.coupleA1,
      'select author_name, by_couple, is_own from couple_file_comments($1) order by by_couple',
      [F.imageA1Photo],
    )
    expect(rows).toEqual([
      { author_name: null, by_couple: false, is_own: false },
      { author_name: 'couple@a1.test', by_couple: true, is_own: true },
    ])
  })

  it('comments on a visible image, and deletes only its own', async () => {
    const id = newUuid()
    expect(
      await ok(AS.coupleA1, 'select couple_add_file_comment($1, $2, $3)', [
        id,
        F.imageA1Photo,
        'Ja!',
      ]),
    ).toBe(true)
    expect(
      await ok(AS.coupleA1, 'select couple_add_file_comment($1, $2, $3)', [
        newUuid(),
        F.imageA1Default,
        'unshared board',
      ]),
    ).toBe(false)
    expect(await ok(AS.coupleA1, 'select couple_delete_file_comment($1)', [id])).toBe(true)
    const [planner] = await call(AS.staffAOnA1, 'select id from file_comments where file_id = $1', [
      F.imageA1Photo,
    ])
    expect(await ok(AS.coupleA1, 'select couple_delete_file_comment($1)', [planner?.id])).toBe(
      false,
    )
  })

  it('a file comment refuses a blank body and one over 4000', async () => {
    for (const body of ['   ', 'x'.repeat(4001)]) {
      expect(
        await ok(AS.coupleA1, 'select couple_add_file_comment($1, $2, $3)', [
          newUuid(),
          F.imageA1Photo,
          body,
        ]),
      ).toBe(false)
    }
  })

  it('file_comments has no couple policy: direct reads return nothing', async () => {
    expect((await call(AS.staffAOnA1, 'select count(*)::int as n from file_comments'))[0]?.n).toBe(
      1,
    )
    expect((await call(AS.coupleA1, 'select count(*)::int as n from file_comments'))[0]?.n).toBe(0)
  })
})

describe('every couple write refuses an archived wedding and a switched-off module', () => {
  beforeEach(async () => {
    await seedExec(`update moodboards set shared_with_couple = true where id = $1`, [
      F.boardA1Photo,
    ])
  })

  const writes = async () => {
    const id = newUuid()
    return {
      addTask: await ok(AS.coupleA1, 'select couple_add_task_comment($1, $2, $3)', [
        newUuid(),
        F.taskA1Shared,
        'x',
      ]),
      start: await ok(AS.coupleA1, 'select couple_start_image($1, $2, $3, $4, $5, $6)', [
        id,
        F.boardA1Photo,
        'x.jpg',
        `${F.orgA}/${F.weddingA1}/${id}`,
        10,
        'image/jpeg',
      ]),
      addFile: await ok(AS.coupleA1, 'select couple_add_file_comment($1, $2, $3)', [
        newUuid(),
        F.imageA1Photo,
        'x',
      ]),
    }
  }

  it('live and on: each write goes through (the control)', async () => {
    expect(await writes()).toEqual({ addTask: true, start: true, addFile: true })
  })

  it('archived: none does, deletes and confirms included', async () => {
    const comment = newUuid()
    await ok(AS.coupleA1, 'select couple_add_task_comment($1, $2, $3)', [
      comment,
      F.taskA1Shared,
      'mine',
    ])
    const fileComment = newUuid()
    await ok(AS.coupleA1, 'select couple_add_file_comment($1, $2, $3)', [
      fileComment,
      F.imageA1Photo,
      'mine',
    ])
    const file = newUuid()
    await ok(AS.coupleA1, 'select couple_start_image($1, $2, $3, $4, $5, $6)', [
      file,
      F.boardA1Photo,
      'x.jpg',
      `${F.orgA}/${F.weddingA1}/${file}`,
      10,
      'image/jpeg',
    ])
    await seedExec(`update weddings set status = 'archived' where id = $1`, [F.weddingA1])
    expect(await writes()).toEqual({ addTask: false, start: false, addFile: false })
    expect(await ok(AS.coupleA1, 'select couple_delete_task_comment($1)', [comment])).toBe(false)
    expect(await ok(AS.coupleA1, 'select couple_delete_file_comment($1)', [fileComment])).toBe(
      false,
    )
    expect(await ok(AS.coupleA1, 'select couple_confirm_image($1)', [file])).toBe(false)
    expect(await ok(AS.coupleA1, 'select couple_delete_image($1)', [F.imageA1Photo])).toBe(false)
  })

  it('module off: the tasks and moodboards writes refuse', async () => {
    await seedExec(`update weddings set couple_modules = array['budget'] where id = $1`, [
      F.weddingA1,
    ])
    expect(await writes()).toEqual({ addTask: false, start: false, addFile: false })
  })
})

describe('remove_wedding_couple', () => {
  const remove = (gucs: Gucs, user: string = F.coupleA1) =>
    ok(gucs, 'select remove_wedding_couple($1, $2)', [F.weddingA1, user])
  const coupleRows = async () =>
    (await call({ userId: F.coupleA1 }, 'select * from my_couple_weddings()')).length

  it('refuses the couple, another org owner, and a caller with no org', async () => {
    expect(await remove(AS.coupleA1)).toBe(false)
    expect(await remove({ ...AS.staffB, weddingId: F.weddingA1 })).toBe(false)
    expect(await remove({ userId: F.staffA })).toBe(false)
    expect(await coupleRows()).toBe(1)
  })

  it('refuses a member of the org who is not assigned to this wedding', async () => {
    await seedExec(`delete from wedding_members where wedding_id = $1 and role = 'editor'`, [
      F.weddingA1,
    ])
    expect(await remove(AS.memberOnA1)).toBe(false)
    expect(
      await call(AS.memberOnA1, 'select * from wedding_couple_members($1)', [F.weddingA1]),
    ).toEqual([])
    const [b] = await call(AS.memberOnA1, 'select couple_invite_blocker($1, $2) as b', [
      F.weddingA1,
      'new@x.test',
    ])
    expect(b?.b).toBe('forbidden')
    expect(await coupleRows()).toBe(1)
  })

  it('lets the assigned member remove a partner', async () => {
    expect(await remove(AS.memberOnA1)).toBe(true)
    expect(await coupleRows()).toBe(0)
  })

  it('lets the owner remove a partner, and never an editor row', async () => {
    expect(await remove(AS.staffA, F.memberA)).toBe(false)
    expect(await remove(AS.staffA)).toBe(true)
  })
})

describe('wedding_couple_members and couple_invite_blocker', () => {
  const members = (gucs: Gucs) =>
    call(gucs, 'select email from wedding_couple_members($1)', [F.weddingA1])
  const blocker = async (gucs: Gucs, email: string) =>
    (await call(gucs, 'select couple_invite_blocker($1, $2) as b', [F.weddingA1, email]))[0]?.b

  it('lists the partners to the owner and the assigned member, and to nobody else', async () => {
    expect(await members(AS.staffA)).toEqual([{ email: 'couple@a1.test' }])
    expect(await members(AS.memberOnA1)).toEqual([{ email: 'couple@a1.test' }])
    expect(await members(AS.coupleA1)).toEqual([])
    expect(await members({ ...AS.staffB, orgId: F.orgA })).toEqual([])
  })

  it('names why an address cannot be invited', async () => {
    expect(await blocker(AS.memberOnA1, 'new@x.test')).toBeNull()
    expect(await blocker(AS.memberOnA1, 'STAFF@a.test')).toBe('alreadyStaff')
    expect(await blocker(AS.memberOnA1, 'couple@a1.test')).toBe('alreadyPartner')
    expect(await blocker(AS.coupleA1, 'new@x.test')).toBe('forbidden')
    // Another studio's staff is a stranger here, and may be invited as a couple.
    expect(await blocker(AS.memberOnA1, 'staff@b.test')).toBeNull()
  })
})

describe('0013 closed the writes a couple principal could make through RLS', () => {
  it('a couple cannot rename the studio', async () => {
    const rows = await call(AS.coupleA1, `update organizations set name = 'x' returning id`)
    expect(rows).toEqual([])
  })

  it('an outside editor cannot write the studio row', async () => {
    const rows = await call(AS.editorOnA1, `update organizations set name = 'x' returning id`)
    expect(rows).toEqual([])
  })

  it('a couple cannot switch its own modules or status', async () => {
    const rows = await call(
      AS.coupleA1,
      `update weddings set couple_modules = array['budget'], status = 'live' returning id`,
    )
    expect(rows).toEqual([])
  })

  it('a couple cannot insert a wedding or a task comment directly (WITH CHECK)', async () => {
    await expect(
      call(
        AS.coupleA1,
        `insert into weddings (id, org_id, slug, couple_display_name)
           values (gen_random_uuid(), $1, 'x-couple', 'X')`,
        [F.orgA],
      ),
    ).rejects.toThrow(/row-level security/i)
    await expect(
      call(
        AS.coupleA1,
        `insert into task_comments (id, org_id, wedding_id, task_id, body)
           values (gen_random_uuid(), $1, $2, $3, 'x')`,
        [F.orgA, F.weddingA1, F.taskA1Shared],
      ),
    ).rejects.toThrow(/row-level security/i)
  })

  it('a couple cannot invite an editor to its own wedding', async () => {
    await expect(
      call(
        AS.coupleA1,
        `insert into invitations (id, org_id, wedding_id, email, role, token_hash, expires_at)
           values (gen_random_uuid(), $1, $2, 'me2@x.test', 'editor', 'h', now() + interval '1 day')`,
        [F.orgA, F.weddingA1],
      ),
    ).rejects.toThrow(/row-level security/i)
  })

  it('an assigned member can still invite a couple to its own wedding (spec 0008)', async () => {
    const rows = await call(
      AS.memberOnA1,
      `insert into invitations (id, org_id, wedding_id, email, role, token_hash, expires_at)
         values (gen_random_uuid(), $1, $2, 'p2@x.test', 'couple', 'h2', now() + interval '1 day')
       returning id`,
      [F.orgA, F.weddingA1],
    )
    expect(rows).toHaveLength(1)
  })

  it('no user can write a membership row for themselves, on either table', async () => {
    await expect(
      call(
        { userId: F.coupleA1 },
        `insert into org_members (org_id, user_id, role) values ($1, $2, 'owner')`,
        [F.orgB, F.coupleA1],
      ),
    ).rejects.toThrow(/row-level security/i)
    await expect(
      call(
        { userId: F.coupleA1 },
        `insert into wedding_members (wedding_id, user_id, role) values ($1, $2, 'editor')`,
        [F.weddingB1, F.coupleA1],
      ),
    ).rejects.toThrow(/row-level security/i)
    const promoted = await call(
      { userId: F.coupleA1 },
      `update wedding_members set role = 'editor' where user_id = $1 returning role`,
      [F.coupleA1],
    )
    expect(promoted).toEqual([])
    // ...and can still read their own, which is all the policy is for now.
    expect(await call({ userId: F.coupleA1 }, 'select role from wedding_members')).toEqual([
      { role: 'couple' },
    ])
  })

  it("resolve_invitation names only the invitation's own org's wedding", async () => {
    // A hand-made row: `invitations.wedding_id` has no FK, and nothing in the app writes this.
    await seedExec(
      `insert into invitations (id, org_id, wedding_id, email, role, token_hash, expires_at)
         values (gen_random_uuid(), $1, $2, 'x@x.test', 'couple', 'hash-cross', now() + interval '1 day')`,
      [F.orgA, F.weddingB1],
    )
    const [row] = await asNobody(h, `select wedding_name from resolve_invitation('hash-cross')`)
    expect(row?.wedding_name).toBeNull()
    const [own] = await asNobody(h, `select wedding_name from resolve_invitation('hash-couple-a1')`)
    expect(own?.wedding_name).toBe('A One')
  })

  it('a deleted studio closes its couples portals', async () => {
    expect(await call(AS.coupleA1, 'select * from couple_home()')).toHaveLength(1)
    await seedExec(`update organizations set deleted_at = now() where id = $1`, [F.orgA])
    expect(await call(AS.coupleA1, 'select * from couple_home()')).toEqual([])
    expect(await call({ userId: F.coupleA1 }, 'select * from my_couple_weddings()')).toEqual([])
  })

  it('accepting a couple invitation writes wedding_members and never org_members', async () => {
    await seedExec(`insert into users (id, email) values ($1, 'partner@a1.test')`, [PARTNER])
    // The fixture's A1 couple invitation is addressed to partner@a1.test.
    const [res] = await call({ userId: PARTNER }, 'select * from accept_invitation($1, $2)', [
      'hash-couple-a1',
      PARTNER,
    ])
    expect(res).toBeDefined()
    expect(await call({ userId: PARTNER }, 'select role from wedding_members')).toEqual([
      { role: 'couple' },
    ])
    expect(await call({ userId: PARTNER }, 'select 1 from org_members')).toEqual([])
  })
})
