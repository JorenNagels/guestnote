import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createDevFiles, type DevFiles } from './dev-files.ts'

/**
 * The development stand-in for the bucket, against a real temp directory. The point of signing
 * its URLs at all is that the browser path is the one production runs, so what is pinned here is
 * that it refuses what S3 would refuse: a different `Content-Type`, a different length, an
 * expired or altered URL, and a key that is not `<uuid>/<uuid>/<uuid>`.
 */
const KEY =
  'aaaaaaaa-0000-0000-0000-00000000000a/bbbbbbbb-0000-0000-0000-00000000000b/cccccccc-0000-0000-0000-00000000000c'
const NOW = new Date('2026-01-01T12:00:00Z')

let dir: string
let dev: DevFiles
let clock = NOW

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'gn-dev-files-'))
  clock = NOW
  dev = createDevFiles({ dir, now: () => clock })
})
afterEach(() => rm(dir, { recursive: true, force: true }))

async function signedPut(overrides: { contentType?: string; contentLength?: number } = {}) {
  const r = await dev.transport.presignPut({
    key: KEY,
    contentType: overrides.contentType ?? 'image/png',
    contentLength: overrides.contentLength ?? 4,
    expiresInSeconds: 300,
    signingDate: NOW,
  })
  if (!r.ok) throw new Error('presign failed')
  const url = new URL(r.url, 'http://x')
  return url.searchParams
}

const put = (query: URLSearchParams, body: string, type = 'image/png', key = KEY) =>
  dev.put(
    key,
    query,
    new Request('http://x/', { method: 'PUT', body, headers: { 'content-type': type } }),
  )

async function signedGet(cd = 'inline; filename="a.png"') {
  const r = await dev.transport.presignGet({
    key: KEY,
    contentDisposition: cd,
    expiresInSeconds: 300,
    signingDate: NOW,
  })
  if (!r.ok) throw new Error('presign failed')
  return new URL(r.url, 'http://x').searchParams
}

describe('dev files', () => {
  it('round-trips a file and serves it with the signed disposition and nosniff', async () => {
    expect((await put(await signedPut(), 'abcd')).status).toBe(200)

    const res = await dev.get(KEY, await signedGet())
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('abcd')
    expect(res.headers.get('content-type')).toBe('image/png')
    expect(res.headers.get('content-disposition')).toBe('inline; filename="a.png"')
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
  })

  it('refuses a body of a different Content-Type, as S3 does', async () => {
    const res = await put(await signedPut(), 'abcd', 'text/html')
    expect(res.status).toBe(403)
    await expect(readFile(join(dir, ...KEY.split('/')))).rejects.toThrow()
  })

  it('refuses a body of a different length', async () => {
    expect((await put(await signedPut(), 'abcde')).status).toBe(403)
  })

  it('refuses an expired URL', async () => {
    const q = await signedPut()
    clock = new Date(NOW.getTime() + 301_000)
    expect((await put(q, 'abcd')).status).toBe(403)
  })

  it('refuses a URL whose parameters were changed after signing', async () => {
    const q = await signedPut()
    q.set('cl', '5')
    expect((await put(q, 'abcde')).status).toBe(403)
  })

  it('refuses a GET signature on a PUT and the other way round', async () => {
    expect((await put(await signedGet(), 'abcd')).status).toBe(403)
    await put(await signedPut(), 'abcd')
    expect((await dev.get(KEY, await signedPut())).status).toBe(403)
  })

  it('refuses a key that is not three UUIDs even when its signature is valid', async () => {
    // Signed for the bad key on purpose: with a signature for a different key the HMAC alone
    // would refuse it, and the traversal guard would never be the thing being tested.
    const evil = '../../etc/passwd'
    const r = await dev.transport.presignPut({
      key: evil,
      contentType: 'image/png',
      contentLength: 4,
      expiresInSeconds: 300,
      signingDate: NOW,
    })
    if (!r.ok) throw new Error('presign failed')
    const q = new URL(r.url, 'http://x').searchParams
    expect((await put(q, 'abcd', 'image/png', evil)).status).toBe(403)
  })

  it('accepts a studio logo key, <org>/brand/<file>, and deletes it', async () => {
    const brand = `${KEY.split('/')[0]}/brand/${KEY.split('/')[2]}`
    const r = await dev.transport.presignPut({
      key: brand,
      contentType: 'image/png',
      contentLength: 4,
      expiresInSeconds: 300,
      signingDate: NOW,
    })
    if (!r.ok) throw new Error('presign failed')
    const q = new URL(r.url, 'http://x').searchParams
    expect((await put(q, 'abcd', 'image/png', brand)).status).toBe(200)
    expect(await readFile(join(dir, ...brand.split('/')), 'utf8')).toBe('abcd')

    expect(await dev.transport.deleteObject({ key: brand })).toEqual({ ok: true })
    await expect(readFile(join(dir, ...brand.split('/')))).rejects.toThrow()
  })

  it.each([
    ['a traversal', '../../etc/passwd'],
    ['a non-brand middle segment', `${KEY.split('/')[0]}/logos/${KEY.split('/')[2]}`],
  ])('refuses to delete %s', async (_label, key) => {
    expect(await dev.transport.deleteObject({ key })).toMatchObject({ ok: false })
  })

  it('is a 404 for a signed GET of a file that was never uploaded', async () => {
    expect((await dev.get(KEY, await signedGet())).status).toBe(404)
  })
})
