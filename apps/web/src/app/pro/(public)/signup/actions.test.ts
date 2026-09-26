import { MAX_STUDIO_NAME } from '@guestnote/db'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { STUDIO_NAME_MAX } from '../../../../components/signup/state.ts'

/**
 * Sign-up's Server Functions. Mocked: the repo, the session, the mailer core, cookies and the
 * two navigation calls. What is asserted is each function's own decisions -- who is refused,
 * before what, and which org it acts in -- not SQL, which `packages/db/test` owns.
 *
 * The org assertions matter most here: these functions pick the org themselves (the one the
 * caller OWNS), never from the `gn_org` cookie or the client, and a staff membership elsewhere
 * must not be mistaken for it.
 */
const currentSession = vi.fn()
const resolveMemberships = vi.fn()
const createStudio = vi.fn()
const seedTemplates = vi.fn()
const applyTemplate = vi.fn()
const createWedding = vi.fn()
const studioSettings = vi.fn()
const myPendingInvitations = vi.fn()
const acceptInvitationById = vi.fn()
const inviteStaff = vi.fn()
const cookieSet = vi.fn()
const reportSilentFailure = vi.fn()
const redirect = vi.fn((to: string) => {
  // The real one throws to unwind; a mock that returns would let code after it run.
  throw new Error(`REDIRECT ${to}`)
})

vi.mock('@guestnote/db', async (orig) => ({
  ...(await orig<typeof import('@guestnote/db')>()),
  resolveMemberships: (...a: unknown[]) => resolveMemberships(...a),
  createStudio: (...a: unknown[]) => createStudio(...a),
  seedTemplates: (...a: unknown[]) => seedTemplates(...a),
  applyTemplate: (...a: unknown[]) => applyTemplate(...a),
  createWedding: (...a: unknown[]) => createWedding(...a),
  studioSettings: (...a: unknown[]) => studioSettings(...a),
  myPendingInvitations: (...a: unknown[]) => myPendingInvitations(...a),
  acceptInvitationById: (...a: unknown[]) => acceptInvitationById(...a),
}))
vi.mock('../../../../lib/db.ts', () => ({ getDb: () => ({}) }))
vi.mock('../../../../lib/principal.ts', () => ({ currentSession: () => currentSession() }))
vi.mock('../../../../lib/observability.ts', () => ({
  reportSilentFailure: (...a: unknown[]) => reportSilentFailure(...a),
}))
vi.mock('../../../../lib/staff-invite.ts', async (orig) => ({
  ...(await orig<typeof import('../../../../lib/staff-invite.ts')>()),
  inviteStaff: (...a: unknown[]) => inviteStaff(...a),
}))
vi.mock('next/headers', () => ({ cookies: async () => ({ set: cookieSet }) }))
vi.mock('next/navigation', () => ({ redirect: (to: string) => redirect(to) }))
vi.mock('next-intl/server', () => ({ getLocale: async () => 'fr' }))

const { createStudioAction, createFirstWeddingAction, inviteTeamAction, joinInvitationAction } =
  await import('./actions.ts')

const USER = 'u1'
const OWN = '019a0000-0000-7000-8000-00000000000a'
const OTHER = '019a0000-0000-7000-8000-00000000000b'
const TEMPLATE = '019a0000-0000-7000-8000-0000000000c1'
const INVITE = '019a0000-0000-7000-8000-0000000000d1'

const SESSION = { userId: USER, email: 'ilse@studiowit.be', name: 'Ilse', lastOrgId: null }
/** Owner of their own studio AND a member of someone else's -- the case the org choice is for. */
const OWNER = {
  userId: USER,
  orgs: [
    { orgId: OTHER, role: 'member' },
    { orgId: OWN, role: 'owner' },
  ],
  weddings: [],
}
const STAFF_ONLY = { userId: USER, orgs: [{ orgId: OTHER, role: 'admin' }], weddings: [] }

const form = (entries: Record<string, string>) => {
  const fd = new FormData()
  for (const [k, v] of Object.entries(entries)) fd.set(k, v)
  return fd
}

beforeEach(() => {
  vi.clearAllMocks()
  currentSession.mockResolvedValue(SESSION)
  resolveMemberships.mockResolvedValue(OWNER)
  createStudio.mockResolvedValue({ ok: true, value: { orgId: OWN, slug: 'studio-wit' } })
  seedTemplates.mockResolvedValue({ ok: true, value: { ids: ['t1', 't2', 't3'] } })
  createWedding.mockResolvedValue({ ok: true, value: { id: 'w-new' } })
  applyTemplate.mockResolvedValue({ ok: true, value: { count: 12 } })
  studioSettings.mockResolvedValue({ id: OWN, name: 'Studio Wit', logoKey: null })
  inviteStaff.mockResolvedValue({ ok: true })
  myPendingInvitations.mockResolvedValue([
    { invitationId: INVITE, orgId: OTHER, weddingId: null, role: 'member' },
  ])
  acceptInvitationById.mockResolvedValue({
    outcome: 'accepted',
    orgId: OTHER,
    weddingId: null,
    role: 'member',
  })
})

it('keeps the client bound on the studio name equal to the database one', () => {
  expect(STUDIO_NAME_MAX).toBe(MAX_STUDIO_NAME)
})

describe('createStudioAction', () => {
  const valid = () => form({ name: '  Studio Wit ', ownerName: 'Ilse Verhoeven' })

  it('creates, seeds the starters in the request locale, opens the studio, moves on', async () => {
    await expect(createStudioAction({}, valid())).rejects.toThrow('REDIRECT /signup?step=wedding')
    expect(createStudio).toHaveBeenCalledWith({}, USER, {
      name: 'Studio Wit',
      slugBase: 'studio-wit',
      ownerName: 'Ilse Verhoeven',
    })
    const [, m, orgId, templates] = seedTemplates.mock.calls[0] ?? []
    expect(m).toBe(OWNER)
    expect(orgId).toBe(OWN)
    expect(templates[0].name).toBe('Organisation complète · 12 mois')
    expect(cookieSet).toHaveBeenCalledWith('gn_org', OWN, expect.anything())
  })

  it('refuses without a session, before parsing or writing', async () => {
    currentSession.mockResolvedValue(null)
    expect(await createStudioAction({}, valid())).toEqual({ form: 'forbidden' })
    expect(createStudio).not.toHaveBeenCalled()
  })

  it.each([
    [{ name: '', ownerName: 'Ilse' }, { name: 'required' }],
    [{ name: 'Studio', ownerName: '   ' }, { ownerName: 'required' }],
    [{ name: 'x'.repeat(81), ownerName: 'Ilse' }, { name: 'tooLong' }],
    [{ name: 'Studio', ownerName: 'x'.repeat(121) }, { ownerName: 'tooLong' }],
  ])('refuses %o with %o and writes nothing', async (entries, errors) => {
    const state = await createStudioAction({}, form(entries))
    expect(state.errors).toEqual(errors)
    expect(createStudio).not.toHaveBeenCalled()
  })

  it('sends a second submit forward to the same step, acting in the owned studio', async () => {
    // The first submit may have committed and lost its response; this one still has to point
    // the dashboard at the new studio rather than at a staff membership elsewhere.
    createStudio.mockResolvedValue({ ok: false, reason: 'alreadyOwner' })
    await expect(createStudioAction({}, valid())).rejects.toThrow('REDIRECT /signup?step=wedding')
    expect(seedTemplates).not.toHaveBeenCalled()
    expect(cookieSet).toHaveBeenCalledWith('gn_org', OWN, expect.anything())
  })

  it('keeps the values when the database refuses the name', async () => {
    createStudio.mockResolvedValue({ ok: false, reason: 'invalid' })
    expect(await createStudioAction({}, valid())).toEqual({
      form: 'failed',
      values: { name: 'Studio Wit', ownerName: 'Ilse Verhoeven' },
    })
  })

  it('does not fail the sign-up when seeding throws, and reports it', async () => {
    seedTemplates.mockRejectedValue(new Error('boom'))
    await expect(createStudioAction({}, valid())).rejects.toThrow('REDIRECT /signup?step=wedding')
    expect(reportSilentFailure).toHaveBeenCalledOnce()
  })
})

describe('createFirstWeddingAction', () => {
  it('creates in the studio the caller OWNS, applies the plan, moves to the team step', async () => {
    await expect(
      createFirstWeddingAction({}, form({ coupleDisplayName: 'Els & Jan', template: TEMPLATE })),
    ).rejects.toThrow('REDIRECT /signup?step=team')
    expect(createWedding.mock.calls[0]?.[2]).toBe(OWN)
    expect(applyTemplate).toHaveBeenCalledWith({}, OWNER, OWN, TEMPLATE, 'w-new')
  })

  it('applies nothing for "Start empty"', async () => {
    await expect(
      createFirstWeddingAction({}, form({ coupleDisplayName: 'Els & Jan', template: '' })),
    ).rejects.toThrow('REDIRECT')
    expect(applyTemplate).not.toHaveBeenCalled()
  })

  it('refuses someone who owns no studio, even as admin elsewhere', async () => {
    resolveMemberships.mockResolvedValue(STAFF_ONLY)
    expect(await createFirstWeddingAction({}, form({ coupleDisplayName: 'Els' }))).toEqual({
      form: 'forbidden',
    })
    expect(createWedding).not.toHaveBeenCalled()
  })

  it('refuses without a session', async () => {
    currentSession.mockResolvedValue(null)
    expect(await createFirstWeddingAction({}, form({ coupleDisplayName: 'Els' }))).toEqual({
      form: 'forbidden',
    })
    expect(resolveMemberships).not.toHaveBeenCalled()
  })

  it('returns field errors and creates nothing', async () => {
    const state = await createFirstWeddingAction({}, form({ coupleDisplayName: '' }))
    expect(state.errors).toEqual({ coupleDisplayName: 'required' })
    expect(createWedding).not.toHaveBeenCalled()
  })
})

describe('inviteTeamAction', () => {
  it('invites every filled row as a member of the owned studio, then shows Ready', async () => {
    await expect(
      inviteTeamAction({}, form({ email0: 'Tom@Studio.be', email1: '', email2: 'an@studio.be' })),
    ).rejects.toThrow('REDIRECT /signup?step=ready')
    expect(inviteStaff).toHaveBeenCalledTimes(2)
    expect(inviteStaff.mock.calls[0]?.[0]).toMatchObject({
      orgId: OWN,
      orgName: 'Studio Wit',
      email: 'tom@studio.be',
      role: 'member',
      inviter: 'Ilse',
      locale: 'fr',
    })
  })

  it('blocks the whole send on one bad address, before reading the session', async () => {
    const state = await inviteTeamAction(
      {},
      form({ email0: 'tom@studio.be', email1: 'not an address', email2: '' }),
    )
    expect(state.errors).toEqual({ 1: 'invalidEmail' })
    expect(currentSession).not.toHaveBeenCalled()
    expect(inviteStaff).not.toHaveBeenCalled()
  })

  it('refuses someone who owns no studio, keeping the rows already sent locked', async () => {
    resolveMemberships.mockResolvedValue(STAFF_ONLY)
    const state = await inviteTeamAction({ sent: [0] }, form({ email1: 'tom@studio.be' }))
    expect(state.form).toBe('forbidden')
    expect(state.sent).toEqual([0])
    expect(inviteStaff).not.toHaveBeenCalled()
  })

  it('reports the rows that failed and the ones already sent, and stays on the step', async () => {
    inviteStaff.mockResolvedValueOnce({ ok: true })
    inviteStaff.mockResolvedValueOnce({ ok: false, reason: 'mailFailed' })
    const state = await inviteTeamAction(
      {},
      form({ email0: 'tom@studio.be', email1: 'an@studio.be' }),
    )
    expect(state.sent).toEqual([0])
    expect(state.errors).toEqual({ 1: 'mailFailed' })
    expect(redirect).not.toHaveBeenCalled()
  })

  it('goes to Ready when every row is blank', async () => {
    await expect(inviteTeamAction({}, form({}))).rejects.toThrow('REDIRECT /signup?step=ready')
    expect(inviteStaff).not.toHaveBeenCalled()
  })
})

describe('joinInvitationAction', () => {
  it('accepts and opens that studio, answering rather than redirecting', async () => {
    // A redirect would reject the directly-called action's promise on the client, which the
    // screen would show as a failure; the client navigates on `ok` instead.
    expect(await joinInvitationAction(INVITE)).toEqual({ ok: true })
    expect(redirect).not.toHaveBeenCalled()
    expect(acceptInvitationById).toHaveBeenCalledWith({}, INVITE, USER)
    expect(cookieSet).toHaveBeenCalledWith('gn_org', OTHER, expect.anything())
  })

  it('refuses a non-uuid and a signed-out caller without a query', async () => {
    expect(await joinInvitationAction("1' or 1=1")).toEqual({ ok: false, reason: 'unknown' })
    currentSession.mockResolvedValue(null)
    expect(await joinInvitationAction(INVITE)).toEqual({ ok: false, reason: 'unknown' })
    expect(myPendingInvitations).not.toHaveBeenCalled()
  })

  it('refuses an id that is not one of the caller’s own pending invitations', async () => {
    myPendingInvitations.mockResolvedValue([])
    expect(await joinInvitationAction(INVITE)).toEqual({ ok: false, reason: 'unknown' })
    expect(acceptInvitationById).not.toHaveBeenCalled()
  })

  it('does not accept a wedding invitation from here', async () => {
    myPendingInvitations.mockResolvedValue([
      { invitationId: INVITE, orgId: OTHER, weddingId: 'w1', role: 'couple' },
    ])
    expect(await joinInvitationAction(INVITE)).toEqual({ ok: false, reason: 'unknown' })
    expect(acceptInvitationById).not.toHaveBeenCalled()
  })

  it.each([
    ['expired', 'expired'],
    ['already_accepted', 'accepted'],
    ['wrong_user', 'unknown'],
  ])('answers %s as %s, with no redirect', async (outcome, reason) => {
    acceptInvitationById.mockResolvedValue({ outcome })
    expect(await joinInvitationAction(INVITE)).toEqual({ ok: false, reason })
    expect(cookieSet).not.toHaveBeenCalled()
  })
})
