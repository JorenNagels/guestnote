import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { COLOUR, type ThemeColour, TOKEN_SOURCE } from './theme.ts'

/**
 * The guard that makes `theme.ts` safe to copy from.
 *
 * An email cannot use `var()` (see the header comment in theme.ts), so the palette is
 * duplicated as literal hex. Duplication without a check is drift, and colour drift is
 * the kind that ships: nothing throws, nothing looks broken in a diff, and the first
 * report is a customer noticing an email does not match the dashboard.
 *
 * So this parses the real stylesheet, resolves the real `var()` chain, and compares. Same
 * reasoning as packages/db/src/no-unsafe-imports.test.ts: the rule is enforced by
 * something that fails, not by a comment asking people to remember.
 */

const HERE = dirname(fileURLToPath(import.meta.url))
const TOKENS_CSS = join(HERE, '..', '..', '..', 'design-system', 'tokens.css')

/**
 * Declarations from the `:root` blocks, and ONLY those.
 *
 * `tokens.css` also carries `.dark`, `:root[data-density="compact"]` and an
 * `@theme inline` block. Every one of them redefines names that appear here --
 * `--background` has a different value under `.dark` -- so a parser that took the last
 * definition wins would silently assert the email palette against the dark theme and
 * pass, which is precisely the bug this file exists to prevent.
 *
 * The pattern is anchored on the selector and nothing else. An earlier version required
 * the block to be preceded by `}` or the start of the file, which matched NOTHING: both
 * `:root` blocks in tokens.css are introduced by a `/* ... *\/` banner comment, so the
 * character before them is `/`. Every assertion below failed at once, which is the good
 * version of that mistake -- but it is exactly what the "parsed both blocks" test is here
 * to catch if it happens again more subtly.
 *
 * `[^{}]*` restricts the match to unnested blocks. `:root[data-density="compact"]` and
 * `.dark` cannot match because `\s*\{` has to follow `:root` immediately, and
 * `@theme inline` has no `:root` in its selector at all.
 */
function rootDeclarations(css: string): Map<string, string> {
  const declarations = new Map<string, string>()
  for (const block of css.matchAll(/:root\s*\{([^{}]*)\}/g)) {
    const body = block[1]
    if (body === undefined) continue
    for (const decl of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+)/g)) {
      const [, name, value] = decl
      if (name !== undefined && value !== undefined) declarations.set(name, value.trim())
    }
  }
  return declarations
}

/**
 * Follows `--background: var(--neutral-50)` down to `#F7F6F5`.
 *
 * Depth-capped rather than cycle-detected: a cycle in a generated token file is a
 * different bug from the one being tested, and "stopped after 10 hops" is a clearer
 * failure than a stack overflow.
 */
function resolve(name: string, declarations: Map<string, string>, depth = 0): string {
  if (depth > 10) throw new Error(`${name} did not resolve to a literal within 10 hops`)
  const value = declarations.get(name)
  if (value === undefined) {
    throw new Error(
      `${name} is not declared in a :root block of design-system/tokens.css. ` +
        'Either the token was renamed, or TOKEN_SOURCE in theme.ts names one that ' +
        'never existed.',
    )
  }
  const indirect = /^var\(\s*(--[\w-]+)\s*\)$/.exec(value)
  return indirect?.[1] === undefined ? value : resolve(indirect[1], declarations, depth + 1)
}

const declarations = rootDeclarations(readFileSync(TOKENS_CSS, 'utf8'))

describe('the email palette matches design-system/tokens.css', () => {
  /**
   * A parser that matched nothing would make every assertion below vacuous -- each one
   * would throw on a missing token, so in practice they would fail loudly rather than
   * silently pass. This exists for the subtler version: a pattern that still matches the
   * primitives but has stopped matching the semantic block, which would leave the
   * `--logo-*` assertions passing while `--foreground` broke.
   */
  it('parsed both :root blocks, primitives and semantics', () => {
    expect(declarations.has('--neutral-900'), 'the primitives block was not parsed').toBe(true)
    expect(declarations.has('--foreground'), 'the semantic block was not parsed').toBe(true)
    expect(declarations.has('--radius'), 'the semantic block was parsed only partially').toBe(true)
  })

  /**
   * `.dark` must not leak in. Under it `--foreground` is `var(--neutral-100)` (#EEECEA);
   * in `:root` it is `var(--neutral-900)` (#474441). Asserting the light value proves the
   * selector filter works, and it is the one assertion here that would go green if the
   * parser got sloppier.
   */
  it('reads the light theme, not .dark', () => {
    expect(resolve('--foreground', declarations)).toBe('#474441')
  })

  for (const key of Object.keys(TOKEN_SOURCE) as ThemeColour[]) {
    const token = TOKEN_SOURCE[key]
    it(`COLOUR.${key} still equals ${token}`, () => {
      expect(
        COLOUR[key].toUpperCase(),
        `COLOUR.${key} in packages/email/src/theme.ts is stale. ${token} is now ` +
          `${resolve(token, declarations)}. Update the literal, and check the ` +
          'contrast pair it belongs to in design-system/tokens-reference.html.',
      ).toBe(resolve(token, declarations).toUpperCase())
    })
  }
})
