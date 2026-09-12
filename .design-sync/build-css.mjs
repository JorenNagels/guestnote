/**
 * Compile a real stylesheet for packages/ui, for the design-sync bundle.
 *
 * The package ships no CSS: every component is Tailwind utility class strings plus the
 * `--gn-*` slots documented in packages/ui/src/slots.ts, and the actual CSS only exists
 * once Tailwind has scanned the sources. So a sync that pointed `cssEntry` at
 * design-system/tokens.css would ship the tokens and none of the utilities, and every
 * preview card -- and every design the claude.ai/design agent later builds -- would render
 * as browser-default text with correct colours nowhere.
 *
 * This mirrors apps/web/src/app/globals.css exactly: the same `source(none)` + explicit
 * `@source` discipline, for the same reason its comment gives (Tailwind's automatic base
 * is the CWD, so the generated CSS would otherwise depend on where the command was run).
 * The one difference is scope -- only packages/ui, because that is what the sync ships.
 *
 * Output is gitignored: it is derived, and regenerating it is one command.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'

const ROOT = resolve(import.meta.dirname, '..')
const OUT = resolve(ROOT, 'packages/ui/.ds-preview.css')

// The entry lives at the repo root so its relative @import/@source paths read plainly.
// Written and removed rather than committed: it is three lines of derived config, and a
// committed copy is a second place for the @source set to drift from globals.css.
const ENTRY = resolve(ROOT, '.ds-preview-entry.css')
writeFileSync(ENTRY, [
  '@import "tailwindcss" source(none);',
  '@import "./design-system/tokens.css";',
  '@source "./packages/ui/src/**/*.tsx";',
  '',
].join('\n'))

try {
  const css = await postcss([tailwind()]).process(
    // biome-ignore lint: reading the file we just wrote would be a second round trip
    await import('node:fs/promises').then((fs) => fs.readFile(ENTRY, 'utf8')),
    { from: ENTRY, to: OUT },
  )
  mkdirSync(dirname(OUT), { recursive: true })
  writeFileSync(OUT, css.css)
  process.stderr.write(`wrote ${OUT} (${(css.css.length / 1024).toFixed(1)} kB)\n`)
} finally {
  rmSync(ENTRY, { force: true })
}
