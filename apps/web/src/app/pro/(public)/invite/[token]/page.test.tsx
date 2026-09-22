import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * What `/invite/<token>` does with a resolved invitation and a session: the one place the
 * invitation flow decides between "sign in", "spend the token" and "explain".
 *
 * ## What is real and what is mocked
 *
 * `getAuth()` is mocked -- that is the seam this page is written against, and the seam's own
 * mapping is `packages/core/src/auth/invitations.test.ts`. `AuthFlow` is imported for real and
 * never rendered: the page returns an element, and its props are the whole of the decision
 * (`boundEmail`, `blocked`, `notice`, `continueHref`). Asserting on the props rather than on
 * rendered text keeps this from depending on copy.
 *
 * The mock is on `lib/auth.ts`, which the page actually imports (see `login/page.test.tsx`
 * for what happens when it is not).
 *
 * `redirect` throws, as Next's does, so a missing `return` after it cannot hide.
 */
const resolveInvitation = vi.fn()
const acceptInvitation = vi.fn()
const getSession = vi.fn()
const redirect = vi.fn((path: string) => {
  throw new Error(`NEXT_REDIRECT:${path}`)
})

vi.mock('next/navigation', () => ({ redirect: (path: string) => redirect(path) }))
vi.mock('next/headers', () => ({ headers: async () => new Headers() }))
vi.mock('../../../../../lib/auth.ts', () => ({
  getAuth: () => ({
    resolveInvitation: (t: string) => resolveInvitation(t),
    acceptInvitation: (t: string, u: string) => acceptInvitation(t, u),
    getSession: (h: Headers) => getSession(h),
    passkeysAvailable: () => true,
    googleAvailable: () => true,
  }),
}))
vi.mock('next-intl/server', () => ({
  getLocale: async () => 'nl',
  getTranslations: async () => Object.assign((key: string) => key, { raw: (key: string) => key }),
  getFormatter: async () => ({ dateTime: () => '12 september 2027' }),
}))

const { default: InvitePage } = await import('./page.tsx')

type Props = Record<string, unknown>
const render = async (token = 'tok', search: Record<string, string> = {}): Promise<Props> => {
  const el = (await InvitePage({
    params: Promise.resolve({ token }),
    searchParams: Promise.resolve(search),
  })) as { props: Props }
  return el.props
}

const STAFF = {
  kind: 'staff',
  email: 'tom@studiowit.be',
  inviter: 'Ilse Verhoeven',
  org: 'Studio Wit',
  role: 'admin',
} as const

const SESSION = { userId: 'u1', email: 'tom@studiowit.be', name: null, lastOrgId: null }

beforeEach(() => {
  vi.clearAllMocks()
  resolveInvitation.mockResolvedValue(STAFF)
  getSession.mockResolvedValue(null)
})

describe('a visitor with no session', () => {
  it('sees the sign-in bound to the invited address, and comes back HERE afterwards', async () => {
    const props = await render('a/b tok')

    expect(props.boundEmail).toBe('tom@studiowit.be')
    expect(props.blocked).toBeUndefined()
    // Back to the invitation, not the dashboard: signing in is only half of accepting, and
    // a `continueHref` of `/` would sign them in and drop the invitation on the floor.
    expect(props.continueHref).toBe('/invite/a%2Fb%20tok')
  })

  it('spends nothing: resolving is a read, and there is no user to accept for', async () => {
    await render()
    expect(acceptInvitation).not.toHaveBeenCalled()
  })

  it('is told an unknown link does not work, and nothing is attempted', async () => {
    resolveInvitation.mockResolvedValue({ kind: 'unknown' })
    expect((await render()).blocked).toBe('errors.inviteUnknown')
    expect(acceptInvitation).not.toHaveBeenCalled()
  })
})

describe('a signed-in visitor holding the invited address', () => {
  beforeEach(() => {
    getSession.mockResolvedValue(SESSION)
    acceptInvitation.mockResolvedValue({ outcome: 'accepted', role: 'admin' })
  })

  it('accepts as the SESSION user, and lands on the dashboard', async () => {
    await expect(render('tok')).rejects.toThrow('NEXT_REDIRECT:/')
    expect(acceptInvitation).toHaveBeenCalledWith('tok', 'u1')
  })

  it('compares the address case-insensitively', async () => {
    getSession.mockResolvedValue({ ...SESSION, email: 'Tom@StudioWit.BE' })
    await expect(render()).rejects.toThrow('NEXT_REDIRECT:/')
    expect(acceptInvitation).toHaveBeenCalled()
  })

  it('carries the passkey-offer marker through to the dashboard', async () => {
    // `auth-flow.tsx` appends it to `continueHref` on a non-passkey sign-in; the shell reads
    // it on arrival. Dropping it here would silently end the offer for every invitee.
    await expect(render('tok', { welcome: 'passkey' })).rejects.toThrow(
      'NEXT_REDIRECT:/?welcome=passkey',
    )
  })

  it.each([
    ['already_accepted', 'notice', 'errors.inviteAccepted'],
    ['expired', 'blocked', 'errors.inviteExpired'],
    ['wrong_user', 'blocked', 'errors.inviteWrongAccount'],
    ['unknown', 'blocked', 'errors.inviteUnknown'],
    ['forbidden', 'blocked', 'errors.inviteUnknown'],
  ] as const)('renders %s as %s', async (outcome, prop, copyKey) => {
    acceptInvitation.mockResolvedValue({ outcome })
    const props = await render()
    expect(props[prop]).toBe(copyKey)
    expect(redirect).not.toHaveBeenCalled()
  })
})

describe('a signed-in visitor holding a DIFFERENT address', () => {
  it('is told so, and the invitation is not even attempted', async () => {
    getSession.mockResolvedValue({ ...SESSION, email: 'someone.else@elsewhere.be' })

    const props = await render()

    expect(props.blocked).toBe('errors.inviteWrongAccount')
    expect(acceptInvitation).not.toHaveBeenCalled()
  })
})

describe('the other resolved shapes', () => {
  it('sends an already-used link to the dashboard when signed in, the sign-in when not', async () => {
    resolveInvitation.mockResolvedValue({ kind: 'accepted' })

    expect((await render()).notice).toBe('errors.inviteAccepted')

    getSession.mockResolvedValue(SESSION)
    await expect(render()).rejects.toThrow('NEXT_REDIRECT:/')
  })

  it('an expired link ends the flow, signed in or not', async () => {
    resolveInvitation.mockResolvedValue({ kind: 'expired', inviter: 'Ilse' })
    getSession.mockResolvedValue(SESSION)

    expect((await render()).blocked).toBe('errors.inviteExpired')
    expect(acceptInvitation).not.toHaveBeenCalled()
  })

  it('a wedding invitation is never accepted from here, signed in or not', async () => {
    // The couple portal is not open, and accepting would write a wedding_members row for a
    // surface that cannot serve it. The invitation stays valid for when it is.
    resolveInvitation.mockResolvedValue({ kind: 'wedding', inviter: 'Ilse', org: 'Studio Wit' })
    getSession.mockResolvedValue(SESSION)

    expect((await render()).blocked).toBe('errors.inviteCouple')
    expect(acceptInvitation).not.toHaveBeenCalled()
  })
})
