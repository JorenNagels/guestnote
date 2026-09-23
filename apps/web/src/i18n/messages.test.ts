import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import enBase from '../../messages/en.json'
import frBase from '../../messages/fr.json'
import nlBase from '../../messages/nl.json'
import { mergeSlices, SLICES } from './catalogue.ts'

/**
 * The three catalogues, checked against each other.
 *
 * `i18n/request.ts` loads one locale per request, so a key that exists in `nl.json` and not in
 * `fr.json` is not an error anywhere -- next-intl falls back to rendering the key path and the
 * page still returns 200. On a screen a developer would notice `auth.signIn.title` where a
 * heading should be. In an email nobody sees it: the message is rendered on a server, handed
 * to SES, and delivered to a planner who has no idea it was supposed to say something else.
 *
 * `lib/mailer.ts` gives the email section a typed shape, so a missing KEY IN THE TYPE is a
 * compile error. This covers what the type cannot: a key missing from one JSON file, and a
 * placeholder dropped in translation.
 *
 * NL is the reference because `lib/locales.ts` makes it `DEFAULT_LOCALE`.
 *
 * ## The slice files
 *
 * The planner app's copy lives in `messages/app/<slice>.<locale>.json` and `i18n/catalogue.ts`
 * merges it under `app.<slice>`. Everything below compares the MERGED catalogues, built here
 * with the same `mergeSlices` the runtime uses, so a key missing from one locale's slice file
 * fails exactly like a key missing from `fr.json`. The slice files are read from disk with
 * `readFileSync` and not imported: the set that exists on disk is itself under test, and a
 * static import of a file that is not there would fail the whole module instead of naming it.
 */

const APP_DIR = fileURLToPath(new URL('../../messages/app/', import.meta.url))
const LOCALES = ['nl', 'en', 'fr'] as const

function merged(locale: (typeof LOCALES)[number], base: Parameters<typeof mergeSlices>[0]) {
  const slices: Record<string, Parameters<typeof mergeSlices>[0]> = {}
  for (const id of SLICES) {
    try {
      slices[id] = JSON.parse(readFileSync(`${APP_DIR}${id}.${locale}.json`, 'utf8'))
    } catch {
      // Left out, so the key comparison below reports the gap by name. The file-set test
      // reports the missing file itself.
    }
  }
  return mergeSlices(base, slices)
}

const nl = merged('nl', nlBase)
const CATALOGUES = { en: merged('en', enBase), fr: merged('fr', frBase) } as const

/** Every leaf path, so nesting differences show up as key differences. */
function leafKeys(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) return [prefix]
  return Object.entries(value).flatMap(([key, child]) =>
    leafKeys(child, prefix === '' ? key : `${prefix}.${key}`),
  )
}

function leafValues(value: unknown, prefix = ''): Map<string, string> {
  const out = new Map<string, string>()
  if (typeof value === 'string') {
    out.set(prefix, value)
    return out
  }
  if (typeof value !== 'object' || value === null) return out
  for (const [key, child] of Object.entries(value)) {
    for (const [k, v] of leafValues(child, prefix === '' ? key : `${prefix}.${key}`)) out.set(k, v)
  }
  return out
}

/**
 * The ICU argument names in a message.
 *
 * `[A-Za-z0-9_]+` deliberately does not match the `#` inside a plural branch
 * (`{minutes, plural, one {# minuut} ...}`), so a plural message reports one argument --
 * `minutes` -- rather than three.
 */
function placeholders(message: string): Set<string> {
  return new Set([...message.matchAll(/\{\s*([A-Za-z0-9_]+)/g)].map((m) => m[1] ?? ''))
}

const reference = leafValues(nl)

describe('the NL, EN and FR catalogues stay in step', () => {
  /**
   * A canary, in the spirit of packages/db/src/no-unsafe-imports.test.ts: if `leafKeys` ever
   * returned nothing, every comparison below would compare two empty arrays and pass forever.
   */
  it('actually read the catalogues', () => {
    expect(leafKeys(nl).length).toBeGreaterThan(60)
    expect(reference.get('email.signInCode.subject')).toContain('{code}')
    // A slice key, so a merge that dropped the slice files would fail here and not only
    // by every planner-app label rendering as its own path.
    expect(reference.get('app.shell.nav.today')).toBeTruthy()
  })

  /**
   * The file set, both directions. A file on disk that `SLICES` does not list is never merged
   * -- its keys render as paths and no other test notices, because it is not in any catalogue
   * -- and a listed slice missing a locale is a runtime import failure on every page.
   */
  it('has exactly one file per listed slice and locale under messages/app', () => {
    const expected = SLICES.flatMap((id) => LOCALES.map((l) => `${id}.${l}.json`)).sort()
    expect(readdirSync(APP_DIR).sort()).toEqual(expected)
  })

  it('refuses a slice whose id is already a key under app', () => {
    expect(() => mergeSlices(nlBase, { weddings: {} })).toThrow(/collides with app\.weddings/)
  })

  for (const [locale, catalogue] of Object.entries(CATALOGUES)) {
    it(`${locale} has exactly the same keys as nl`, () => {
      const mine = leafKeys(catalogue).sort()
      const theirs = leafKeys(nl).sort()
      expect(
        mine.filter((k) => !theirs.includes(k)),
        `extra keys in ${locale}.json`,
      ).toEqual([])
      expect(
        theirs.filter((k) => !mine.includes(k)),
        `missing from ${locale}.json`,
      ).toEqual([])
    })

    /**
     * The failure this catches is specific and silent: a translator drops `{minutes}` and the
     * sentence renders as "Le code expire dans ." -- grammatical enough to survive review, and
     * only wrong in the language nobody on the team reads back.
     */
    it(`${locale} keeps every ICU placeholder nl uses`, () => {
      const mine = leafValues(catalogue)
      const wrong: string[] = []
      for (const [key, dutch] of reference) {
        const translated = mine.get(key)
        if (translated === undefined) continue
        const expected = [...placeholders(dutch)].sort()
        const actual = [...placeholders(translated)].sort()
        if (expected.join(',') !== actual.join(',')) {
          wrong.push(
            `${key}: nl has {${expected.join('} {')}}, ${locale} has {${actual.join('} {')}}`,
          )
        }
      }
      expect(wrong, `placeholder mismatch in ${locale}.json`).toEqual([])
    })
  }
})
