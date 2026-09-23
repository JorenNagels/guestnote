import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The two team Server Functions. Mocked: `lib/principal.ts`, the repo, the mailer and
 * `next/cache`. These tests are about what the ACTION does with each answer -- validate
 * before touching anything, take the row back when the mail fails, revalidate only on a
 * change -- and not about SQL, which `packages/db/test` owns.
 */
const revalidatePath = vi.fn()
const createStaffInvite = vi.fn()
const revokeStaffInvite = vi.fn()
const sendStaffInviteMail = vi.fn()
const currentSession = vi.fn()
const currentMemberships = vi.fn()
const currentOrgId = vi.fn()
const currentOrgs = vi.fn()

vi.mock('next/cache', () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }))
vi.mock('next-intl/server', () => ({ getLocale: async () => 'fr' }))
vi.mock('@guestnote/db', () => ({
  createStaffInvite: (...a: unknown[]) => createStaffInvite(...a),
  revokeStaffInvite: (...a: unknown[]) => revokeStaffInvite(...a),
}))
vi.mock('../../../../lib/db.ts', () => ({ getDb: () => ({}) }))
vi.mock('../../../../lib/invite-mail.ts', () => ({
  sendStaffInviteMail: (...a: unknown[]) => sendStaffInviteMail(...a),
}))
vi.mock('../../../../lib/principal.ts', () => ({
  currentSession: () => currentSession(),
  currentMemberships: () => currentMemberships(),
  currentOrgId: () => currentOrgId(),
  currentOrgs: () => currentOrgs(),
}))

const { inviteTeamMember, revokeInvite } = await import('./actions.ts')

const ORG = '019a0000-0000-7000-8000-00000000000a'
const INVITE_ID = '019a0000-0000-7000-8000-0000000000bb'
const MEMBERSHIPS = { userId: 'u1', orgs: [{ orgId: ORG, role: 'owner' }], weddings: [] }

beforeEach(() => {
  vi.clearAllMocks()
  currentSession.mockResolvedValue({ userId: 'u1', email: 'ilse@studiowit.be', name: 'Ilse' })
  currentMemberships.mockResolvedValue(MEMBERSHIPS)
  currentOrgId.mockResolvedValue(ORG)
  currentOrgs.mockResolvedValue([{ id: ORG, name: 'Studio Wit', slug: 'wit' }])
  createStaffInvite.mockResolvedValue({ ok: true, value: { id: INVITE_ID } })
  revokeStaffInvite.mockResolvedValue({ ok: true, value: null })
  sendStaffInviteMail.mockResolvedValue({ ok: true, messageId: 'm1' })
})

describe('inviteTeamMember', () => {
  it('normalises the address, stores only a hash, mails the plaintext token, revalidates', async () => {
    const out = await inviteTeamMember({ email: '  Els@StudioWit.be ', role: 'admin' })

    expect(out).toEqual({ ok: true })
    const stored = createStaffInvite.mock.calls[0]?.[3]
    expect(stored.email).toBe('els@studiowit.be')
    expect(stored.role).toBe('admin')
    expect(stored.tokenHash).toMatch(/^[0-9a-f]{64}$/)
    expect(stored.expiresAt.getTime()).toBeGreaterThan(Date.now() + 6 * 24 * 3600 * 1000)

    const mailed = sendStaffInviteMail.mock.calls[0]?.[0]
    expect(mailed).toMatchObject({
      to: 'els@studiowit.be',
      locale: 'fr',
      inviter: 'Ilse',
      org: 'Studio Wit',
      role: 'admin',
    })
    // The credential is in the mail and not in the row.
    expect(mailed.token).not.toBe(stored.tokenHash)
    expect(JSON.stringify(stored)).not.toContain(mailed.token)
    expect(revalidatePath).toHaveBeenCalledWith('/pro/team')
  })

  it.each([
    ['not an address', 'admin', 'invalidEmail'],
    ['a@b', 'admin', 'invalidEmail'],
    ['els@studiowit.be', 'owner', 'invalidRole'],
    ['els@studiowit.be', '', 'invalidRole'],
  ])('refuses %s / %s before reading the session or writing', async (email, role, reason) => {
    expect(await inviteTeamMember({ email, role })).toEqual({ ok: false, reason })
    expect(currentSession).not.toHaveBeenCalled()
    expect(createStaffInvite).not.toHaveBeenCalled()
  })

  it('refuses without a session, without sending anything', async () => {
    currentSession.mockResolvedValue(null)
    expect(await inviteTeamMember({ email: 'els@studiowit.be', role: 'member' })).toEqual({
      ok: false,
      reason: 'forbidden',
    })
    expect(createStaffInvite).not.toHaveBeenCalled()
    expect(sendStaffInviteMail).not.toHaveBeenCalled()
  })

  it.each(['forbidden', 'duplicate', 'alreadyMember'] as const)(
    'passes the repo refusal %s through and sends no mail',
    async (kind) => {
      createStaffInvite.mockResolvedValue({ ok: false, reason: kind })
      expect(await inviteTeamMember({ email: 'els@studiowit.be', role: 'member' })).toEqual({
        ok: false,
        reason: kind,
      })
      expect(sendStaffInviteMail).not.toHaveBeenCalled()
      expect(revalidatePath).not.toHaveBeenCalled()
    },
  )

  it('takes the row back when the mail is refused', async () => {
    sendStaffInviteMail.mockResolvedValue({ ok: false, failure: 'rejected', detail: 'x' })
    expect(await inviteTeamMember({ email: 'els@studiowit.be', role: 'member' })).toEqual({
      ok: false,
      reason: 'mailFailed',
    })
    expect(revokeStaffInvite).toHaveBeenCalledWith({}, MEMBERSHIPS, ORG, INVITE_ID)
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('takes the row back when the mailer throws', async () => {
    sendStaffInviteMail.mockRejectedValue(new Error('boom'))
    expect(await inviteTeamMember({ email: 'els@studiowit.be', role: 'member' })).toEqual({
      ok: false,
      reason: 'mailFailed',
    })
    expect(revokeStaffInvite).toHaveBeenCalledOnce()
  })
})

describe('revokeInvite', () => {
  it('revokes in the caller org and revalidates', async () => {
    expect(await revokeInvite(INVITE_ID)).toEqual({ ok: true })
    expect(revokeStaffInvite).toHaveBeenCalledWith({}, MEMBERSHIPS, ORG, INVITE_ID)
    expect(revalidatePath).toHaveBeenCalledWith('/pro/team')
  })

  it('rejects a non-uuid without a query', async () => {
    expect(await revokeInvite("1' or '1'='1")).toEqual({ ok: false })
    expect(revokeStaffInvite).not.toHaveBeenCalled()
  })

  it('reports false and does not revalidate when nothing was deleted', async () => {
    revokeStaffInvite.mockResolvedValue({ ok: false, reason: 'notFound' })
    expect(await revokeInvite(INVITE_ID)).toEqual({ ok: false })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('refuses without memberships', async () => {
    currentMemberships.mockResolvedValue(null)
    expect(await revokeInvite(INVITE_ID)).toEqual({ ok: false })
    expect(revokeStaffInvite).not.toHaveBeenCalled()
  })
})
