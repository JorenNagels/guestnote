import { describe, expect, it, vi } from 'vitest'
import type { Done, StartUpload } from '../../lib/wedding-files.ts'
import { inPool, UPLOAD_CONCURRENCY, uploadFile } from './upload.ts'

const file = new File(['hello'], 'a.png', { type: 'image/png' })
const started: StartUpload = {
  ok: true,
  fileId: 'f1',
  url: 'https://s3.example/put',
  headers: { 'Content-Type': 'image/png' },
}
const opts = { name: 'a', visibility: 'shared' as const }

function deps(over: { start?: StartUpload; confirm?: Done; put?: () => Promise<Response> } = {}) {
  const calls: string[] = []
  return {
    calls,
    deps: {
      start: vi.fn(async () => {
        calls.push('start')
        return over.start ?? started
      }),
      confirm: vi.fn(async () => {
        calls.push('confirm')
        return over.confirm ?? ({ ok: true } as Done)
      }),
      fetch: vi.fn(async () => {
        calls.push('put')
        return over.put ? over.put() : new Response(null, { status: 200 })
      }) as unknown as typeof fetch,
    },
  }
}

describe('uploadFile', () => {
  it('signs, then PUTs the bytes with the signed headers, then confirms', async () => {
    const { deps: d, calls } = deps()
    expect(await uploadFile(file, opts, d)).toEqual({ ok: true, fileId: 'f1' })
    expect(calls).toEqual(['start', 'put', 'confirm'])
    expect(d.start).toHaveBeenCalledWith({
      name: 'a',
      mime: 'image/png',
      sizeBytes: 5,
      visibility: 'shared',
    })
    expect(d.fetch).toHaveBeenCalledWith('https://s3.example/put', {
      method: 'PUT',
      headers: { 'Content-Type': 'image/png' },
      body: file,
    })
  })

  it('stops at a refusal: no PUT, no confirm', async () => {
    const { deps: d, calls } = deps({ start: { ok: false, error: 'too_large' } })
    expect(await uploadFile(file, opts, d)).toEqual({ ok: false, error: 'too_large' })
    expect(calls).toEqual(['start'])
  })

  it('does not confirm when the PUT is refused', async () => {
    const { deps: d, calls } = deps({ put: async () => new Response(null, { status: 403 }) })
    expect(await uploadFile(file, opts, d)).toEqual({ ok: false, error: 'upload_failed' })
    expect(calls).toEqual(['start', 'put'])
  })

  it('reports a rejected fetch as a network error', async () => {
    const { deps: d } = deps({
      put: async () => {
        throw new TypeError('Failed to fetch')
      },
    })
    expect(await uploadFile(file, opts, d)).toEqual({ ok: false, error: 'network' })
  })

  it('passes the confirm failure through', async () => {
    const { deps: d } = deps({ confirm: { ok: false, error: 'not_found' } })
    expect(await uploadFile(file, opts, d)).toEqual({ ok: false, error: 'not_found' })
  })
})

describe('inPool', () => {
  it('never runs more than the limit at once, and runs everything', async () => {
    let live = 0
    let peak = 0
    const done: number[] = []
    await inPool([1, 2, 3, 4, 5, 6, 7, 8], async (n) => {
      live += 1
      peak = Math.max(peak, live)
      await new Promise((r) => setTimeout(r, 2))
      live -= 1
      done.push(n)
    })
    expect(peak).toBe(UPLOAD_CONCURRENCY)
    expect(done.sort()).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
  })

  it('handles an empty list', async () => {
    await expect(inPool([], async () => {})).resolves.toBeUndefined()
  })
})
