import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * The trial lock's coverage (spec 0005, "Trial"): every exported Server Function under
 * `app/pro/(app)/` calls `assertWritable` first, or is named below as one that must stay
 * writable after a trial ends.
 *
 * The lock is one server-side guard, not RLS, so it is exactly as good as the list of places
 * that call it -- and a new action file is written by someone thinking about their feature, not
 * about billing. This test is what makes a forgotten call visible: add a `'use server'` module
 * and it fails until each export either calls the guard or is argued into the allowlist.
 *
 * Read as source, not imported: importing forty Server Functions would need a mock for every
 * dependency they have, and the question is a property of the text ("is the call there, first").
 * The cost, stated: a guard hidden behind a helper is invisible to this, so the rule is that the
 * call is written in the function itself.
 */

const HERE = dirname(fileURLToPath(import.meta.url))
const APP = join(HERE, '(app)')

/**
 * Must stay writable, or reads that happen to be Server Functions. Keyed by path under
 * `app/pro/(app)/`. Spec 0005: "The Billing screen, sign-out and 'Report a problem' stay
 * writable."
 */
const ALLOWLIST: Record<string, readonly string[]> = {
  // Sign-out, the org switcher, theme/density/nav preferences (cookies, not studio data), and
  // the palette's wedding list, which is a read.
  'actions.ts': [
    'signOut',
    'switchOrg',
    'setTheme',
    'setDensity',
    'setNavCollapsed',
    'paletteWeddings',
  ],
  // A planner locked out must still be able to tell us something is wrong.
  'report/actions.ts': ['sendReport'],
  // The way out of the lock.
  'billing/actions.ts': ['startCheckoutAction', 'openPortalAction', 'saveInvoiceDetailsAction'],
  // A presigned GET: reading a file the planner already has.
  'weddings/[id]/files/actions.ts': ['downloadFile'],
}

const GUARD = 'await assertWritable('

function serverModules(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name)
    if (e.isDirectory()) return serverModules(p)
    if (!/\.tsx?$/.test(e.name) || /\.test\.tsx?$/.test(e.name)) return []
    return readFileSync(p, 'utf8').startsWith("'use server'") ? [p] : []
  })
}

type Fn = { name: string; body: string }

/**
 * Each `export async function`, with the text of its body: from the `{` that ends its signature
 * (the first line that is either the export line itself with balanced parentheses, or a line
 * starting at column 0 with `)` or `}` -- Biome's layout for a wrapped signature) to the next
 * top-level `}`.
 */
function exportedFunctions(source: string): Fn[] {
  const lines = source.split('\n')
  const out: Fn[] = []
  for (let i = 0; i < lines.length; i++) {
    const m = /^export async function (\w+)\(/.exec(lines[i] ?? '')
    if (!m?.[1]) continue
    let j = i
    const opens = (l: string) => l.split('(').length - l.split(')').length
    while (j < lines.length) {
      const l = lines[j] ?? ''
      const endsSignature =
        l.endsWith('{') && (j === i ? opens(l) === 0 : l.startsWith(')') || l.startsWith('}'))
      if (endsSignature) break
      j++
    }
    let k = j + 1
    while (k < lines.length && lines[k] !== '}') k++
    out.push({ name: m[1], body: lines.slice(j + 1, k).join('\n') })
  }
  return out
}

const modules = serverModules(APP).map((p) => {
  const key = relative(APP, p)
  return { key, fns: exportedFunctions(readFileSync(p, 'utf8')) }
})

describe('the trial guard covers every staff write under app/pro/(app)', () => {
  it('finds the Server Functions at all (the canary)', () => {
    // A walker that finds nothing passes the assertion below forever.
    expect(modules.length).toBeGreaterThan(10)
    expect(modules.flatMap((m) => m.fns).length).toBeGreaterThan(40)
  })

  it('calls assertWritable first in every exported function not on the allowlist', () => {
    const missing = modules.flatMap(({ key, fns }) =>
      fns
        .filter((f) => !(ALLOWLIST[key] ?? []).includes(f.name))
        .filter((f) => !f.body.trimStart().startsWith(GUARD))
        .map((f) => `${key}: ${f.name}`),
    )
    expect(
      missing,
      'These Server Functions write without the trial guard. Make ' +
        '`await assertWritable(await currentOrgId())` their first statement (lib/trial.ts), or ' +
        'add them to ALLOWLIST here with the reason they must stay writable after a trial ends:\n  ' +
        missing.join('\n  '),
    ).toEqual([])
  })

  it('has no stale allowlist entries', () => {
    // An entry naming a function that no longer exists would silently excuse its replacement.
    const stale = Object.entries(ALLOWLIST).flatMap(([key, names]) => {
      const found = modules.find((m) => m.key === key)?.fns.map((f) => f.name) ?? []
      return names.filter((n) => !found.includes(n)).map((n) => `${key}: ${n}`)
    })
    expect(stale).toEqual([])
  })

  it('does not guard the allowlisted ones either, so the list says what the code does', () => {
    const guarded = Object.entries(ALLOWLIST).flatMap(([key, names]) =>
      (modules.find((m) => m.key === key)?.fns ?? [])
        .filter((f) => names.includes(f.name) && f.body.includes('assertWritable'))
        .map((f) => `${key}: ${f.name}`),
    )
    expect(guarded).toEqual([])
  })
})
