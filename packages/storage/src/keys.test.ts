import { describe, expect, it } from 'vitest'
import {
  assertBrandKeyInScope,
  assertKeyInScope,
  buildBrandKey,
  buildObjectKey,
  contentDisposition,
} from './keys.ts'

const ORG = '0190a0a0-0000-7000-8000-000000000001'
const OTHER_ORG = '0190a0a0-0000-7000-8000-000000000009'
const WEDDING = '0190a0a0-0000-7000-8000-000000000002'
const FILE = '0190a0a0-0000-7000-8000-000000000003'
const scope = { orgId: ORG, weddingId: WEDDING }

describe('buildObjectKey', () => {
  it('is org/wedding/file and nothing else', () => {
    expect(buildObjectKey(scope, FILE)).toBe(`${ORG}/${WEDDING}/${FILE}`)
  })

  it('lower-cases, so one file cannot have two keys', () => {
    const upper = { orgId: ORG.toUpperCase(), weddingId: WEDDING.toUpperCase() }
    expect(buildObjectKey(upper, FILE.toUpperCase())).toBe(`${ORG}/${WEDDING}/${FILE}`)
  })

  it.each([
    ['a path traversal', '../../etc/passwd'],
    ['a slash-bearing id', `${FILE}/extra`],
    ['an empty id', ''],
    ['a non-uuid', 'not-a-uuid'],
  ])('throws on %s as the file id', (_label, bad) => {
    expect(() => buildObjectKey(scope, bad)).toThrow(/fileId must be a UUID/)
  })

  it('throws on a malformed org or wedding id, naming which one', () => {
    expect(() => buildObjectKey({ orgId: 'x', weddingId: WEDDING }, FILE)).toThrow(/scope\.orgId/)
    expect(() => buildObjectKey({ orgId: ORG, weddingId: 'x' }, FILE)).toThrow(/scope\.weddingId/)
  })
})

describe('assertKeyInScope', () => {
  it('accepts a key the scope built', () => {
    expect(() => assertKeyInScope(scope, buildObjectKey(scope, FILE))).not.toThrow()
  })

  it('refuses a key from another org', () => {
    const foreign = buildObjectKey({ orgId: OTHER_ORG, weddingId: WEDDING }, FILE)
    expect(() => assertKeyInScope(scope, foreign)).toThrow(/is not an object of org/)
  })

  it('refuses a key from another wedding in the same org', () => {
    const foreign = buildObjectKey({ orgId: ORG, weddingId: OTHER_ORG }, FILE)
    expect(() => assertKeyInScope(scope, foreign)).toThrow(/is not an object of org/)
  })

  it.each([
    ['a traversal out of the prefix', `${ORG}/${WEDDING}/../${OTHER_ORG}/${WEDDING}/${FILE}`],
    ['a trailing segment', `${ORG}/${WEDDING}/${FILE}/extra`],
    ['a missing file segment', `${ORG}/${WEDDING}`],
    ['a non-uuid leaf', `${ORG}/${WEDDING}/report.pdf`],
    ['an empty key', ''],
  ])('refuses %s', (_label, key) => {
    expect(() => assertKeyInScope(scope, key)).toThrow(/is not an object of org/)
  })
})

describe('buildBrandKey', () => {
  it('is org/brand/file, lower-cased', () => {
    expect(buildBrandKey({ orgId: ORG.toUpperCase() }, FILE.toUpperCase())).toBe(
      `${ORG}/brand/${FILE}`,
    )
  })

  it.each([
    ['a path traversal', '../../etc/passwd'],
    ['a slash-bearing id', `${FILE}/extra`],
    ['a non-uuid', 'logo.png'],
  ])('throws on %s as the file id', (_label, bad) => {
    expect(() => buildBrandKey({ orgId: ORG }, bad)).toThrow(/fileId must be a UUID/)
  })

  it('throws on a malformed org id', () => {
    expect(() => buildBrandKey({ orgId: 'x' }, FILE)).toThrow(/scope\.orgId/)
  })

  it('can never equal a wedding key, so neither check accepts the other', () => {
    const brand = buildBrandKey({ orgId: ORG }, FILE)
    expect(() => assertKeyInScope(scope, brand)).toThrow(/is not an object of org/)
    expect(() => assertBrandKeyInScope({ orgId: ORG }, buildObjectKey(scope, FILE))).toThrow(
      /is not a brand object/,
    )
  })
})

describe('assertBrandKeyInScope', () => {
  const brand = { orgId: ORG }

  it('accepts a key the scope built', () => {
    expect(() => assertBrandKeyInScope(brand, buildBrandKey(brand, FILE))).not.toThrow()
  })

  it.each([
    ["another org's logo", `${OTHER_ORG}/brand/${FILE}`],
    ['a traversal out of the prefix', `${ORG}/brand/../${OTHER_ORG}/brand/${FILE}`],
    ['a trailing segment', `${ORG}/brand/${FILE}/extra`],
    ['a missing file segment', `${ORG}/brand`],
    ['a non-uuid leaf', `${ORG}/brand/logo.png`],
    ['a different middle segment', `${ORG}/brands/${FILE}`],
    ['an empty key', ''],
  ])('refuses %s', (_label, key) => {
    expect(() => assertBrandKeyInScope(brand, key)).toThrow(/is not a brand object/)
  })
})

describe('contentDisposition', () => {
  it('states the disposition and both filename forms', () => {
    expect(contentDisposition('attachment', 'quote.pdf')).toBe(
      `attachment; filename="quote.pdf"; filename*=UTF-8''quote.pdf`,
    )
    expect(contentDisposition('inline', 'a.png')).toMatch(/^inline; /)
  })

  it('keeps the real name in filename* and a safe fallback in filename', () => {
    const header = contentDisposition('attachment', "Facture d'Élodie.pdf")
    // Apostrophe and E-acute each become one underscore.
    expect(header).toContain('filename="Facture d__lodie.pdf"')
    // RFC 5987 attr-char excludes the apostrophe, which encodeURIComponent leaves alone.
    expect(header).toContain(`filename*=UTF-8''Facture%20d%27%C3%89lodie.pdf`)
  })

  it('cannot be made to end the header: quotes, CR and LF do not survive', () => {
    const header = contentDisposition('attachment', 'a"; x=y\r\nSet-Cookie: s=1')
    // Cannot discriminate the control-character strip on its own (mutation-checked
    // 2026-09-21): with the strip narrowed to skip CR and LF this still passes, because the
    // ASCII fallback maps them to `_` and `encodeURIComponent` escapes them. The strip is a
    // second lock here; the interior-CR/LF case below is what pins it.
    expect(header).not.toMatch(/[\r\n]/)
    // Exactly the two quotes that wrap the fallback name.
    expect(header.match(/"/g)).toHaveLength(2)
  })

  it('strips a CR/LF inside the name rather than turning it into an underscore', () => {
    // `trim()` would remove a leading or trailing one whatever the strip does, so it has to be
    // interior to tell the two apart.
    expect(contentDisposition('attachment', 'a\r\nb.pdf')).toContain('filename="ab.pdf"')
  })

  it('drops path separators, so a download cannot be saved outside the folder', () => {
    expect(contentDisposition('attachment', '../../etc/passwd')).toContain(
      'filename=".._.._etc_passwd"',
    )
  })

  it.each([[''], ['   '], ['\u0000\u001f']])('falls back to "file" for %j', (name) => {
    expect(contentDisposition('attachment', name)).toContain('filename="file"')
  })

  it('caps the name at 200 characters', () => {
    const header = contentDisposition('attachment', `${'a'.repeat(500)}.pdf`)
    expect(header.match(/filename="([^"]*)"/)?.[1]).toHaveLength(200)
  })
})
