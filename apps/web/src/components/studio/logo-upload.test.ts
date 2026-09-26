import { ALLOWED_CONTENT_TYPES, LOGO_MAX_BYTES as STORAGE_MAX } from '@guestnote/storage'
import { describe, expect, it, vi } from 'vitest'
import {
  checkLogoFile,
  LOGO_MAX_BYTES,
  LOGO_TYPES,
  logoErrorOf,
  uploadLogo,
} from './logo-upload.ts'

const png = (bytes = 4) => new File([new Uint8Array(bytes)], 'logo.png', { type: 'image/png' })

describe('the client restatement of the limits', () => {
  // The client copy exists only so sign-up can answer before a studio exists. If the storage
  // package changes its list or its limit, this is where the two stop agreeing.
  it('matches @guestnote/storage exactly', () => {
    expect([...LOGO_TYPES].sort()).toEqual([...ALLOWED_CONTENT_TYPES.logo].sort())
    expect(LOGO_MAX_BYTES).toBe(STORAGE_MAX)
  })
})

describe('checkLogoFile', () => {
  it('accepts a PNG at exactly the limit and refuses one byte over', () => {
    expect(checkLogoFile(png(LOGO_MAX_BYTES))).toEqual({ ok: true })
    expect(checkLogoFile(png(LOGO_MAX_BYTES + 1))).toEqual({ ok: false, error: 'tooLarge' })
  })

  it.each([
    ['an SVG', new File(['<svg/>'], 'a.svg', { type: 'image/svg+xml' })],
    ['a GIF', new File(['GIF89a'], 'a.gif', { type: 'image/gif' })],
    ['an empty PNG', png(0)],
    ['a file with no type', new File(['x'], 'a')],
  ])('refuses %s as not an image', (_label, file) => {
    expect(checkLogoFile(file)).toEqual({ ok: false, error: 'notImage' })
  })
})

describe('logoErrorOf', () => {
  it.each([
    ['typeNotAllowed', 'notImage'],
    ['invalidSize', 'notImage'],
    ['tooLarge', 'tooLarge'],
    ['forbidden', 'failed'],
    ['unavailable', 'failed'],
    ['notFound', 'failed'],
  ])('%s -> %s', (code, error) => {
    expect(logoErrorOf(code)).toBe(error)
  })
})

describe('uploadLogo', () => {
  const started = {
    ok: true as const,
    fileId: 'f1',
    url: '/put',
    headers: { 'Content-Type': 'image/png' },
  }

  it('signs, PUTs the file with the signed headers, then confirms -- in that order', async () => {
    const order: string[] = []
    const deps = {
      start: vi.fn(async () => {
        order.push('start')
        return started
      }),
      confirm: vi.fn(async () => {
        order.push('confirm')
        return { ok: true as const }
      }),
      fetch: vi.fn(async () => {
        order.push('put')
        return new Response(null, { status: 200 })
      }),
    }
    const file = png()
    expect(await uploadLogo(file, deps)).toEqual({ ok: true })
    expect(order).toEqual(['start', 'put', 'confirm'])
    expect(deps.start).toHaveBeenCalledWith({ mime: 'image/png', sizeBytes: 4 })
    expect(deps.fetch).toHaveBeenCalledWith('/put', {
      method: 'PUT',
      headers: started.headers,
      body: file,
    })
    expect(deps.confirm).toHaveBeenCalledWith('f1')
  })

  it('stops at a refused signature, and maps its code', async () => {
    const deps = {
      start: vi.fn(async () => ({ ok: false as const, error: 'tooLarge' as const })),
      confirm: vi.fn(),
      fetch: vi.fn(),
    }
    expect(await uploadLogo(png(), deps)).toEqual({ ok: false, error: 'tooLarge' })
    expect(deps.fetch).not.toHaveBeenCalled()
    expect(deps.confirm).not.toHaveBeenCalled()
  })

  it('does not confirm a PUT the bucket refused', async () => {
    const deps = {
      start: vi.fn(async () => started),
      confirm: vi.fn(),
      fetch: vi.fn(async () => new Response(null, { status: 403 })),
    }
    expect(await uploadLogo(png(), deps)).toEqual({ ok: false, error: 'failed' })
    expect(deps.confirm).not.toHaveBeenCalled()
  })

  it('answers failed, never throws, when the network does', async () => {
    const deps = {
      start: vi.fn(async () => {
        throw new TypeError('Failed to fetch')
      }),
      confirm: vi.fn(),
    }
    expect(await uploadLogo(png(), deps)).toEqual({ ok: false, error: 'failed' })
  })
})
