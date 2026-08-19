import { describe, expect, it } from 'vitest'
import en from '../../messages/en.json'
import fr from '../../messages/fr.json'
import nl from '../../messages/nl.json'

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
 */

const CATALOGUES = { en, fr } as const

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
