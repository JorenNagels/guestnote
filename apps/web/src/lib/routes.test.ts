import { existsSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { app } from './routes.ts'

/**
 * Every href `app` can build has a page behind it.
 *
 * `lib/routes.ts` is the only place a dashboard path is written, and `typedRoutes` is off, so
 * the compiler cannot say "this link goes nowhere". This is the compensation: it walks each
 * builder's output down `app/pro/(app)` and `(public)` the way the router would -- a static
 * directory first, a `[param]` directory otherwise -- and fails when nothing answers. The case
 * it exists for is a slice deleting its stub and not yet having written the replacement, or a
 * builder renamed in one place.
 *
 * The router's own rule is what makes the order matter: `weddings/new` beside `weddings/[id]`
 * only resolves because a static segment beats a dynamic one, and this walk encodes the same
 * precedence, so `weddingNew()` is checked against `new/` and not against `[id]`.
 */
const PRO = fileURLToPath(new URL('../app/pro/', import.meta.url))

function resolve(group: string, segments: string[]): boolean {
  let dir = `${PRO}${group}`
  for (const segment of segments) {
    const entries = readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory())
    const literal = entries.find((e) => e.name === segment)
    const dynamic = entries.find((e) => /^\[[^\]]+\]$/.test(e.name))
    const next = literal ?? dynamic
    if (!next) return false
    dir = `${dir}/${next.name}`
  }
  return existsSync(`${dir}/page.tsx`)
}

describe('every dashboard href has a page', () => {
  const builders = Object.entries(app) as [string, (...args: string[]) => string][]

  it('actually walked the builders', () => {
    // A canary in the spirit of `no-unsafe-imports.test.ts`: an empty table passes forever.
    expect(builders.length).toBeGreaterThan(20)
  })

  for (const [name, build] of builders) {
    it(`app.${name}()`, () => {
      const href = build('id-1', 'id-2')
      const path = href.split('?')[0] ?? ''
      const segments = path.split('/').filter((s) => s.length > 0)
      const found = resolve('(app)', segments) || resolve('(public)', segments)
      expect(found, `no page.tsx answers ${href} under app/pro`).toBe(true)
    })
  }
})
