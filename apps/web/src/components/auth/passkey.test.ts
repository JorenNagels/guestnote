import { describe, expect, it } from 'vitest'
import {
  conditionalMediationAvailable,
  fromBase64Url,
  platformAuthenticatorAvailable,
  toBase64Url,
} from './passkey.ts'

/**
 * The server half of the passkey capability check, and the reason this file is `.test.ts`
 * while its sibling is `.test.tsx`.
 *
 * `typeof window === 'undefined'` is the FIRST line of both functions, and it is
 * unobservable in jsdom -- there is always a window there. This is the only project that
 * can see the branch at all, which makes the extension split load-bearing rather than
 * bookkeeping: the same module is genuinely tested twice, in the two worlds it runs in.
 *
 * The branch matters because `AuthFlow` is a Client Component that Next still renders on
 * the server first. Without it, the initial render throws on `window` and the sign-in page
 * fails to produce HTML at all.
 */
describe('during server rendering, where there is no window', () => {
  it('has genuinely no window -- the premise of every assertion below', () => {
    expect(typeof window).toBe('undefined')
  })

  it('reports conditional mediation as unavailable', async () => {
    await expect(conditionalMediationAvailable()).resolves.toBe(false)
  })

  it('reports no platform authenticator', async () => {
    await expect(platformAuthenticatorAvailable()).resolves.toBe(false)
  })

  it('resolves rather than throwing, so the first render still produces HTML', async () => {
    await expect(
      Promise.all([conditionalMediationAvailable(), platformAuthenticatorAvailable()]),
    ).resolves.toEqual([false, false])
  })
})

/**
 * The base64url pair, tested here rather than in the `.tsx` sibling because they need no
 * DOM at all -- which is the consolation prize `passkey.ts` claims for hand-rolling them
 * instead of using `PublicKeyCredential.parseCreationOptionsFromJSON()`.
 *
 * These are the functions a wrong sign-in surface fails silently on: a mis-decoded
 * challenge does not throw, it produces an attestation the server rejects, and the
 * interface is required to say nothing about that. So they get exact bytes, not round
 * trips alone.
 */
const bytes = (...values: number[]) => new Uint8Array(values)
const utf8 = (value: string) => new TextEncoder().encode(value)

describe('fromBase64Url', () => {
  it('decodes plain base64url to the exact bytes', () => {
    expect(fromBase64Url('Y2hhbGxlbmdl')).toEqual(utf8('challenge'))
  })

  it('decodes with no padding, which is what the spec sends', () => {
    // 'user' is 4 bytes, so its base64 is 'dXNlcg==' and its base64url is 'dXNlcg'.
    expect(fromBase64Url('dXNlcg')).toEqual(utf8('user'))
  })

  it('tolerates padding if it is there anyway', () => {
    expect(fromBase64Url('dXNlcg==')).toEqual(utf8('user'))
  })

  it('translates the two characters base64url replaces', () => {
    // 0xFB 0xFF decodes from '+/8' in base64 and '-_8' in base64url. Getting this wrong is
    // the classic bug: it only shows up on the ~1 challenge in 8 that contains those bytes.
    expect(fromBase64Url('-_8')).toEqual(bytes(0xfb, 0xff))
    expect(fromBase64Url('+/8')).toEqual(bytes(0xfb, 0xff))
  })

  it('returns an empty array for an empty string rather than throwing', () => {
    expect(fromBase64Url('')).toEqual(bytes())
  })
})

describe('toBase64Url', () => {
  it('encodes bytes to base64url', () => {
    expect(toBase64Url(utf8('challenge').buffer as ArrayBuffer)).toBe('Y2hhbGxlbmdl')
  })

  it('strips padding, because the JSON form never carries it', () => {
    expect(toBase64Url(utf8('user').buffer as ArrayBuffer)).toBe('dXNlcg')
    expect(toBase64Url(utf8('user').buffer as ArrayBuffer)).not.toContain('=')
  })

  it('uses the base64url alphabet, never + or /', () => {
    const encoded = toBase64Url(bytes(0xfb, 0xff).buffer as ArrayBuffer)
    expect(encoded).toBe('-_8')
    expect(encoded).not.toMatch(/[+/]/)
  })

  it('handles a byte above 0x7f without mangling it', () => {
    // `String.fromCharCode` per byte is only correct while each byte stays its own code
    // unit; a TextDecoder round trip here would silently produce U+FFFD instead.
    expect(fromBase64Url(toBase64Url(bytes(0x00, 0x80, 0xff).buffer as ArrayBuffer))).toEqual(
      bytes(0x00, 0x80, 0xff),
    )
  })

  it('round-trips every byte value', () => {
    const all = new Uint8Array(256).map((_, i) => i)
    expect(fromBase64Url(toBase64Url(all.buffer as ArrayBuffer))).toEqual(all)
  })
})
