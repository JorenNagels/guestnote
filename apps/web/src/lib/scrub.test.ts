import { describe, expect, it } from 'vitest'
import { REDACTED, scrub, scrubEvent } from './scrub.ts'

/**
 * The scrubber, which is the one file here where being wrong sends a credential to a third
 * party.
 *
 * `.test.ts` and not `.tsx`: it touches no DOM, and it runs on both sides of the wire.
 *
 * The assertions are deliberately about *real* payload shapes -- a Better Auth OTP body, a
 * WebAuthn attestation, a Sentry request object -- rather than `{ foo: 'bar' }`. A key list
 * is only correct relative to the field names that actually occur, and the way this file
 * fails in future is that somebody adds a credential under a name nobody thought of. Naming
 * the real shapes is what makes that visible in a diff.
 */
describe('scrub', () => {
  it('redacts a live sign-in code, which is the worst thing here', () => {
    // Five-minute window into an account. `verifications.value` stores these hashed, but the
    // plaintext exists in memory on the request that verifies one.
    const event = { body: { email: 'ilse@studiowit.be', otp: '194720', code: '194720' } }
    const out = scrub(event)
    expect(out.body.otp).toBe(REDACTED)
    expect(out.body.code).toBe(REDACTED)
    expect(out.body.email).toBe(REDACTED)
  })

  it('redacts a WebAuthn ceremony transcript but keeps the credential id', () => {
    // The credential id is the entire point of reporting a passkey failure -- it is a public
    // identifier, useless without the private key, and the only thing that makes one report
    // distinguishable from another. If a future key-list edit starts redacting it, this
    // fails, which is exactly what KEEP_KEYS exists for.
    const out = scrub({
      credentialId: 'Y3JlZGVudGlhbC1pZA',
      challenge: 'Y2hhbGxlbmdl',
      response: {
        clientDataJSON: 'e30',
        attestationObject: 'o2M',
        authenticatorData: 'YXV0aA',
        signature: 'c2ln',
        userHandle: 'dXNlcg',
      },
    })

    expect(out.credentialId).toBe('Y3JlZGVudGlhbC1pZA')
    expect(out.challenge).toBe(REDACTED)
    expect(out.response.clientDataJSON).toBe(REDACTED)
    expect(out.response.attestationObject).toBe(REDACTED)
    expect(out.response.authenticatorData).toBe(REDACTED)
    expect(out.response.signature).toBe(REDACTED)
    expect(out.response.userHandle).toBe(REDACTED)
  })

  it('redacts the whole Cookie header, not the session cookie by name', () => {
    // `__Host-guestnote.session_token` is bearer-equivalent. Redacting the header rather than
    // parsing it is what makes a cookie added later safe by default.
    const out = scrub({
      request: { headers: { cookie: '__Host-guestnote.session_token=abc; NEXT_LOCALE=nl' } },
    })
    expect(out.request.headers.cookie).toBe(REDACTED)
  })

  it('keeps the codes that are not credentials', () => {
    // `statusCode` and `errorCode` contain the substring `code` and are the opposite of
    // sensitive. Without KEEP_KEYS every HTTP status in every report would read [redacted].
    const out = scrub({ statusCode: 500, errorCode: 'CHALLENGE_NOT_FOUND' })
    expect(out.statusCode).toBe(500)
    expect(out.errorCode).toBe('CHALLENGE_NOT_FOUND')
  })

  it('matches on substrings, so a name variant needs no second entry', () => {
    const out = scrub({ client_data_json: 'x', accessToken: 'y', USER_EMAIL: 'z' })
    expect(Object.values(out)).toEqual([REDACTED, REDACTED, REDACTED])
  })

  it('redacts through arrays and preserves their shape', () => {
    const out = scrub({ items: [{ otp: '1' }, { credentialId: 'keep' }] })
    expect(out.items[0]?.otp).toBe(REDACTED)
    expect(out.items[1]?.credentialId).toBe('keep')
    expect(out.items).toHaveLength(2)
  })

  it('survives a cycle instead of overflowing the stack', () => {
    // A Sentry event can carry a request whose socket points back at itself. A stack
    // overflow inside the reporter would take out the request it was reporting on -- the
    // failure where observability makes an outage worse rather than explaining it.
    const cyclic: Record<string, unknown> = { name: 'req' }
    cyclic.self = cyclic
    expect(() => scrub(cyclic)).not.toThrow()
    expect(scrub(cyclic).self).toBe(REDACTED)
  })

  it('caps depth rather than walking an unbounded object', () => {
    // The `not.toThrow()` half is all this asserted until 2026-09-01, and it proved only
    // that `scrub` terminates on a 20-deep object -- true at any finite cap and true with no
    // cap at all at that depth. `mutation-tester` confirmed `depth > 12` could be raised to
    // `depth > 1200` with the suite green.
    //
    // A value check will not work here: `otp` is in `REDACT_KEY_PARTS`, so `'bottom'` is
    // redacted by key at any depth and passes under both caps. The boundary has to be
    // walked structurally.
    let deep: Record<string, unknown> = { otp: 'bottom' }
    for (let i = 0; i < 20; i++) deep = { nested: deep }
    expect(() => scrub(deep)).not.toThrow()

    // Level 0 is the top object and a value at nesting level d is scrubbed with `depth = d`,
    // so level 13 is the first redacted one. Indexing to exactly that also kills
    // `depth > 12` becoming `depth >= 12`, which a looser walk would miss.
    let walked = scrub(deep) as Record<string, unknown>
    for (let i = 0; i < 11; i++) walked = walked.nested as Record<string, unknown>
    expect(walked.nested).not.toBe(REDACTED)
    expect((walked.nested as Record<string, unknown>).nested).toBe(REDACTED)
  })

  it('leaves primitives and null alone', () => {
    expect(scrub('plain')).toBe('plain')
    expect(scrub(42)).toBe(42)
    expect(scrub(null)).toBe(null)
    expect(scrub(undefined)).toBe(undefined)
  })
})

describe('scrubEvent', () => {
  it('drops the query string entirely and truncates the url', () => {
    // An invitation token lives in a path segment today, but a token in a URL is the classic
    // way credentials reach somebody else's dashboard. Dropping the whole string costs
    // nothing this app currently reads -- `?reason=session-expired` is the only query.
    const out = scrubEvent({
      request: {
        url: 'https://app.guestnote.be/login?reason=session-expired&token=secret',
        query_string: 'reason=session-expired&token=secret',
      },
    } as Record<string, unknown>)

    const request = out.request as { url: string; query_string: string }
    expect(request.url).toBe('https://app.guestnote.be/login')
    expect(request.query_string).toBe(REDACTED)
  })

  it('still scrubs keys when there is no request object at all', () => {
    const out = scrubEvent({ extra: { otp: '194720' } } as Record<string, unknown>)
    expect((out.extra as { otp: string }).otp).toBe(REDACTED)
  })

  it('leaves a url with no query string unchanged', () => {
    const out = scrubEvent({
      request: { url: 'https://app.guestnote.be/login' },
    } as Record<string, unknown>)
    expect((out.request as { url: string }).url).toBe('https://app.guestnote.be/login')
  })
})
