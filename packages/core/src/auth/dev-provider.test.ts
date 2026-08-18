import { beforeEach, expect, test } from 'vitest'
import { __resetDevProvider, createDevProvider } from './dev-provider.ts'
import { AUTH_POLICY } from './policy.ts'

/**
 * These cover the branches the interface renders differently, not the provider's
 * arithmetic. Each one maps to a numbered state in the surface brief, because a state
 * that no test can reach is a state nobody will notice breaking.
 */

beforeEach(__resetDevProvider)

/** Reads the code out of the console line, which is the only channel the dev provider has. */
async function codeFor(p: ReturnType<typeof createDevProvider>, email: string) {
  const lines: string[] = []
  const original = console.info
  console.info = (m: string) => void lines.push(m)
  try {
    await p.requestEmailCode({ email })
  } finally {
    console.info = original
  }
  const match = lines.join('').match(/code for .*: (\d+)/)
  if (!match?.[1]) throw new Error('dev provider printed no code')
  return match[1]
}

test('state 10: an unknown address is indistinguishable from a known one', async () => {
  const p = createDevProvider()
  const known = await p.requestEmailCode({ email: 'ilse@studiowit.be' })
  const unknown = await p.requestEmailCode({ email: 'nobody@example.com' })
  expect(unknown).toEqual(known)
})

test('a correct code verifies once, and only once', async () => {
  const p = createDevProvider()
  const code = await codeFor(p, 'ilse@studiowit.be')

  const first = await p.verifyEmailCode({ email: 'ilse@studiowit.be', code })
  expect(first.ok).toBe(true)

  // state 13: replaying it is expired, not wrong. The two get different copy.
  const replay = await p.verifyEmailCode({ email: 'ilse@studiowit.be', code })
  expect(replay).toEqual({ ok: false, failure: 'code_expired' })
})

test('the address is normalised, so case and whitespace do not strand anyone', async () => {
  const p = createDevProvider()
  const code = await codeFor(p, 'Ilse@StudioWit.be')
  const out = await p.verifyEmailCode({ email: '  ilse@studiowit.be ', code })
  expect(out.ok).toBe(true)
})

test('a pasted "194 720" verifies: separators are stripped, not rejected', async () => {
  const p = createDevProvider()
  const code = await codeFor(p, 'ilse@studiowit.be')
  const spaced = `${code.slice(0, 3)} ${code.slice(3)}`
  expect((await p.verifyEmailCode({ email: 'ilse@studiowit.be', code: spaced })).ok).toBe(true)
})

test('state 11 then 12: attempts count down, then the code dies', async () => {
  const p = createDevProvider()
  const code = await codeFor(p, 'ilse@studiowit.be')
  const wrong = code === '000000' ? '111111' : '000000'

  for (let left = AUTH_POLICY.maxCodeAttempts - 1; left > 0; left--) {
    expect(await p.verifyEmailCode({ email: 'ilse@studiowit.be', code: wrong })).toEqual({
      ok: false,
      failure: 'code_wrong',
      attemptsLeft: left,
    })
  }
  expect(await p.verifyEmailCode({ email: 'ilse@studiowit.be', code: wrong })).toEqual({
    ok: false,
    failure: 'code_spent',
  })
  // And the correct code is gone with it -- otherwise "this code no longer works" lies.
  expect(await p.verifyEmailCode({ email: 'ilse@studiowit.be', code })).toEqual({
    ok: false,
    failure: 'code_expired',
  })
})

test('state 13: a code past its TTL is expired', async () => {
  let clock = 1_000_000
  const p = createDevProvider(() => clock)
  const code = await codeFor(p, 'ilse@studiowit.be')
  clock += (AUTH_POLICY.codeTtlSeconds + 1) * 1000
  expect(await p.verifyEmailCode({ email: 'ilse@studiowit.be', code })).toEqual({
    ok: false,
    failure: 'code_expired',
  })
})

test('state 14: the window closes after the configured number of requests', async () => {
  const p = createDevProvider()
  for (let i = 0; i < AUTH_POLICY.maxRequestsPerEmailPerHour; i++) {
    expect((await p.requestEmailCode({ email: 'ilse@studiowit.be' })).ok).toBe(true)
  }
  expect(await p.requestEmailCode({ email: 'ilse@studiowit.be' })).toEqual({
    ok: false,
    failure: 'rate_limited',
  })
})

test('state 24: three different bad tokens produce one indistinguishable answer', async () => {
  const p = createDevProvider()
  const guessed = await p.resolveInvitation('definitely-not-a-token')
  const truncated = await p.resolveInvitation('staf')
  const purged = await p.resolveInvitation('')
  expect(guessed).toEqual({ kind: 'unknown' })
  expect(truncated).toEqual(guessed)
  expect(purged).toEqual(guessed)
})

test('state 23: a wedding-shaped invitation resolves, so it can be refused honestly', async () => {
  const p = createDevProvider()
  expect(await p.resolveInvitation('wedding')).toMatchObject({ kind: 'wedding' })
})
