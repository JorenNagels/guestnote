import { describe, expect, it } from 'vitest'
import { type AuthConfig, createAuth } from './index.ts'

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
const BASE: AuthConfig = {
  db: {},
  schema: {},
  secret: 'test-secret-that-is-long-enough-to-be-plausible',
  baseURL: 'http://app.guestnote.localhost:3000',
  rpID: 'app.guestnote.localhost',
  rpName: 'Guestnote',
  newId: () => '00000000-0000-7000-8000-000000000000',
  sendCode: async () => {},
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
