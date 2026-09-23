import { describe, expect, it } from 'vitest'
import { createS3Transport } from './s3.ts'

/**
 * The real SDK and the real presigner, with a fake key. Presigning is a local HMAC and makes no
 * network call, so nothing needs mocking -- and a mock could not have told us the two things
 * below, both measured against SDK 3.1113.0 on 2026-09-21.
 */

const transport = createS3Transport({
  region: 'eu-central-1',
  bucket: 'guestnote-files-test',
  credentials: { accessKeyId: 'AKIAFAKEFAKEFAKEFAKE', secretAccessKey: 'not-a-real-secret' },
})
const signingDate = new Date('2026-09-21T10:00:00.000Z')
const KEY =
  '0190a0a0-0000-7000-8000-000000000001/0190a0a0-0000-7000-8000-000000000002/0190a0a0-0000-7000-8000-000000000003'

async function urlOf(result: Promise<{ ok: boolean; url?: string }>): Promise<URL> {
  const r = await result
  if (!r.ok || !r.url) throw new Error('expected a signed URL')
  return new URL(r.url)
}

describe('presignPut', () => {
  const put = () =>
    transport.presignPut({
      key: KEY,
      contentType: 'application/pdf',
      contentLength: 1234,
      expiresInSeconds: 300,
      signingDate,
    })

  it('addresses the bucket and key, in the right region, expiring when told', async () => {
    const url = await urlOf(put())
    expect(url.protocol).toBe('https:')
    expect(url.host).toBe('guestnote-files-test.s3.eu-central-1.amazonaws.com')
    expect(url.pathname).toBe(`/${KEY}`)
    expect(url.searchParams.get('X-Amz-Expires')).toBe('300')
    expect(url.searchParams.get('X-Amz-Date')).toBe('20260921T100000Z')
  })

  it('signs content-type and content-length, so S3 refuses any other type or size', async () => {
    const signed = (await urlOf(put())).searchParams.get('X-Amz-SignedHeaders')?.split(';')
    // Without the explicit `signableHeaders`, the SDK signs `content-length;host` only and the
    // type is unenforced -- the URL then stores whatever is sent.
    expect(signed).toEqual(['content-length', 'content-type', 'host'])
  })

  it('carries no checksum parameters, which S3 would compare against the real body', async () => {
    const url = await urlOf(put())
    // `x-amz-checksum-crc32=AAAAAA==` is the CRC32 of an empty body; with it, every real upload
    // fails BadDigest even though the URL validates.
    expect(
      [...url.searchParams.keys()].filter((k) => k.toLowerCase().includes('checksum')),
    ).toEqual([])
  })

  it('returns detail, not a thrown AWS error, when signing fails', async () => {
    // An invalid signing date makes the signer throw. Empty credentials do not (tried), so this
    // is the cheapest way to reach the catch without a network or a credential chain.
    const result = await transport.presignPut({
      key: KEY,
      contentType: 'application/pdf',
      contentLength: 1,
      expiresInSeconds: 300,
      signingDate: new Date(Number.NaN),
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.detail).toMatch(/\S/)
  })

  it('fails at construction, not at first upload, when the region is missing', () => {
    expect(() => createS3Transport({ region: '', bucket: 'b' })).toThrow(/Region is missing/)
  })
})

describe('presignGet', () => {
  it('signs the disposition into the query, so the holder cannot change it', async () => {
    const url = await urlOf(
      transport.presignGet({
        key: KEY,
        contentDisposition: `attachment; filename="q.pdf"`,
        expiresInSeconds: 300,
        signingDate,
      }),
    )
    expect(url.host).toBe('guestnote-files-test.s3.eu-central-1.amazonaws.com')
    expect(url.pathname).toBe(`/${KEY}`)
    expect(url.searchParams.get('response-content-disposition')).toBe(
      `attachment; filename="q.pdf"`,
    )
    expect(url.searchParams.get('X-Amz-Expires')).toBe('300')
    expect(url.searchParams.has('x-amz-checksum-mode')).toBe(false)
  })
})
