import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The Server Functions the sign-in surface calls.
 *
 * ## What is mocked, and why only this much
 *
 * `getAuth()`, `next/headers` and `lib/app-url.ts` are replaced; nothing else is. The seam
 * is mocked because these tests are about what the ACTION does with an answer -- validate
 * before asking, pass a failure through unchanged, thread the request headers -- and not
 * about Better Auth. That separation is the seam's whole purpose
 * (`packages/core/src/auth/index.ts`), so honouring it here is consistent rather than lazy:
 * a test that stood up Better Auth to check an email regex would fail for reasons that have
 * nothing to do with the regex.
 *
 * The real `lib/auth.ts` also reaches for a database and a secret at call time, so mocking
 * it is what keeps this in the `unit` project rather than dragging it into `db`.
 */
const requestEmailCode = vi.fn()
const verifyEmailCode = vi.fn()
const startGoogleSignInSeam = vi.fn()
const createPasskeyRequest = vi.fn()
const verifyPasskeyAssertion = vi.fn()
const cookieStore = { set: vi.fn() }
const reportSilentFailure = vi.fn()
const requestHeaders = new Headers({ 'user-agent': 'test-agent' })

vi.mock('../../lib/auth.ts', () => ({
  getAuth: () => ({
    requestEmailCode,
    verifyEmailCode,
    startGoogleSignIn: startGoogleSignInSeam,
    createPasskeyRequest,
    verifyPasskeyAssertion,
  }),
}))

vi.mock('next/headers', () => ({
  cookies: async () => cookieStore,
  headers: async () => requestHeaders,
}))

vi.mock('../../lib/app-url.ts', () => ({
  appHomeUrl: () => 'http://app.guestnote.localhost:3000/',
  appLoginUrl: () => 'http://app.guestnote.localhost:3000/login',
  appSignupUrl: () => 'http://app.guestnote.localhost:3000/signup',
}))

vi.mock('../../lib/observability.ts', () => ({
  reportSilentFailure: (...a: unknown[]) => reportSilentFailure(...a),
}))

const {
  beginPasskeySignIn,
  finishPasskeySignIn,
  reportCeremonyFailure,
  requestCode,
  setLocale,
  startGoogleSignIn,
  submitCode,
} = await import('./actions.ts')

const ASSERTION = {
  id: 'credential-id',
  rawId: 'Y3JlZGVudGlhbC1pZA',
  type: 'public-key' as const,
  clientExtensionResults: {},
  response: { clientDataJSON: 'e30', authenticatorData: 'YXV0aA', signature: 'c2ln' },
}

beforeEach(() => {
  vi.clearAllMocks()
  requestEmailCode.mockResolvedValue({ ok: true, value: {} })
  verifyEmailCode.mockResolvedValue({ ok: true, value: { userId: 'u1', needsName: false } })
  startGoogleSignInSeam.mockResolvedValue({
    ok: true,
    value: { url: 'https://accounts.google.com/o/oauth2/v2/auth?client_id=x' },
  })
  createPasskeyRequest.mockResolvedValue({ ok: true, value: { challenge: 'Y2hhbGxlbmdl' } })
  verifyPasskeyAssertion.mockResolvedValue({ ok: true, value: null })
})

describe('requestCode', () => {
  it('sends for a plain address', async () => {
    await expect(requestCode('ilse@studiowit.be')).resolves.toEqual({ ok: true })
    expect(requestEmailCode).toHaveBeenCalledWith({ email: 'ilse@studiowit.be' })
  })

  it('trims surrounding whitespace before asking', async () => {
    // The autofill-and-paste case. A trailing space is not a different address, and
    // sending it through would make the code arrive at an address the next screen cannot
    // match.
    await requestCode('  ilse@studiowit.be\n')
    expect(requestEmailCode).toHaveBeenCalledWith({ email: 'ilse@studiowit.be' })
  })

  it.each([
    ['a plus tag', 'ilse+weddings@studiowit.be'],
    ['an apostrophe', "d'hondt@studiowit.be"],
    ['a long new TLD', 'ilse@studio.photography'],
    ['a subdomain', 'ilse@mail.studiowit.be'],
    ['a single-letter local part', 'i@studiowit.be'],
  ])('accepts %s, because the real validity test is whether mail arrives', async (_n, address) => {
    await expect(requestCode(address)).resolves.toEqual({ ok: true })
    expect(requestEmailCode).toHaveBeenCalledOnce()
  })

  it.each([
    ['no at sign', 'ilse.studiowit.be'],
    ['no dot in the domain', 'ilse@studiowit'],
    ['nothing before the at', '@studiowit.be'],
    ['nothing after the at', 'ilse@'],
    ['two at signs', 'ilse@@studiowit.be'],
    ['an inner space', 'ilse @studiowit.be'],
    ['empty', ''],
    ['whitespace only', '   '],
  ])('refuses %s', async (_n, address) => {
    await expect(requestCode(address)).resolves.toEqual({ ok: false, failure: 'unavailable' })
  })

  it('does NOT reach the seam for a malformed address', async () => {
    // The point of validating here at all. An obvious slip must not consume the address's
    // hourly rate-limit budget, and must not cost a provider round trip.
    await requestCode('not-an-address')
    expect(requestEmailCode).not.toHaveBeenCalled()
  })

  it('passes a seam failure through unchanged', async () => {
    requestEmailCode.mockResolvedValue({ ok: false, failure: 'rate_limited' })
    await expect(requestCode('ilse@studiowit.be')).resolves.toEqual({
      ok: false,
      failure: 'rate_limited',
    })
  })

  it.each(['rate_limited', 'delivery_failed', 'unavailable'] as const)(
    'renders %s as itself rather than collapsing it',
    async (failure) => {
      requestEmailCode.mockResolvedValue({ ok: false, failure })
      await expect(requestCode('ilse@studiowit.be')).resolves.toEqual({ ok: false, failure })
    },
  )

  it('returns nothing beyond `ok` on success -- the enumeration guarantee', () => {
    // The seam promises an unknown address is indistinguishable from a known one. This
    // action keeps that promise by NOT enriching the result, so the assertion is on the
    // exact key set: any future field here is a channel that leaks account existence.
    return requestCode('ilse@studiowit.be').then((result) => {
      expect(Object.keys(result)).toEqual(['ok'])
    })
  })

  it('discards a resendAfterSeconds the seam offers, rather than forwarding it', async () => {
    requestEmailCode.mockResolvedValue({
      ok: true,
      value: { resendAfterSeconds: 30, expiresInSeconds: 300 },
    })
    await expect(requestCode('ilse@studiowit.be')).resolves.toEqual({ ok: true })
  })
})

describe('submitCode', () => {
  it('verifies a code and reports success', async () => {
    await expect(submitCode('ilse@studiowit.be', '194720')).resolves.toEqual({ ok: true })
  })

  it('threads the request headers through to the seam', async () => {
    // Load-bearing: the session cookie is set on THIS action's response by the
    // `nextCookies()` plugin. Without the headers the sign-in succeeds and the browser is
    // handed nothing, which looks exactly like the flow working and the session evaporating
    // on the next navigation.
    await submitCode('ilse@studiowit.be', '194720')
    expect(verifyEmailCode).toHaveBeenCalledWith({
      email: 'ilse@studiowit.be',
      code: '194720',
      headers: requestHeaders,
    })
  })

  it('trims the address but NOT the code', async () => {
    // The address is typed on the previous rung and may carry autofill whitespace. The code
    // is passed through verbatim: trimming it here would hide a paste that brought padding
    // the provider should decide about.
    await submitCode('  ilse@studiowit.be ', ' 194720 ')
    expect(verifyEmailCode).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'ilse@studiowit.be', code: ' 194720 ' }),
    )
  })

  it('carries attemptsLeft when the seam supplies it', async () => {
    verifyEmailCode.mockResolvedValue({ ok: false, failure: 'code_wrong', attemptsLeft: 2 })
    await expect(submitCode('ilse@studiowit.be', '000000')).resolves.toEqual({
      ok: false,
      failure: 'code_wrong',
      attemptsLeft: 2,
    })
  })

  it('omits attemptsLeft entirely when there is none, rather than sending undefined', async () => {
    // `exactOptionalPropertyTypes` is on, and the client distinguishes the two: an absent
    // attemptsLeft picks the generic message, while `attemptsLeft: 1` picks the singular
    // one. A present-but-undefined key would make that branch read the wrong way round.
    verifyEmailCode.mockResolvedValue({ ok: false, failure: 'code_expired' })
    const result = await submitCode('ilse@studiowit.be', '000000')
    expect(result).toEqual({ ok: false, failure: 'code_expired' })
    expect(Object.hasOwn(result, 'attemptsLeft')).toBe(false)
  })

  it('preserves attemptsLeft of 0, which is falsy but meaningful', async () => {
    // The last wrong attempt. A truthiness check instead of `=== undefined` would drop it
    // and show the generic message on the one attempt where the count matters most.
    verifyEmailCode.mockResolvedValue({ ok: false, failure: 'code_wrong', attemptsLeft: 0 })
    await expect(submitCode('ilse@studiowit.be', '000000')).resolves.toEqual({
      ok: false,
      failure: 'code_wrong',
      attemptsLeft: 0,
    })
  })

  it.each(['code_wrong', 'code_spent', 'code_expired', 'rate_limited'] as const)(
    'passes %s through',
    async (failure) => {
      verifyEmailCode.mockResolvedValue({ ok: false, failure })
      await expect(submitCode('ilse@studiowit.be', '000000')).resolves.toEqual({
        ok: false,
        failure,
      })
    },
  )

  it('does not validate the code shape itself', async () => {
    // Deliberate: the code's validity is the provider's to judge, and a local length check
    // would be a second place to be wrong about `codeLength`.
    await submitCode('ilse@studiowit.be', '')
    expect(verifyEmailCode).toHaveBeenCalledOnce()
  })
})

describe('startGoogleSignIn', () => {
  it('returns the redirect url the seam minted', async () => {
    await expect(startGoogleSignIn()).resolves.toEqual({
      ok: true,
      url: 'https://accounts.google.com/o/oauth2/v2/auth?client_id=x',
    })
  })

  it('asks the seam for absolute success and error callbacks, and threads the request headers', async () => {
    // Both URLs must be absolute -- Better Auth redirects the browser to them from its own
    // callback route, and a bare path would resolve against accounts.google.com. `errorURL`
    // is what stops a cancelled Google sign-in landing on Better Auth's raw error page. The
    // headers matter for the same reason they do on `submitCode`: the callback sets the
    // session cookie against this request.
    await startGoogleSignIn()
    expect(startGoogleSignInSeam).toHaveBeenCalledWith({
      callbackURL: 'http://app.guestnote.localhost:3000/',
      errorURL: 'http://app.guestnote.localhost:3000/login',
      headers: requestHeaders,
    })
  })

  it('brings sign-up back to sign-up, on success and on a cancel', async () => {
    await startGoogleSignIn('signup')
    expect(startGoogleSignInSeam).toHaveBeenCalledWith({
      callbackURL: 'http://app.guestnote.localhost:3000/signup',
      errorURL: 'http://app.guestnote.localhost:3000/signup',
      headers: requestHeaders,
    })
  })

  it('treats any other return value as the dashboard, so the client cannot name a URL', async () => {
    // The wire value is a string whatever the type says; a Server Function is callable by
    // anything that can POST.
    await startGoogleSignIn('https://evil.example/' as 'signup')
    expect(startGoogleSignInSeam).toHaveBeenCalledWith(
      expect.objectContaining({ callbackURL: 'http://app.guestnote.localhost:3000/' }),
    )
  })

  it('collapses a seam failure to a bare { ok: false }, carrying no reason', async () => {
    // Every way this fails renders identically on the surface -- as nothing. The action
    // drops the seam's `failure` so a client cannot accidentally render it, the same
    // posture the passkey actions take.
    startGoogleSignInSeam.mockResolvedValue({ ok: false, failure: 'unavailable' })
    const result = await startGoogleSignIn()
    expect(result).toEqual({ ok: false })
    expect(Object.hasOwn(result, 'failure')).toBe(false)
  })
})

describe('setLocale', () => {
  it.each(['nl', 'en', 'fr'] as const)('writes %s', async (locale) => {
    await setLocale(locale)
    expect(cookieStore.set).toHaveBeenCalledWith('NEXT_LOCALE', locale, expect.anything())
  })

  it.each(['de', 'EN', '', 'nl-BE', '../etc/passwd'])(
    'ignores %s rather than writing it',
    async (value) => {
      await setLocale(value as 'nl')
      expect(cookieStore.set).not.toHaveBeenCalled()
    },
  )

  it('writes a cookie the client can read, for a year, on every path', async () => {
    await setLocale('fr')
    expect(cookieStore.set).toHaveBeenCalledWith('NEXT_LOCALE', 'fr', {
      path: '/',
      sameSite: 'lax',
      // Not httpOnly on purpose: next-intl's convention is a cookie both sides read, and
      // it carries a language preference rather than anything authenticating.
      httpOnly: false,
      maxAge: 60 * 60 * 24 * 365,
    })
  })

  it('is not marked secure, so it survives http on app.localhost', async () => {
    await setLocale('nl')
    const [, , options] = cookieStore.set.mock.calls[0] as [string, string, Record<string, unknown>]
    expect(options).not.toHaveProperty('secure', true)
  })
})

describe('beginPasskeySignIn', () => {
  it('asks for a challenge and hands back the options', async () => {
    await expect(beginPasskeySignIn()).resolves.toEqual({
      ok: true,
      options: { challenge: 'Y2hhbGxlbmdl' },
    })
  })

  it('threads the request headers, which is what the challenge cookie rides on', async () => {
    await beginPasskeySignIn()
    expect(createPasskeyRequest).toHaveBeenCalledWith({ headers: requestHeaders })
  })

  it('names no account, because it runs for anyone who can reach the login page', async () => {
    // The guard on an unauthenticated Server Function is having nothing to probe with. If
    // an email or a user id ever appears in this call, the enumeration oracle is back.
    await beginPasskeySignIn()
    const [args] = createPasskeyRequest.mock.calls[0] as [Record<string, unknown>]
    expect(Object.keys(args)).toEqual(['headers'])
  })

  it('drops the reason on failure -- there is no branch a visitor could act on', async () => {
    createPasskeyRequest.mockResolvedValue({ ok: false, failure: 'unavailable' })
    await expect(beginPasskeySignIn()).resolves.toEqual({ ok: false })
  })
})

describe('finishPasskeySignIn', () => {
  it('reports success with nothing else -- the seam sets the session cookie', async () => {
    await expect(finishPasskeySignIn(ASSERTION)).resolves.toEqual({ ok: true })
    expect(verifyPasskeyAssertion).toHaveBeenCalledWith({
      assertion: ASSERTION,
      headers: requestHeaders,
    })
  })

  it('says gone for an unknown credential, and only for that', async () => {
    verifyPasskeyAssertion.mockResolvedValue({ ok: false, failure: 'passkey_unknown' })
    await expect(finishPasskeySignIn(ASSERTION)).resolves.toEqual({ ok: false, gone: true })
  })

  it.each(['unavailable', 'rate_limited', 'code_wrong'] as const)(
    'collapses %s to gone: false, so the dangerous distinctions cannot be rendered',
    async (failure) => {
      // A counter regression -- a possible cloned authenticator -- arrives as one of these.
      // It must be indistinguishable from a dismissed sheet on the client side.
      verifyPasskeyAssertion.mockResolvedValue({ ok: false, failure })
      await expect(finishPasskeySignIn(ASSERTION)).resolves.toEqual({ ok: false, gone: false })
    },
  )

  it('takes no user id, so no caller can bind a session to another account', async () => {
    await finishPasskeySignIn(ASSERTION)
    const [args] = verifyPasskeyAssertion.mock.calls[0] as [Record<string, unknown>]
    expect(Object.keys(args).sort()).toEqual(['assertion', 'headers'])
  })
})

/**
 * `reportCeremonyFailure`'s three clamps, none of which had an assertion until 2026-09-01.
 * `mutation-tester` confirmed all three could be deleted with the suite green -- on the one
 * unauthenticated Server Function that takes attacker-controlled strings and writes them to
 * a log.
 *
 * The context field is read out of the call rather than matched loosely, because the length
 * clamp and the control-character sweep are two separate mutations and a
 * `not.toContain('\n')` check would kill only one of them.
 */
describe('reportCeremonyFailure', () => {
  const contextOf = () => reportSilentFailure.mock.calls[0]?.[1] as Record<string, unknown>

  it('strips everything outside the WebAuthn name vocabulary', async () => {
    // The forged-log-line case the source comment names: a crafted `name` must not be able
    // to introduce a newline and a fake second entry.
    await reportCeremonyFailure('signin', 'NotAllowed\nERROR fake=1', 'x')

    expect(contextOf().errorName).toBe('NotAllowedERRORfake')
  })

  it('falls back to Unnamed when nothing survives the strip', async () => {
    // A separate mutation from the regex: `|| 'Unnamed'` can be deleted on its own, and an
    // empty `errorName` is a log line that says a failure happened and refuses to say which.
    await reportCeremonyFailure('signin', '123456', 'x')

    expect(contextOf().errorName).toBe('Unnamed')
  })

  it('truncates the name, which is not the same clamp as the message', async () => {
    await reportCeremonyFailure('signin', 'A'.repeat(80), 'x')

    expect(contextOf().errorName).toBe('A'.repeat(48))
  })

  it('replaces control characters in the message and truncates it', async () => {
    await reportCeremonyFailure('enroll', 'NotAllowedError', `a\nb\r\n${'x'.repeat(500)}`)

    expect(contextOf().detail).toBe(`a b  ${'x'.repeat(500)}`.slice(0, 200))
  })

  it('names the ceremony, so an enrollment fault cannot file itself under sign-in', async () => {
    await reportCeremonyFailure('enroll', 'NotSupportedError', 'no resident key')

    expect(reportSilentFailure).toHaveBeenCalledWith(
      'passkey enroll ceremony failed in the browser',
      expect.objectContaining({ ceremony: 'enroll' }),
    )
  })

  it('stops sending to the vendor sink once the process budget is spent', async () => {
    // Unauthenticated and unmetered: the Sentry free tier is 5,000 events a month, metered
    // per event rather than per issue, so an unbounded loop here disables the observability
    // this whole series exists to add. See the constant's note for why the cap is 50.
    //
    // Re-imported into a fresh module registry, because the counter is module state and the
    // tests above have already spent some of it. Asserting a delta instead would pass with
    // the cap deleted, since the delta would simply be the loop length.
    vi.resetModules()
    reportSilentFailure.mockClear()
    const fresh = await import('./actions.ts')

    for (let i = 0; i < 60; i++) await fresh.reportCeremonyFailure('signin', 'NotAllowedError', 'x')

    expect(reportSilentFailure).toHaveBeenCalledTimes(50)
  })

  /**
   * The runtime `stage` re-check is NOT verified here, and this note is the honest version
   * of that rather than a test that pretends.
   *
   * Calling it from a test is calling it through TypeScript, which is the one caller that
   * cannot violate a two-value union. The only thing that can is a hand-rolled POST to the
   * Server Function endpoint, and there is no browser E2E layer yet -- the same gap
   * `CLAUDE.md` and both passkey specs name. `mutation-tester` confirmed on 2026-09-01 that
   * deleting the check leaves this suite green, and it will keep doing so until Playwright
   * exists. Recorded beside the assertions that cannot discriminate it, per the repo's rule.
   */
})
