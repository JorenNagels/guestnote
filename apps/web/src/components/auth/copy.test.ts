import { describe, expect, it } from 'vitest'
import { fill, splitAround } from './copy.ts'

/**
 * The two template helpers the sign-in flow renders every message through.
 *
 * Both are deliberately dumb -- `fill` says so in its own doc comment -- so the value here
 * is pinning what "dumb" means at the edges, in a file whose inputs are translator-supplied
 * strings in three languages. A translator moving `{email}` to the front of a sentence, or
 * dropping it, must not produce a blank screen.
 */
describe('splitAround', () => {
  it('splits a sentence around the placeholder', () => {
    expect(splitAround('We sent a code to {email}.', 'email')).toEqual(['We sent a code to ', '.'])
  })

  it('keeps the trailing punctuation AFTER the value', () => {
    // The whole reason this exists rather than `fill`: the address carries its own emphasis
    // mid-sentence, and interpolating then appending moves the full stop in front of it.
    const [, after] = splitAround('We hebben een code naar {email} gestuurd.', 'email')
    expect(after).toBe(' gestuurd.')
  })

  it('handles a placeholder at the very start', () => {
    // French and Dutch word order both put it there in at least one of these strings.
    expect(splitAround('{email} ontvangt zo een code.', 'email')).toEqual([
      '',
      ' ontvangt zo een code.',
    ])
  })

  it('handles a placeholder at the very end', () => {
    expect(splitAround('Code verstuurd naar {email}', 'email')).toEqual([
      'Code verstuurd naar ',
      '',
    ])
  })

  it('returns the whole template and an empty tail when the placeholder is missing', () => {
    // A translator who dropped the token. The sentence still renders in full -- the address
    // is simply not emphasised -- rather than the screen losing its explanation.
    expect(splitAround('Controleer je mail.', 'email')).toEqual(['Controleer je mail.', ''])
  })

  it('splits on the FIRST occurrence when a template repeats the placeholder', () => {
    const [before, after] = splitAround('{email} en {email}', 'email')
    expect(before).toBe('')
    expect(after).toBe(' en {email}')
  })

  it('does not match a different placeholder', () => {
    expect(splitAround('Hallo {inviter}.', 'email')).toEqual(['Hallo {inviter}.', ''])
  })

  it('survives an empty template', () => {
    expect(splitAround('', 'email')).toEqual(['', ''])
  })
})

describe('fill', () => {
  it('substitutes a named placeholder', () => {
    expect(fill('Nog {attempts} pogingen.', { attempts: 2 })).toBe('Nog 2 pogingen.')
  })

  it('stringifies numbers, including zero', () => {
    // Zero is the live case: `messageFor` passes `attemptsLeft ?? 0`, and a falsy-check
    // implementation would render "Nog  pogingen."
    expect(fill('Nog {attempts} pogingen.', { attempts: 0 })).toBe('Nog 0 pogingen.')
  })

  it('replaces every occurrence, not just the first', () => {
    expect(fill('{n} van {n}', { n: 3 })).toBe('3 van 3')
  })

  it('fills several distinct placeholders', () => {
    expect(
      fill('{inviter} nodigt je uit bij {org} als {role}.', {
        inviter: 'Ilse Verhoeven',
        org: 'Studio Wit',
        role: 'beheerder',
      }),
    ).toBe('Ilse Verhoeven nodigt je uit bij Studio Wit als beheerder.')
  })

  it('leaves an unknown placeholder standing rather than blanking it', () => {
    // Visible-and-wrong beats invisible-and-wrong: `{seconds}` on screen is a bug report,
    // an empty gap is a sentence that reads fine and says nothing.
    expect(fill('Opnieuw over {seconds}s.', {})).toBe('Opnieuw over {seconds}s.')
  })

  it('fills the known placeholders and leaves the unknown ones', () => {
    expect(fill('{a} en {b}', { a: 'x' })).toBe('x en {b}')
  })

  it('is a no-op on a template with no placeholders', () => {
    expect(fill('Geen account?', { anything: 'x' })).toBe('Geen account?')
  })

  it('does not treat a substituted value as a template', () => {
    // A value containing braces must not be re-scanned; otherwise a display name of
    // "{org}" would start resolving other keys.
    expect(fill('Hallo {name}.', { name: '{org}', org: 'Studio Wit' })).toBe('Hallo {org}.')
  })

  it('ignores a token with non-word characters, since the pattern is \\w only', () => {
    expect(fill('{not-a-key} blijft.', { 'not-a-key': 'x' })).toBe('{not-a-key} blijft.')
  })
})
