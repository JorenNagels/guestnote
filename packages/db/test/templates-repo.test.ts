import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  addTemplateItem,
  applyTemplate,
  createTemplate,
  deleteTemplate,
  deleteTemplateItem,
  duplicateTemplate,
  getTemplate,
  listTasks,
  listTemplates,
  type Memberships,
  moveTemplateItem,
  resolveMemberships,
  updateTemplate,
  updateTemplateItem,
  WeddingScope,
} from '../src/repos/index.ts'
import { connect, F, type Harness, reseed, seedExec } from './harness.ts'

/**
 * The templates repo (slice S7) against a real Postgres with the real policies.
 *
 * `planner-isolation.test.ts` proves the POLICIES on `task_templates` and `template_items`. This
 * file proves the repo on top of them, and above all the one promise of the slice: applying is a
 * copy, so nothing done to a template afterwards can reach a wedding that used it.
 *
 * Fixture: org A has one template, "Full planning", with a shared item at T-300 and an internal
 * one at T-240. Wedding A1 is 2027-07-31.
 */

let h: Harness
let owner: Memberships
let member: Memberships
let couple: Memberships
let otherOrg: Memberships

beforeAll(async () => {
  h = connect()
})
afterAll(async () => {
  await h?.end()
})
beforeEach(async () => {
  await reseed()
  ;[owner, member, couple, otherOrg] = await Promise.all([
    resolveMemberships(h.db, F.staffA),
    resolveMemberships(h.db, F.memberA),
    resolveMemberships(h.db, F.coupleA1),
    resolveMemberships(h.db, F.staffB),
  ])
})

const item = (title: string, days = -10) => ({
  title,
  dueOffsetDays: days,
  visibility: 'shared' as const,
  assigneeRole: 'planner' as const,
})

async function detail(m: Memberships, id: string) {
  const r = await getTemplate(h.db, m, F.orgA, id)
  return r?.template ?? null
}

describe('who may read', () => {
  it('lists the org templates with their item counts, for an owner', async () => {
    const r = await listTemplates(h.db, owner, F.orgA)
    expect(r?.canWrite).toBe(true)
    expect(r?.templates).toEqual([
      { id: F.templateA, name: 'Full planning', description: null, itemCount: 2 },
    ])
  })

  it('lets an assigned member read, and never write', async () => {
    const r = await listTemplates(h.db, member, F.orgA)
    expect(r?.canWrite).toBe(false)
    expect(r?.templates.map((t) => t.id)).toEqual([F.templateA])
    const one = await getTemplate(h.db, member, F.orgA, F.templateA)
    expect(one?.template.items.map((i) => i.title)).toEqual([
      'Sign the venue contract',
      'Agree the planning fee schedule',
    ])
  })

  it('gives a couple and another org nothing', async () => {
    expect(await listTemplates(h.db, couple, F.orgA)).toBeNull()
    expect(await listTemplates(h.db, otherOrg, F.orgA)).toBeNull()
    expect(await getTemplate(h.db, otherOrg, F.orgA, F.templateA)).toBeNull()
    // Naming the right org with the wrong one's template id finds nothing, not a leak.
    expect(await getTemplate(h.db, owner, F.orgA, F.templateB)).toBeNull()
  })
})

describe('who may write', () => {
  it('refuses a member on every write, and changes nothing', async () => {
    const results = [
      await createTemplate(h.db, member, F.orgA, { name: 'x', description: null }),
      await updateTemplate(h.db, member, F.orgA, F.templateA, { name: 'x', description: null }),
      await deleteTemplate(h.db, member, F.orgA, F.templateA),
      await duplicateTemplate(h.db, member, F.orgA, F.templateA, ' (copy)'),
      await addTemplateItem(h.db, member, F.orgA, F.templateA, item('x')),
      await updateTemplateItem(h.db, member, F.orgA, F.templateA, F.itemAShared, item('x')),
      await deleteTemplateItem(h.db, member, F.orgA, F.templateA, F.itemAShared),
      await moveTemplateItem(h.db, member, F.orgA, F.templateA, F.itemAShared, 'down'),
    ]
    expect(results.every((r) => !r.ok && r.reason === 'forbidden')).toBe(true)
    const t = await detail(owner, F.templateA)
    expect(t?.name).toBe('Full planning')
    expect(t?.items).toHaveLength(2)
  })

  it('refuses an owner of another org, and a couple', async () => {
    expect(await createTemplate(h.db, otherOrg, F.orgA, { name: 'x', description: null })).toEqual({
      ok: false,
      reason: 'forbidden',
    })
    expect(await deleteTemplate(h.db, couple, F.orgA, F.templateA)).toEqual({
      ok: false,
      reason: 'forbidden',
    })
  })

  it('does not let an owner write to, or through, another org template', async () => {
    // Parent-read rule: the FK is plain, so the repo reads the template first.
    expect(await addTemplateItem(h.db, owner, F.orgA, F.templateB, item('planted'))).toEqual({
      ok: false,
      reason: 'notFound',
    })
    expect(
      await updateTemplate(h.db, owner, F.orgA, F.templateB, { name: 'x', description: null }),
    ).toEqual({ ok: false, reason: 'notFound' })
    expect(await deleteTemplate(h.db, owner, F.orgA, F.templateB)).toEqual({
      ok: false,
      reason: 'notFound',
    })
    const theirs = await getTemplate(h.db, otherOrg, F.orgB, F.templateB)
    expect(theirs?.template.name).toBe('Day-of coordination')
    expect(theirs?.template.items.map((i) => i.title)).toEqual(['Confirm arrival times'])
  })

  it('does not edit an item through the wrong template', async () => {
    const other = await createTemplate(h.db, owner, F.orgA, { name: 'Other', description: null })
    if (!other.ok) throw new Error('setup')
    expect(
      await updateTemplateItem(h.db, owner, F.orgA, other.value.id, F.itemAShared, item('moved')),
    ).toEqual({ ok: false, reason: 'notFound' })
    expect(await deleteTemplateItem(h.db, owner, F.orgA, other.value.id, F.itemAShared)).toEqual({
      ok: false,
      reason: 'notFound',
    })
    expect((await detail(owner, F.templateA))?.items).toHaveLength(2)
  })
})

describe('editing', () => {
  it('creates, renames and soft-deletes a template', async () => {
    const made = await createTemplate(h.db, owner, F.orgA, {
      name: 'Elopement',
      description: 'Two',
    })
    if (!made.ok) throw new Error('setup')
    const id = made.value.id
    expect(await detail(owner, id)).toMatchObject({
      name: 'Elopement',
      description: 'Two',
      items: [],
    })

    expect(
      (await updateTemplate(h.db, owner, F.orgA, id, { name: 'Micro', description: null })).ok,
    ).toBe(true)
    expect(await detail(owner, id)).toMatchObject({ name: 'Micro', description: null })

    expect((await deleteTemplate(h.db, owner, F.orgA, id)).ok).toBe(true)
    expect(await detail(owner, id)).toBeNull()
    expect((await listTemplates(h.db, owner, F.orgA))?.templates.map((t) => t.id)).toEqual([
      F.templateA,
    ])
    // Deleting twice is a not-found, and a deleted template cannot be renamed back to life.
    expect((await deleteTemplate(h.db, owner, F.orgA, id)).ok).toBe(false)
    expect(
      (await updateTemplate(h.db, owner, F.orgA, id, { name: 'x', description: null })).ok,
    ).toBe(false)
  })

  it('appends items in order, and renumbers on every move', async () => {
    const made = await createTemplate(h.db, owner, F.orgA, { name: 'Order', description: null })
    if (!made.ok) throw new Error('setup')
    const id = made.value.id
    for (const title of ['a', 'b', 'c']) await addTemplateItem(h.db, owner, F.orgA, id, item(title))
    const titles = async () => (await detail(owner, id))?.items.map((i) => i.title)
    expect(await titles()).toEqual(['a', 'b', 'c'])

    const ids = ((await detail(owner, id))?.items ?? []).map((i) => i.id)
    await moveTemplateItem(h.db, owner, F.orgA, id, ids[2] ?? '', 'up')
    expect(await titles()).toEqual(['a', 'c', 'b'])
    await moveTemplateItem(h.db, owner, F.orgA, id, ids[0] ?? '', 'down')
    expect(await titles()).toEqual(['c', 'a', 'b'])
    // Past either end succeeds and moves nothing. `ids[1]` ('b') and not `ids[2]` ('c'): the two
    // moves above have carried 'c' to the front, and 'b' -- untouched by either -- is the one
    // still actually last.
    expect((await moveTemplateItem(h.db, owner, F.orgA, id, ids[1] ?? '', 'down')).ok).toBe(true)
    expect(await titles()).toEqual(['c', 'a', 'b'])
    expect((await detail(owner, id))?.items.map((i) => i.position)).toEqual([0, 1, 2])
  })

  it('moves an item even when earlier writes left every position tied', async () => {
    await seedExec(`update template_items set position = 0 where template_id = $1`, [F.templateA])
    const before = (await detail(owner, F.templateA))?.items ?? []
    const last = before[1]
    if (!last) throw new Error('setup')
    await moveTemplateItem(h.db, owner, F.orgA, F.templateA, last.id, 'up')
    const after = (await detail(owner, F.templateA))?.items ?? []
    expect(after.map((i) => i.id)).toEqual([last.id, before[0]?.id])
  })

  it('updates and removes one item', async () => {
    await updateTemplateItem(h.db, owner, F.orgA, F.templateA, F.itemAShared, {
      title: 'Sign it',
      dueOffsetDays: 14,
      visibility: 'internal',
      assigneeRole: 'couple',
    })
    const t = await detail(owner, F.templateA)
    expect(t?.items.find((i) => i.id === F.itemAShared)).toMatchObject({
      title: 'Sign it',
      dueOffsetDays: 14,
      visibility: 'internal',
      assigneeRole: 'couple',
    })
    expect((await deleteTemplateItem(h.db, owner, F.orgA, F.templateA, F.itemAShared)).ok).toBe(
      true,
    )
    expect((await detail(owner, F.templateA))?.items).toHaveLength(1)
  })

  it('duplicates a template with its items, in order, as separate rows', async () => {
    const r = await duplicateTemplate(h.db, owner, F.orgA, F.templateA, ' (copy)')
    if (!r.ok) throw new Error('setup')
    const copy = await detail(owner, r.value.id)
    const source = await detail(owner, F.templateA)
    expect(copy?.name).toBe('Full planning (copy)')
    expect(copy?.items.map((i) => [i.title, i.dueOffsetDays, i.visibility])).toEqual(
      source?.items.map((i) => [i.title, i.dueOffsetDays, i.visibility]),
    )
    expect(copy?.items.some((i) => source?.items.some((s) => s.id === i.id))).toBe(false)

    // Editing the copy leaves the source alone.
    await deleteTemplateItem(h.db, owner, F.orgA, r.value.id, copy?.items[0]?.id ?? '')
    expect((await detail(owner, F.templateA))?.items).toHaveLength(2)
  })

  it('cuts a long name so the copy still fits the form limit', async () => {
    const long = 'x'.repeat(120)
    const made = await createTemplate(h.db, owner, F.orgA, { name: long, description: null })
    if (!made.ok) throw new Error('setup')
    const r = await duplicateTemplate(h.db, owner, F.orgA, made.value.id, ' (copy)')
    if (!r.ok) throw new Error('setup')
    const name = (await detail(owner, r.value.id))?.name ?? ''
    expect(name).toHaveLength(120)
    expect(name.endsWith(' (copy)')).toBe(true)
  })

  it('will not duplicate another org template', async () => {
    expect(await duplicateTemplate(h.db, owner, F.orgA, F.templateB, ' (copy)')).toEqual({
      ok: false,
      reason: 'notFound',
    })
  })
})

describe('applying is a copy', () => {
  const tasksOf = async (wedding: string) =>
    (await listTasks(WeddingScope.of(h.db, owner, F.orgA, wedding))).filter(
      (t) => t.title.includes('venue contract') || t.title.includes('fee schedule'),
    )

  it('creates one task per item with the offset resolved against the wedding', async () => {
    const r = await applyTemplate(h.db, owner, F.orgA, F.templateA, F.weddingA1)
    expect(r).toEqual({ ok: true, value: { count: 2 } })
    const rows = await tasksOf(F.weddingA1)
    expect(rows.map((t) => [t.title, t.dueOffsetDays, t.dueDate, t.visibility])).toEqual(
      expect.arrayContaining([
        // wedding A1 is 2027-07-31: 300 days before is 2026-10-04, 240 before is 2026-12-03
        ['Sign the venue contract', -300, '2026-10-04', 'shared'],
        ['Agree the planning fee schedule', -240, '2026-12-03', 'internal'],
      ]),
    )
    expect(rows.every((t) => t.assigneeRole === 'planner')).toBe(true)
  })

  it('leaves the wedding untouched when the template is edited, or deleted, afterwards', async () => {
    await applyTemplate(h.db, owner, F.orgA, F.templateA, F.weddingA1)
    const before = await tasksOf(F.weddingA1)

    await updateTemplateItem(h.db, owner, F.orgA, F.templateA, F.itemAShared, item('Renamed', -1))
    await addTemplateItem(h.db, owner, F.orgA, F.templateA, item('Added later'))
    await deleteTemplateItem(h.db, owner, F.orgA, F.templateA, F.itemAInternal)
    await deleteTemplate(h.db, owner, F.orgA, F.templateA)

    const after = await listTasks(WeddingScope.of(h.db, owner, F.orgA, F.weddingA1))
    expect(await tasksOf(F.weddingA1)).toEqual(before)
    expect(after.some((t) => t.title === 'Renamed' || t.title === 'Added later')).toBe(false)
  })

  it('adds the tasks again when applied twice', async () => {
    await applyTemplate(h.db, owner, F.orgA, F.templateA, F.weddingA1)
    await applyTemplate(h.db, owner, F.orgA, F.templateA, F.weddingA1)
    expect(await tasksOf(F.weddingA1)).toHaveLength(4)
  })

  it('still creates the tasks for a wedding with no date, undated until it has one', async () => {
    await seedExec(`update weddings set wedding_date = null where id = $1`, [F.weddingA1])
    expect((await applyTemplate(h.db, owner, F.orgA, F.templateA, F.weddingA1)).ok).toBe(true)
    const rows = await tasksOf(F.weddingA1)
    expect(rows.map((t) => [t.dueOffsetDays, t.dueDate])).toEqual(
      expect.arrayContaining([
        [-300, null],
        [-240, null],
      ]),
    )
    await seedExec(`update weddings set wedding_date = '2027-07-31' where id = $1`, [F.weddingA1])
    expect((await tasksOf(F.weddingA1)).map((t) => t.dueDate)).toContain('2026-10-04')
  })

  it('applies nothing for an empty template', async () => {
    const made = await createTemplate(h.db, owner, F.orgA, { name: 'Empty', description: null })
    if (!made.ok) throw new Error('setup')
    expect(await applyTemplate(h.db, owner, F.orgA, made.value.id, F.weddingA1)).toEqual({
      ok: false,
      reason: 'empty',
    })
  })

  it('applies nothing to a wedding of another org, or for a template of another org', async () => {
    const before = (await listTasks(WeddingScope.of(h.db, owner, F.orgA, F.weddingA1))).length
    expect(await applyTemplate(h.db, owner, F.orgA, F.templateA, F.weddingB1)).toEqual({
      ok: false,
      reason: 'notFound',
    })
    expect(await applyTemplate(h.db, owner, F.orgA, F.templateB, F.weddingA1)).toEqual({
      ok: false,
      reason: 'notFound',
    })
    expect(await applyTemplate(h.db, otherOrg, F.orgA, F.templateA, F.weddingA1)).toEqual({
      ok: false,
      reason: 'notFound',
    })
    expect((await listTasks(WeddingScope.of(h.db, owner, F.orgA, F.weddingA1))).length).toBe(before)
  })

  it('lets an assigned member apply to their wedding and to no other', async () => {
    expect(await applyTemplate(h.db, member, F.orgA, F.templateA, F.weddingA1)).toEqual({
      ok: true,
      value: { count: 2 },
    })
    expect(await applyTemplate(h.db, member, F.orgA, F.templateA, F.weddingA2)).toEqual({
      ok: false,
      reason: 'notFound',
    })
    expect(await tasksOf(F.weddingA2)).toEqual([])
  })

  it('refuses a couple', async () => {
    expect(await applyTemplate(h.db, couple, F.orgA, F.templateA, F.weddingA1)).toEqual({
      ok: false,
      reason: 'notFound',
    })
  })
})
