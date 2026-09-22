import { describe, expect, it, vi } from 'vitest'
import { createAuth, hashInviteToken, type InvitationStore, type SeamConfig } from './index.ts'

/**
 * `googleAvailable()` is the whole of the "safe by omission" contract for social sign-in:
 * the login page renders the "Continue with Google" button only when this returns true, so
 * an environment that never configured the Google client must get `false` here and no
 * button -- not a button that fails an OAuth handshake on click.
 *
 * `lib/auth.ts` is what enforces that upstream (it only passes `config.google` when BOTH
 * `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set); this file pins the seam end of
 * it. The `db` / `schema` stubs are enough because `betterAuth()` does not touch the
 * database at construction time -- the Drizzle adapter is lazy.
 */
const NO_STORE: InvitationStore = {
  resolve: async () => null,
  accept: async () => ({ outcome: 'unknown' }),
}

const BASE: SeamConfig = {
  db: {},
  schema: {},
  secret: 'test-secret-that-is-long-enough-to-be-plausible',
  baseURL: 'http://app.guestnote.localhost:3000',
  rpID: 'app.guestnote.localhost',
  rpName: 'Guestnote',
  newId: () => '00000000-0000-7000-8000-000000000000',
  sendCode: async () => {},
  invitations: NO_STORE,
}

describe('googleAvailable', () => {
  it('is false when no Google client was configured', () => {
    expect(createAuth(BASE).googleAvailable()).toBe(false)
  })

  it('is true only once both halves of the Google client are supplied', () => {
    const auth = createAuth({ ...BASE, google: { clientId: 'id', clientSecret: 'secret' } })
    expect(auth.googleAvailable()).toBe(true)
  })
})

/**
 * The invitation half of the seam, end to end through `createAuth`: what reaches the store
 * and what comes back. The mapping cases live in `invitations.test.ts`; these pin that
 * `createAuth` actually routes through the store and hashes on the way.
 */
describe('invitations through the seam', () => {
  it('asks the store for the HASH of the token, never the token itself', async () => {
    const resolve = vi.fn(async () => null)
    const auth = createAuth({ ...BASE, invitations: { ...NO_STORE, resolve } })

    await auth.resolveInvitation('tok-123')

    expect(resolve).toHaveBeenCalledWith(hashInviteToken('tok-123'))
    expect(resolve).not.toHaveBeenCalledWith('tok-123')
  })

  it('no longer knows the old fixture tokens: `staff` is just an unknown guess', async () => {
    // The fixture map answered to `staff`, `wedding`, `expired` and `accepted` until
    // migration 0007. Left in, a guessable token would render a real invitation screen.
    const auth = createAuth(BASE)
    for (const guess of ['staff', 'wedding', 'expired', 'accepted']) {
      expect(await auth.resolveInvitation(guess)).toEqual({ kind: 'unknown' })
    }
  })

  it('hands the store the hash and the signed-in user id on accept', async () => {
    const accept = vi.fn(async () => ({ outcome: 'accepted' as const, role: 'admin' }))
    const auth = createAuth({ ...BASE, invitations: { ...NO_STORE, accept } })

    expect(await auth.acceptInvitation('tok-123', 'user-1')).toEqual({
      outcome: 'accepted',
      role: 'admin',
    })
    expect(accept).toHaveBeenCalledWith(hashInviteToken('tok-123'), 'user-1')
  })
})
