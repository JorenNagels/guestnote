import { describe, expect, it } from 'vitest'
import {
  DENSITIES,
  NAV_STATES,
  PREF_COOKIE_OPTIONS,
  parseDensity,
  parseNavState,
  parseTheme,
  THEMES,
} from './prefs.ts'

/**
 * These parsers are the whole defence between a hand-editable cookie and `<html>`.
 *
 * Root layout B interpolates their output into `className` and two `data-` attributes on
 * every dashboard render, and the input is client state. So the property that matters is
 * not "recognises the good values" -- it is that **nothing else survives**, whatever it is.
 * A garbage value reaching `data-density` is a broken selector; one reaching `className`
 * is attacker-controlled markup on the element every stylesheet keys off.
 */

const NOT_A_VALUE = [
  '',
  ' ',
  'Light',
  'LIGHT',
  'light ',
  'dark;',
  'comfortable"',
  'expanded\n',
  '../../etc',
  '"><script>alert(1)</script>',
  'dark expanded',
  '0',
  'null',
  'undefined',
  'true',
]

describe('parseTheme', () => {
  it.each(THEMES)('keeps %s', (theme) => {
    expect(parseTheme(theme)).toBe(theme)
  })

  it('falls back to light when the cookie is absent', () => {
    expect(parseTheme(undefined)).toBe('light')
  })

  /**
   * Case and whitespace are in the list on purpose. `'Light'` is the shape a value takes
   * after a well-meaning round trip through some other system, and it is exactly the input
   * a `!== 'dark'` check would wave through while a set membership test does not.
   */
  it.each(NOT_A_VALUE)('refuses %j and returns the safe default', (value) => {
    expect(parseTheme(value)).toBe('light')
  })

  /**
   * The direction that matters. Light is the default, so a corrupted cookie failing OPEN
   * into dark would be invisible in review -- it renders, it just renders wrong. Asserting
   * the constant rather than "not dark" is what makes this discriminate.
   */
  it('never yields dark from an unrecognised value', () => {
    for (const value of NOT_A_VALUE) expect(parseTheme(value)).not.toBe('dark')
  })
})

describe('parseDensity', () => {
  it.each(DENSITIES)('keeps %s', (density) => {
    expect(parseDensity(density)).toBe(density)
  })

  it('falls back to comfortable when the cookie is absent', () => {
    expect(parseDensity(undefined)).toBe('comfortable')
  })

  it.each(NOT_A_VALUE)('refuses %j and returns the safe default', (value) => {
    expect(parseDensity(value)).toBe('comfortable')
  })
})

describe('parseNavState', () => {
  it.each(NAV_STATES)('keeps %s', (state) => {
    expect(parseNavState(state)).toBe(state)
  })

  it('falls back to expanded when the cookie is absent', () => {
    expect(parseNavState(undefined)).toBe('expanded')
  })

  it.each(NOT_A_VALUE)('refuses %j and returns the safe default', (value) => {
    expect(parseNavState(value)).toBe('expanded')
  })
})

describe('PREF_COOKIE_OPTIONS', () => {
  /**
   * `sameSite: 'strict'` would drop these on the navigation that matters most: the apex
   * links into the dashboard (`components/marketing/app-entry-link.tsx`), and a strict
   * cookie is withheld on a cross-site link, so a planner's theme would flick back to the
   * default exactly when they arrive. `lax` is the deliberate choice, not the default one.
   */
  it('is lax, so the cookie survives arriving from the marketing apex', () => {
    expect(PREF_COOKIE_OPTIONS.sameSite).toBe('lax')
  })

  it('is scoped to the whole surface, not to the path that set it', () => {
    expect(PREF_COOKIE_OPTIONS.path).toBe('/')
  })

  it('outlives a session, because the alternative to remembering is guessing', () => {
    expect(PREF_COOKIE_OPTIONS.maxAge).toBeGreaterThan(60 * 60 * 24 * 30)
  })
})

describe('PREF_COOKIE_OPTIONS, the security-relevant half', () => {
  /**
   * Unconditional, with no `NODE_ENV` branch, because `*.localhost` is a potentially
   * trustworthy origin -- the same property `env.ts` relies on for `__Host-` session
   * cookies over plain http in development. Asserted so a future "this breaks my local
   * setup" edit has to argue with a test rather than a comment.
   */
  it('is secure, and unconditionally so', () => {
    expect(PREF_COOKIE_OPTIONS.secure).toBe(true)
  })
})
