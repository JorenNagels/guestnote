import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { newId } from '../src/id.ts'
import {
  addWeddingVendor,
  archiveVendor,
  createPendingFile,
  createVendorLink,
  deleteBudgetLine,
  getBudget,
  getPayments,
  getWeddingVendors,
  listFiles,
  listVendors,
  type Memberships,
  removeFile,
  removeWeddingVendor,
  resolveMemberships,
  resolveVendorLinkByHash,
  restoreBudgetLine,
  restoreFile,
  restoreVendor,
  restoreWeddingVendor,
  WeddingScope,
} from '../src/repos/index.ts'
import { connect, F, type Harness, NOT_FOUND, reseed, seedExec } from './harness.ts'

/**
 * Spec 0009 C4: the four restores that make "delete at once, then Undo" safe, through the real
 * policies. Each is authorised like the delete it undoes, so each is asked the same three
 * questions: does it bring back the caller's own row, does it refuse a row of another wedding
 * (run as the org-wide OWNER, the shape RLS alone would let through) and of another org, and
 * does it refuse what is not a soft delete.
 *
 * `beforeEach` reseeds: every case deletes something first, and a restore that leaked into the
 * next case would make its "still gone" assertion pass or fail for the wrong reason.
 */

let h: Harness
let owner: Memberships
let member: Memberships
let couple: Memberships
let ownerB: Memberships

const A1 = F.weddingA1
const A2 = F.weddingA2

beforeAll(async () => {
  h = connect()
  // Before the memberships are read: on a fresh database there is nobody to resolve yet.
  await reseed()
  owner = await resolveMemberships(h.db, F.staffA)
  member = await resolveMemberships(h.db, F.memberA)
  couple = await resolveMemberships(h.db, F.coupleA1)
  ownerB = await resolveMemberships(h.db, F.staffB)
})
beforeEach(async () => {
  await reseed()
})
afterAll(async () => {
  await h?.end()
})

const scope = (m: Memberships, org: string, wedding: string) =>
  WeddingScope.of(h.db, m, org, wedding)

describe('restoreBudgetLine', () => {
  it('brings the line back, and its payments with it on both screens', async () => {
    expect((await deleteBudgetLine(scope(owner, F.orgA, A1), F.budgetLineA1)).ok).toBe(true)
    expect((await getPayments(scope(owner, F.orgA, A1)))?.payments).toEqual([])

    expect(await restoreBudgetLine(scope(owner, F.orgA, A1), F.budgetLineA1)).toEqual({
      ok: true,
      value: { id: F.budgetLineA1 },
    })
    const budget = await getBudget(scope(owner, F.orgA, A1))
    expect(budget?.lines.map((l) => l.id)).toEqual([F.budgetLineA1])
    expect(budget?.payments.map((p) => p.budgetLineId)).toEqual([F.budgetLineA1])
    expect((await getPayments(scope(owner, F.orgA, A1)))?.payments.map((p) => p.id)).toEqual([
      F.paymentA1,
    ])
  })

  it('works for an assigned member, like the delete', async () => {
    await deleteBudgetLine(scope(member, F.orgA, A1), F.budgetLineA1)
    expect((await restoreBudgetLine(scope(member, F.orgA, A1), F.budgetLineA1)).ok).toBe(true)
  })

  it("refuses a sibling wedding's line, even for the org-wide owner", async () => {
    await deleteBudgetLine(scope(owner, F.orgA, A2), F.budgetLineA2)
    expect(await restoreBudgetLine(scope(owner, F.orgA, A1), F.budgetLineA2)).toEqual({
      ok: false,
      reason: 'lineNotFound',
    })
    expect((await getBudget(scope(owner, F.orgA, A2)))?.lines).toEqual([])
  })

  it('refuses another org, an unassigned member and the couple', async () => {
    await deleteBudgetLine(scope(owner, F.orgA, A1), F.budgetLineA1)
    expect(await restoreBudgetLine(scope(ownerB, F.orgA, A1), F.budgetLineA1)).toEqual(NOT_FOUND)
    expect(await restoreBudgetLine(scope(ownerB, F.orgB, A1), F.budgetLineA1)).toEqual(NOT_FOUND)
    expect(await restoreBudgetLine(scope(couple, F.orgA, A1), F.budgetLineA1)).toEqual(NOT_FOUND)
    expect((await getBudget(scope(owner, F.orgA, A1)))?.lines).toEqual([])

    await deleteBudgetLine(scope(owner, F.orgA, A2), F.budgetLineA2)
    expect(await restoreBudgetLine(scope(member, F.orgA, A2), F.budgetLineA2)).toEqual(NOT_FOUND)
    expect((await getBudget(scope(owner, F.orgA, A2)))?.lines).toEqual([])
  })

  // The parent read: a line never comes back onto a deleted wedding.
  it('answers notFound once the wedding itself is deleted, and leaves the line deleted', async () => {
    await deleteBudgetLine(scope(owner, F.orgA, A1), F.budgetLineA1)
    await seedExec(`update weddings set deleted_at = now() where id = $1`, [A1])
    expect(await restoreBudgetLine(scope(owner, F.orgA, A1), F.budgetLineA1)).toEqual(NOT_FOUND)
    await seedExec(`update weddings set deleted_at = null where id = $1`, [A1])
    expect((await getBudget(scope(owner, F.orgA, A1)))?.lines).toEqual([])
  })

  it('answers lineNotFound for a line that was never deleted', async () => {
    expect(await restoreBudgetLine(scope(owner, F.orgA, A1), F.budgetLineA1)).toEqual({
      ok: false,
      reason: 'lineNotFound',
    })
  })
})

describe('restoreFile', () => {
  it('brings a removed file back into the list', async () => {
    expect((await removeFile(scope(owner, F.orgA, A1), F.fileA1Shared)).ok).toBe(true)
    expect(await restoreFile(scope(owner, F.orgA, A1), F.fileA1Shared)).toEqual({
      ok: true,
      value: null,
    })
    const ids = (await listFiles(scope(owner, F.orgA, A1), 'file'))?.map((f) => f.id)
    expect(ids).toContain(F.fileA1Shared)
  })

  it('brings a removed moodboard image back onto its board', async () => {
    await removeFile(scope(member, F.orgA, A1), F.imageA1Photo)
    expect((await restoreFile(scope(member, F.orgA, A1), F.imageA1Photo)).ok).toBe(true)
    const board = await listFiles(scope(owner, F.orgA, A1), 'image', F.boardA1Photo)
    expect(board?.map((f) => f.id)).toEqual([F.imageA1Photo])
  })

  it('never confirms a pending upload', async () => {
    const id = newId()
    const made = await createPendingFile(scope(owner, F.orgA, A1), {
      id,
      kind: 'file',
      name: 'half.pdf',
      storageKey: `${F.orgA}/${A1}/${id}`,
      sizeBytes: 10,
      mime: 'application/pdf',
      visibility: 'shared',
    })
    expect(made.ok).toBe(true)
    expect(await restoreFile(scope(owner, F.orgA, A1), id)).toEqual(NOT_FOUND)
    const ids = (await listFiles(scope(owner, F.orgA, A1), 'file'))?.map((f) => f.id)
    expect(ids).not.toContain(id)
  })

  it("refuses a sibling wedding's file, another org and the couple", async () => {
    await removeFile(scope(owner, F.orgA, A2), F.fileA2Shared)
    expect(await restoreFile(scope(owner, F.orgA, A1), F.fileA2Shared)).toEqual(NOT_FOUND)
    expect(await restoreFile(scope(member, F.orgA, A2), F.fileA2Shared)).toEqual(NOT_FOUND)

    await removeFile(scope(owner, F.orgA, A1), F.fileA1Shared)
    expect(await restoreFile(scope(ownerB, F.orgA, A1), F.fileA1Shared)).toEqual(NOT_FOUND)
    expect(await restoreFile(scope(couple, F.orgA, A1), F.fileA1Shared)).toEqual(NOT_FOUND)

    expect((await listFiles(scope(owner, F.orgA, A2), 'image'))?.map((f) => f.id)).not.toContain(
      F.fileA2Shared,
    )
    expect((await listFiles(scope(owner, F.orgA, A1), 'file'))?.map((f) => f.id)).not.toContain(
      F.fileA1Shared,
    )
  })

  it('answers notFound once the wedding itself is deleted, and leaves the file removed', async () => {
    await removeFile(scope(owner, F.orgA, A1), F.fileA1Shared)
    await seedExec(`update weddings set deleted_at = now() where id = $1`, [A1])
    expect(await restoreFile(scope(owner, F.orgA, A1), F.fileA1Shared)).toEqual(NOT_FOUND)
    await seedExec(`update weddings set deleted_at = null where id = $1`, [A1])
    expect((await listFiles(scope(owner, F.orgA, A1), 'file'))?.map((f) => f.id)).not.toContain(
      F.fileA1Shared,
    )
  })

  it('answers notFound for a live file', async () => {
    expect(await restoreFile(scope(owner, F.orgA, A1), F.fileA1Shared)).toEqual(NOT_FOUND)
  })
})

describe('restoreVendor', () => {
  it('brings an archived vendor back into the directory', async () => {
    expect((await archiveVendor(h.db, owner, F.orgA, F.vendorA2)).ok).toBe(true)
    expect(await restoreVendor(h.db, owner, F.orgA, F.vendorA2)).toEqual({ ok: true, value: null })
    const names = (await listVendors(h.db, owner, F.orgA))?.vendors.map((v) => v.id)
    expect(names).toContain(F.vendorA2)
  })

  it('refuses a member, as the archive does, and another org', async () => {
    await archiveVendor(h.db, owner, F.orgA, F.vendorA2)
    expect(await restoreVendor(h.db, member, F.orgA, F.vendorA2)).toEqual({
      ok: false,
      reason: 'forbidden',
    })
    expect(await restoreVendor(h.db, ownerB, F.orgA, F.vendorA2)).toEqual({
      ok: false,
      reason: 'forbidden',
    })
    // Owner of B, naming A's vendor under B's org: RLS and the `org_id` in the where both say no.
    expect(await restoreVendor(h.db, ownerB, F.orgB, F.vendorA2)).toEqual(NOT_FOUND)
    const ids = (await listVendors(h.db, owner, F.orgA))?.vendors.map((v) => v.id)
    expect(ids).not.toContain(F.vendorA2)
  })

  it('answers notFound for a vendor that was never archived', async () => {
    expect(await restoreVendor(h.db, owner, F.orgA, F.vendorA)).toEqual(NOT_FOUND)
  })
})

const FORBIDDEN = { ok: false, reason: 'forbidden' }

/** Ages a removal past the two-minute undo window, as the database clock would. */
const ageRemoval = (id: string) =>
  seedExec(`update wedding_vendors set deleted_at = now() - interval '3 minutes' where id = $1`, [
    id,
  ])

describe('restoreWeddingVendor', () => {
  it("puts a member's own fresh removal back, status and all, inside the window", async () => {
    expect((await removeWeddingVendor(scope(member, F.orgA, A1), F.wedVendorA1)).ok).toBe(true)
    expect(await restoreWeddingVendor(scope(member, F.orgA, A1), F.wedVendorA1)).toEqual({
      ok: true,
      value: null,
    })
    const linked = (await getWeddingVendors(scope(owner, F.orgA, A1)))?.linked
    expect(linked?.map((v) => [v.id, v.status])).toEqual([[F.wedVendorA1, 'booked']])
  })

  // This is the READ's `weddingId` (mutation-checked). The update's own `weddingId` cannot be
  // told apart from here: the read in the same transaction has already refused any other row,
  // so the second one is a belt nothing can reach without first removing the braces.
  it("refuses a sibling wedding's row, even for the org-wide owner, and another org", async () => {
    await removeWeddingVendor(scope(owner, F.orgA, A2), F.wedVendorA2)
    expect(await restoreWeddingVendor(scope(owner, F.orgA, A1), F.wedVendorA2)).toEqual(NOT_FOUND)
    expect(await restoreWeddingVendor(scope(member, F.orgA, A2), F.wedVendorA2)).toEqual(NOT_FOUND)
    expect(await restoreWeddingVendor(scope(ownerB, F.orgA, A2), F.wedVendorA2)).toEqual(NOT_FOUND)
    expect(await restoreWeddingVendor(scope(couple, F.orgA, A1), F.wedVendorA2)).toEqual(NOT_FOUND)
    expect((await getWeddingVendors(scope(owner, F.orgA, A2)))?.linked).toEqual([])
  })

  it('says duplicate when the vendor was added to the wedding again since', async () => {
    await removeWeddingVendor(scope(owner, F.orgA, A1), F.wedVendorA1)
    const again = await addWeddingVendor(scope(owner, F.orgA, A1), F.vendorA)
    expect(again.ok).toBe(true)
    expect(await restoreWeddingVendor(scope(owner, F.orgA, A1), F.wedVendorA1)).toEqual({
      ok: false,
      reason: 'duplicate',
    })
    const linked = (await getWeddingVendors(scope(owner, F.orgA, A1)))?.linked ?? []
    expect(linked.map((v) => v.id)).toEqual([again.ok ? again.value.id : ''])
  })

  it('answers notFound for a row that was never removed', async () => {
    expect(await restoreWeddingVendor(scope(owner, F.orgA, A1), F.wedVendorA1)).toEqual(NOT_FOUND)
  })

  // Batch C review: a restore revives the row's vendor link, which a member can neither mint nor
  // revoke. So a member restores only inside the undo window; an owner or admin at any time.
  describe('the undo window and the vendor link', () => {
    const HASH = 'hash-restore-window'
    const mintLink = async () => {
      const made = await createVendorLink(scope(owner, F.orgA, A1), F.wedVendorA1, {
        tokenHash: HASH,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      })
      expect(made.ok).toBe(true)
      expect((await resolveVendorLinkByHash(h.db, HASH))?.status).toBe('live')
    }

    it("refuses a member's restore once the window has passed, and the link stays dead", async () => {
      await mintLink()
      await removeWeddingVendor(scope(owner, F.orgA, A1), F.wedVendorA1)
      await ageRemoval(F.wedVendorA1)

      expect(await restoreWeddingVendor(scope(member, F.orgA, A1), F.wedVendorA1)).toEqual(
        FORBIDDEN,
      )
      expect(await resolveVendorLinkByHash(h.db, HASH)).toBeNull()
      expect((await getWeddingVendors(scope(owner, F.orgA, A1)))?.linked).toEqual([])
    })

    it('lets the owner restore after the window, which revives the link', async () => {
      await mintLink()
      await removeWeddingVendor(scope(owner, F.orgA, A1), F.wedVendorA1)
      await ageRemoval(F.wedVendorA1)

      expect(await restoreWeddingVendor(scope(owner, F.orgA, A1), F.wedVendorA1)).toEqual({
        ok: true,
        value: null,
      })
      expect((await resolveVendorLinkByHash(h.db, HASH))?.status).toBe('live')
    })

    it("lets a member undo the owner's removal inside the window", async () => {
      await mintLink()
      await removeWeddingVendor(scope(owner, F.orgA, A1), F.wedVendorA1)
      expect((await restoreWeddingVendor(scope(member, F.orgA, A1), F.wedVendorA1)).ok).toBe(true)
    })
  })

  // The parent read: nothing comes back onto a deleted wedding, not even for the owner.
  it('answers notFound once the wedding itself is deleted, and leaves the row removed', async () => {
    await removeWeddingVendor(scope(owner, F.orgA, A1), F.wedVendorA1)
    await seedExec(`update weddings set deleted_at = now() where id = $1`, [A1])
    expect(await restoreWeddingVendor(scope(owner, F.orgA, A1), F.wedVendorA1)).toEqual(NOT_FOUND)
    await seedExec(`update weddings set deleted_at = null where id = $1`, [A1])
    expect((await getWeddingVendors(scope(owner, F.orgA, A1)))?.linked).toEqual([])
  })
})
