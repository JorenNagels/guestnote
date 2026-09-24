import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { shrinkScreenshot } from './shrink.ts'

/**
 * The screenshot shrink. `.tsx` for the DOM (`document.createElement('canvas')`), though it
 * renders nothing. jsdom has no canvas, so the bitmap, the 2D context and `toBlob` are stubbed:
 * what this pins is the arithmetic and the quality ladder, not the encoder.
 */
let blobSizes: number[] = []
const toBlobCalls: number[] = []
let canvasSize = { width: 0, height: 0 }

beforeEach(() => {
  blobSizes = []
  toBlobCalls.length = 0
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (
    this: HTMLCanvasElement,
  ) {
    canvasSize = { width: this.width, height: this.height }
    return { drawImage: () => {} } as unknown as CanvasRenderingContext2D
  } as unknown as HTMLCanvasElement['getContext'])
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((cb, _type, quality) => {
    toBlobCalls.push(Number(quality))
    const size = blobSizes.shift() ?? 1
    cb(new Blob([new Uint8Array(size)], { type: 'image/jpeg' }))
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function bitmap(width: number, height: number) {
  vi.stubGlobal('createImageBitmap', async () => ({ width, height, close: () => {} }))
}

const file = new File([new Uint8Array(4)], 'a.png', { type: 'image/png' })

describe('shrinkScreenshot', () => {
  it('scales the longest edge down to 1600px', async () => {
    bitmap(4000, 3000)
    await shrinkScreenshot(file)
    expect(canvasSize).toEqual({ width: 1600, height: 1200 })
  })

  it('never scales a small screenshot up', async () => {
    bitmap(800, 600)
    await shrinkScreenshot(file)
    expect(canvasSize).toEqual({ width: 800, height: 600 })
  })

  it('steps the quality down until the image fits, and returns the one that fits', async () => {
    bitmap(1600, 1000)
    blobSizes = [2_000_000, 500_000]
    const out = await shrinkScreenshot(file)
    expect(toBlobCalls).toEqual([0.85, 0.7])
    expect(out?.size).toBe(500_000)
  })

  it('gives up with null when even the lowest quality is too large', async () => {
    bitmap(1600, 1000)
    blobSizes = [2e6, 2e6, 2e6, 2e6]
    expect(await shrinkScreenshot(file)).toBeNull()
    expect(toBlobCalls).toEqual([0.85, 0.7, 0.55, 0.4])
  })
})
