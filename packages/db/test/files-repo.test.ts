import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { newId } from '../src/id.ts'
import {
  confirmFile,
  createPendingFile,
  getFile,
  listFiles,
  type Memberships,
  removeFile,
  renameFile,
  resolveMemberships,
  setFileVisibility,
} from '../src/repos/index.ts'
import { connect, F, type Harness, NOT_FOUND, reseed, unwrap } from './harness.ts'

/**
 * `repos/files.ts` against a real Postgres, with the real policies (slice S5).
 *
 * `planner-isolation.test.ts` proves what the POLICIES do on their own. This proves what the
 * repository adds: the couple and editor refusal before a transaction opens, the plain-FK
 * parent check, and the pending-row lifecycle that stands in for a `status` column.
 *
 * Tests that write make their own rows with `newId()` and restore nothing, so a list's
 * contents depend on file order. Assertions on lists therefore name fixture ids and use
 * `arrayContaining` rather than counting.
 */

let h: Harness
let owner: Memberships
let admin: Memberships
let member: Memberships
let ownerB: Memberships
let couple: Memberships

beforeAll(async () => {
  h = connect()
  await reseed()
  owner = await resolveMemberships(h.db, F.staffA)
  // `staffDual` is admin of org A and owner of org C.
  admin = await resolveMemberships(h.db, F.staffDual)
  member = await resolveMemberships(h.db, F.memberA)
  ownerB = await resolveMemberships(h.db, F.staffB)
  couple = await resolveMemberships(h.db, F.coupleA1)
})
afterAll(async () => {
  await h?.end()
})

const pending = (kind: 'file' | 'image' = 'file') => {
  const id = newId()
  return {
    id,
    kind,
    name: `s5 ${id}`,
    storageKey: `${F.orgA}/${F.weddingA1}/${id}`,
    sizeBytes: 1234,
    mime: kind === 'image' ? 'image/png' : 'application/pdf',
    visibility: 'shared' as const,
  }
}

describe('listFiles', () => {
  it('lists one wedding and one kind for an owner, not the whole org', async () => {
    const a1 = (await listFiles(h.db, owner, F.orgA, F.weddingA1, 'file'))?.map((f) => f.id)
    expect(a1).toEqual(expect.arrayContaining([F.fileA1Internal, F.fileA1Shared]))
    // The image belongs to A2 and the org-wide principal can see it: only the `weddingId`
    // predicate keeps it out of this list.
    expect(a1).not.toContain(F.fileA2Shared)

    expect((await listFiles(h.db, owner, F.orgA, F.weddingA2, 'image'))?.map((f) => f.id)).toEqual([
      F.fileA2Shared,
    ])
    expect(await listFiles(h.db, owner, F.orgA, F.weddingA1, 'image')).toEqual([])
  })

  it('reads the uploader as a name or an address, never blank', async () => {
    const row = pending()
    await createPendingFile(h.db, owner, F.orgA, F.weddingA1, row)
    await confirmFile(h.db, owner, F.orgA, F.weddingA1, row.id)
    const found = await getFile(h.db, owner, F.orgA, F.weddingA1, row.id)
    expect(found?.uploadedBy).toBe(F.staffA)
    expect(found?.uploadedByName).toBeTruthy()
  })

  it('shows an assigned member their wedding and refuses its sibling', async () => {
    const own = (await listFiles(h.db, member, F.orgA, F.weddingA1, 'file'))?.map((f) => f.id)
    expect(own).toEqual(expect.arrayContaining([F.fileA1Internal, F.fileA1Shared]))
    expect(await listFiles(h.db, member, F.orgA, F.weddingA2, 'image')).toBeNull()
  })

  it('answers null, not empty, for anyone without standing', async () => {
    expect(await listFiles(h.db, ownerB, F.orgA, F.weddingA1, 'file')).toBeNull()
    // Own org, another org's wedding: RLS hides every row, so there is nothing to list.
    expect(await listFiles(h.db, ownerB, F.orgB, F.weddingA1, 'file')).toEqual([])
    // A couple is refused before a transaction opens (spec 0003).
    expect(await listFiles(h.db, couple, F.orgA, F.weddingA1, 'file')).toBeNull()
  })
})

describe('the pending lifecycle', () => {
  it('hides a row until it is confirmed, then shows it', async () => {
    const row = pending('image')
    expect(await createPendingFile(h.db, owner, F.orgA, F.weddingA1, row)).toEqual({
      ok: true,
      value: null,
    })

    expect(await getFile(h.db, owner, F.orgA, F.weddingA1, row.id)).toBeNull()
    expect(
      (await listFiles(h.db, owner, F.orgA, F.weddingA1, 'image'))?.some((f) => f.id === row.id),
    ).toBe(false)

    const confirmed = unwrap(await confirmFile(h.db, owner, F.orgA, F.weddingA1, row.id))
    expect(confirmed).toMatchObject({ id: row.id, kind: 'image', sizeBytes: 1234 })
    expect(
      (await listFiles(h.db, owner, F.orgA, F.weddingA1, 'image'))?.some((f) => f.id === row.id),
    ).toBe(true)
  })

  it('refuses a confirm from anyone but the uploader', async () => {
    const row = pending()
    await createPendingFile(h.db, owner, F.orgA, F.weddingA1, row)
    expect(await confirmFile(h.db, admin, F.orgA, F.weddingA1, row.id)).toEqual(NOT_FOUND)
    expect(await getFile(h.db, owner, F.orgA, F.weddingA1, row.id)).toBeNull()
  })

  it('does not let a confirm bring a deleted file back', async () => {
    const row = pending()
    await createPendingFile(h.db, owner, F.orgA, F.weddingA1, row)
    await confirmFile(h.db, owner, F.orgA, F.weddingA1, row.id)
    expect(await removeFile(h.db, owner, F.orgA, F.weddingA1, row.id)).toEqual({
      ok: true,
      value: null,
    })

    expect(await confirmFile(h.db, owner, F.orgA, F.weddingA1, row.id)).toEqual(NOT_FOUND)
    expect(await getFile(h.db, owner, F.orgA, F.weddingA1, row.id)).toBeNull()
  })

  it('will not point a row at a wedding the caller cannot see', async () => {
    // The FK is plain, so without the parent read this insert would succeed with org A's
    // `org_id` and org B's wedding id.
    const row = { ...pending(), storageKey: `${F.orgA}/${F.weddingB1}/x` }
    expect(await createPendingFile(h.db, owner, F.orgA, F.weddingB1, row)).toEqual(NOT_FOUND)
  })

  it('refuses a couple and an unassigned member the insert', async () => {
    expect(await createPendingFile(h.db, couple, F.orgA, F.weddingA1, pending())).toEqual(NOT_FOUND)
    expect(await createPendingFile(h.db, member, F.orgA, F.weddingA2, pending())).toEqual(NOT_FOUND)
  })

  it('lets an assigned member upload to their own wedding', async () => {
    const row = pending()
    expect(await createPendingFile(h.db, member, F.orgA, F.weddingA1, row)).toEqual({
      ok: true,
      value: null,
    })
    expect(await confirmFile(h.db, member, F.orgA, F.weddingA1, row.id)).toMatchObject({ ok: true })
  })
})

describe('renaming, visibility and removal', () => {
  it('renames and flips visibility of a confirmed file', async () => {
    const row = pending()
    await createPendingFile(h.db, owner, F.orgA, F.weddingA1, row)
    await confirmFile(h.db, owner, F.orgA, F.weddingA1, row.id)

    expect(await renameFile(h.db, owner, F.orgA, F.weddingA1, row.id, 'Floor plan')).toEqual({
      ok: true,
      value: null,
    })
    expect(await setFileVisibility(h.db, owner, F.orgA, F.weddingA1, row.id, 'internal')).toEqual({
      ok: true,
      value: null,
    })
    expect(await getFile(h.db, owner, F.orgA, F.weddingA1, row.id)).toMatchObject({
      name: 'Floor plan',
      visibility: 'internal',
    })
  })

  it('cannot rename a pending row, nor a row through the wrong wedding', async () => {
    const row = pending()
    await createPendingFile(h.db, owner, F.orgA, F.weddingA1, row)
    expect(await renameFile(h.db, owner, F.orgA, F.weddingA1, row.id, 'x')).toEqual(NOT_FOUND)

    await confirmFile(h.db, owner, F.orgA, F.weddingA1, row.id)
    expect(await renameFile(h.db, owner, F.orgA, F.weddingA2, row.id, 'x')).toEqual(NOT_FOUND)
    expect(await removeFile(h.db, owner, F.orgA, F.weddingA2, row.id)).toEqual(NOT_FOUND)
  })

  it('removes once and reports the second attempt as nothing to do', async () => {
    const row = pending()
    await createPendingFile(h.db, owner, F.orgA, F.weddingA1, row)
    await confirmFile(h.db, owner, F.orgA, F.weddingA1, row.id)
    expect(await removeFile(h.db, owner, F.orgA, F.weddingA1, row.id)).toEqual({
      ok: true,
      value: null,
    })
    expect(await removeFile(h.db, owner, F.orgA, F.weddingA1, row.id)).toEqual(NOT_FOUND)
  })

  it('refuses every write to a couple and to another org', async () => {
    expect(await removeFile(h.db, couple, F.orgA, F.weddingA1, F.fileA1Shared)).toEqual(NOT_FOUND)
    expect(await removeFile(h.db, ownerB, F.orgA, F.weddingA1, F.fileA1Shared)).toEqual(NOT_FOUND)
    expect(await getFile(h.db, owner, F.orgA, F.weddingA1, F.fileA1Shared)).not.toBeNull()
  })
})
