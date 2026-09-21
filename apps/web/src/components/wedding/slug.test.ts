import { describe, expect, it } from 'vitest'
import { FALLBACK_SLUG, slugFromName } from './slug.ts'

describe('slugFromName', () => {
  it('writes the ampersand as "en" and strips accents', () => {
    expect(slugFromName('Marie & Thomas')).toBe('marie-en-thomas')
    expect(slugFromName('Élise + Jörg')).toBe('elise-jorg')
  })

  it('collapses runs of punctuation and trims the ends', () => {
    expect(slugFromName('  --Els   &&  Jan!! ')).toBe('els-en-en-jan')
  })

  it('falls back when too little is left, or the word is reserved', () => {
    expect(slugFromName('Ó')).toBe(FALLBACK_SLUG)
    expect(slugFromName('日本')).toBe(FALLBACK_SLUG)
    expect(slugFromName('Admin')).toBe(FALLBACK_SLUG)
    expect(slugFromName('www')).toBe(FALLBACK_SLUG)
  })

  it('keeps room for the collision suffix and never ends in a hyphen', () => {
    const slug = slugFromName(`${'a'.repeat(39)} b${'c'.repeat(30)}`)
    expect(slug.length).toBeLessThanOrEqual(40)
    expect(slug.endsWith('-')).toBe(false)
  })
})
