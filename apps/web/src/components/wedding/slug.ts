import { RESERVED_SUBDOMAINS } from '@guestnote/core/hosts'

/**
 * The starting slug for a new wedding, from the couple's name: `Marie & Thomas` becomes
 * `marie-en-thomas`. The slug is the guest site's subdomain, so it is ASCII, a DNS label, and
 * not a word `hosts.ts` reserves.
 *
 * ## The fallback, and what it costs
 *
 * A name that leaves fewer than three characters (`Ó`, `--`) or lands on a reserved word
 * (`Admin`) becomes `bruiloft`. That is not unique, and does not need to be: `createWedding`
 * adds a random suffix when a slug is taken. Rejected: refusing the name -- the couple's name
 * is a display string and must not be constrained by what a subdomain can hold.
 *
 * NFD then stripping the combining marks turns `Élise` into `elise` and not into `lise`.
 * `&` is written out as ` en ` because the default locale is Dutch; a slug is not translated
 * afterwards, so an English-speaking planner gets the same word.
 */
export const FALLBACK_SLUG = 'bruiloft'
const MIN = 3
// A DNS label is 63 characters. The suffix `createWedding` may add takes 6 of them.
const MAX = 40

export function slugFromName(name: string): string {
  const slug = name
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replaceAll('&', ' en ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX)
    .replace(/-+$/, '')
  if (slug.length < MIN || RESERVED_SUBDOMAINS.has(slug)) return FALLBACK_SLUG
  return slug
}
