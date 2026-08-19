import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The three Server Functions the sign-in surface calls.
 *
 * ## What is mocked, and why only this much
 *
 * `getAuth()` and `next/headers` are replaced; nothing else is. The seam is mocked because
 * these tests are about what the ACTION does with an answer -- validate before asking,
 * pass a failure through unchanged, thread the request headers -- and not about Better
 * Auth. That separation is the seam's whole purpose (`packages/core/src/auth/index.ts`),
 * so honouring it here is consistent rather than lazy: a test that stood up Better Auth to
 * check an email regex would fail for reasons that have nothing to do with the regex.
 *
 * The real `lib/auth.ts` also reaches for a database and a secret at call time, so mocking
 * it is what keeps this in the `unit` project rather than dragging it into `db`.
 */
const requestEmailCode = vi.fn()
const verifyEmailCode = vi.fn()
const cookieStore = { set: vi.fn() }
const requestHeaders = new Headers({ 'user-agent': 'test-agent' })

vi.mock('../../lib/auth.ts', () => ({
  getAuth: () => ({ requestEmailCode, verifyEmailCode }),
}))

vi.mock('next/headers', () => ({
  cookies: async () => cookieStore,
  headers: async () => requestHeaders,
}))

const { requestCode, setLocale, submitCode } = await import('./actions.ts')

beforeEach(() => {
  vi.clearAllMocks()
  requestEmailCode.mockResolvedValue({ ok: true, value: {} })
  verifyEmailCode.mockResolvedValue({ ok: true, value: { userId: 'u1', needsName: false } })
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
