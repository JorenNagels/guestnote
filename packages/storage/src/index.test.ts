import { describe, expect, it } from 'vitest'
import { createStorage } from './index.ts'
import { ALLOWED_CONTENT_TYPES, DEFAULT_MAX_BYTES, PRESIGN_EXPIRES_SECONDS } from './limits.ts'
import type { PresignGetInput, PresignPutInput, PresignResult, StorageTransport } from './types.ts'

const ORG = '0190a0a0-0000-7000-8000-000000000001'
const WEDDING = '0190a0a0-0000-7000-8000-000000000002'
const FILE = '0190a0a0-0000-7000-8000-000000000003'
const scope = { orgId: ORG, weddingId: WEDDING }
const NOW = new Date('2026-09-21T10:00:00.000Z')

/**
 * A recording transport. The point of the `StorageTransport` port is that everything in
 * `index.ts` -- keys, the allow-list, the limit, expiry, the header -- can be asserted here
 * without an SDK, a client or a mock of either. What S3 does with the values is `s3.test.ts`.
 */
function fake(result: PresignResult = { ok: true, url: 'https://signed.example/x' }) {
  const puts: PresignPutInput[] = []
  const gets: PresignGetInput[] = []
  const transport: StorageTransport = {
    name: 'fake',
    async presignPut(input) {
      puts.push(input)
      return result
    },
    async presignGet(input) {
      gets.push(input)
      return result
    },
  }
  return { transport, puts, gets }
}

const upload = (overrides: Record<string, unknown> = {}) => ({
  scope,
  fileId: FILE,
  kind: 'file' as const,
  contentType: 'application/pdf',
  sizeBytes: 1000,
  ...overrides,
})

describe('presignUpload', () => {
  it('signs the tenant key, the normalised type and the exact size', async () => {
    const { transport, puts } = fake()
    const storage = createStorage({ transport, now: () => NOW })

    const result = await storage.presignUpload(upload({ contentType: 'Application/PDF; x=y' }))

    expect(puts).toEqual([
      {
        key: `${ORG}/${WEDDING}/${FILE}`,
        contentType: 'application/pdf',
        contentLength: 1000,
        expiresInSeconds: PRESIGN_EXPIRES_SECONDS,
        signingDate: NOW,
      },
    ])
    expect(result).toEqual({
      ok: true,
      key: `${ORG}/${WEDDING}/${FILE}`,
      url: 'https://signed.example/x',
      method: 'PUT',
      // What the browser is told to send is what was signed, not what it reported.
      headers: { 'Content-Type': 'application/pdf', 'Content-Length': '1000' },
      expiresAt: '2026-09-21T10:05:00.000Z',
    })
  })

  describe('size limit', () => {
    it('accepts exactly the limit and refuses one byte over', async () => {
      const { transport, puts } = fake()
      const storage = createStorage({ transport, maxBytes: 5000 })

      expect((await storage.presignUpload(upload({ sizeBytes: 5000 }))).ok).toBe(true)
      const over = await storage.presignUpload(upload({ sizeBytes: 5001 }))

      expect(over).toMatchObject({ ok: false, failure: 'tooLarge' })
      // Refused before signing: nothing was handed to the provider for the over-limit call.
      expect(puts).toHaveLength(1)
    })

    it('defaults to 25 MiB', async () => {
      const storage = createStorage({ transport: fake().transport })
      expect(DEFAULT_MAX_BYTES).toBe(25 * 1024 * 1024)
      expect((await storage.presignUpload(upload({ sizeBytes: DEFAULT_MAX_BYTES }))).ok).toBe(true)
      expect(
        await storage.presignUpload(upload({ sizeBytes: DEFAULT_MAX_BYTES + 1 })),
      ).toMatchObject({ failure: 'tooLarge' })
    })

    it.each([[0], [-1], [1.5], [Number.NaN], [Number.POSITIVE_INFINITY]])(
      'refuses %s as invalidSize',
      async (sizeBytes) => {
        const { transport, puts } = fake()
        const result = await createStorage({ transport }).presignUpload(upload({ sizeBytes }))
        expect(result).toMatchObject({ ok: false, failure: 'invalidSize' })
        expect(puts).toHaveLength(0)
      },
    )

    it.each([[0], [-5], [2.5], [Number.NaN]])(
      'throws at construction for maxBytes %s',
      (maxBytes) => {
        expect(() => createStorage({ transport: fake().transport, maxBytes })).toThrow(/maxBytes/)
      },
    )
  })

  describe('content type', () => {
    it('accepts a document as a file and refuses it as an image', async () => {
      const storage = createStorage({ transport: fake().transport })
      expect((await storage.presignUpload(upload({ kind: 'file' }))).ok).toBe(true)
      expect(await storage.presignUpload(upload({ kind: 'image' }))).toMatchObject({
        ok: false,
        failure: 'typeNotAllowed',
      })
    })

    it('accepts an image under both kinds', async () => {
      const storage = createStorage({ transport: fake().transport })
      for (const kind of ['file', 'image'] as const) {
        expect((await storage.presignUpload(upload({ kind, contentType: 'image/heic' }))).ok).toBe(
          true,
        )
      }
    })

    it.each([['image/svg+xml'], ['text/html'], ['application/x-msdownload'], ['']])(
      'refuses %j under every kind',
      async (contentType) => {
        const { transport, puts } = fake()
        const storage = createStorage({ transport })
        for (const kind of ['file', 'image'] as const) {
          expect(await storage.presignUpload(upload({ kind, contentType }))).toMatchObject({
            ok: false,
            failure: 'typeNotAllowed',
          })
        }
        expect(puts).toHaveLength(0)
      },
    )

    it('never lists a type that can carry script', () => {
      for (const list of Object.values(ALLOWED_CONTENT_TYPES)) {
        expect(list).not.toContain('image/svg+xml')
        expect(list).not.toContain('text/html')
      }
    })
  })

  it('throws, not returns, on a malformed file id -- that is a bug, not a user error', async () => {
    const storage = createStorage({ transport: fake().transport })
    await expect(storage.presignUpload(upload({ fileId: '../x' }))).rejects.toThrow(/fileId/)
  })

  it('maps a transport failure to unavailable and keeps its detail', async () => {
    const storage = createStorage({
      transport: fake({ ok: false, detail: 'CredentialsProviderError: none' }).transport,
    })
    expect(await storage.presignUpload(upload())).toEqual({
      ok: false,
      failure: 'unavailable',
      detail: 'CredentialsProviderError: none',
    })
  })
})

describe('presignDownload', () => {
  const key = `${ORG}/${WEDDING}/${FILE}`

  it('signs the key with an attachment disposition by default', async () => {
    const { transport, gets } = fake()
    const storage = createStorage({ transport, now: () => NOW })

    const result = await storage.presignDownload({ scope, key, filename: 'quote.pdf' })

    expect(gets).toEqual([
      {
        key,
        contentDisposition: `attachment; filename="quote.pdf"; filename*=UTF-8''quote.pdf`,
        expiresInSeconds: PRESIGN_EXPIRES_SECONDS,
        signingDate: NOW,
      },
    ])
    expect(result).toEqual({
      ok: true,
      url: 'https://signed.example/x',
      expiresAt: '2026-09-21T10:05:00.000Z',
    })
  })

  it('passes inline through when asked', async () => {
    const { transport, gets } = fake()
    await createStorage({ transport }).presignDownload({
      scope,
      key,
      filename: 'a.png',
      disposition: 'inline',
    })
    expect(gets[0]?.contentDisposition).toMatch(/^inline; /)
  })

  it("throws on another tenant's key and never reaches the transport", async () => {
    const { transport, gets } = fake()
    const foreign = `${ORG}/0190a0a0-0000-7000-8000-000000000009/${FILE}`
    await expect(
      createStorage({ transport }).presignDownload({ scope, key: foreign, filename: 'x.pdf' }),
    ).rejects.toThrow(/is not an object of org/)
    expect(gets).toHaveLength(0)
  })

  it('maps a transport failure to unavailable', async () => {
    const storage = createStorage({ transport: fake({ ok: false, detail: 'boom' }).transport })
    expect(await storage.presignDownload({ scope, key, filename: 'x.pdf' })).toEqual({
      ok: false,
      failure: 'unavailable',
      detail: 'boom',
    })
  })
})
