import { describe, expect, it } from 'vitest'
import { formatSize, kindLabel, withoutExtension } from './format.ts'

describe('formatSize', () => {
  it('uses the locale decimal separator and powers of 1024', () => {
    expect(formatSize(0, 'en')).toBe('0 B')
    expect(formatSize(1023, 'en')).toBe('1,023 B')
    expect(formatSize(1536, 'nl')).toBe('1,5 KB')
    expect(formatSize(1536, 'en')).toBe('1.5 KB')
    expect(formatSize(25 * 1024 * 1024, 'en')).toBe('25.0 MB')
  })
})

describe('kindLabel', () => {
  it('names the documents a planner knows and falls back to the subtype', () => {
    expect(kindLabel('application/pdf')).toBe('PDF')
    expect(
      kindLabel('application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
    ).toBe('DOCX')
    expect(kindLabel('image/heic')).toBe('HEIC')
  })
})

describe('withoutExtension', () => {
  it('drops the last extension only, and leaves dotfiles and bare names alone', () => {
    expect(withoutExtension('IMG_2031.heic')).toBe('IMG_2031')
    expect(withoutExtension('a.b.png')).toBe('a.b')
    expect(withoutExtension('.hidden')).toBe('.hidden')
    expect(withoutExtension('plain')).toBe('plain')
  })
})
