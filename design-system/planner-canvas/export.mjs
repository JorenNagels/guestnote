/**
 * Render every artboard to PNG, then assemble one PDF.
 *
 * The .dc.html files are Design Component sources: the canvas editor swaps
 * `<script src="./support.js">` for an inline runtime and unwraps `<x-dc>` / `<helmet>`
 * at render time. Outside the canvas nothing does that, so this strips the wrapper the
 * same way build.mjs's measure pass does -- the markup underneath is ordinary HTML.
 *
 * Chromium gets an explicit proxy: it does not honour HTTPS_PROXY from the environment
 * the way curl does, and without it every artboard silently falls back from Inter to
 * system-ui -- which changes the metrics these boards were sized against.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { chromium } from '/home/user/guestnote/.ds-sync/node_modules/playwright/index.mjs'

const DIR = import.meta.dirname
const OUT = resolve(DIR, '_export')
mkdirSync(OUT, { recursive: true })

const canvas = JSON.parse(readFileSync(join(DIR, 'canvas.json'), 'utf8'))
const pageName = Object.fromEntries(canvas.pages.map((p) => [p.id, p.name]))

const unwrap = (html) => html
  .replace('<script src="./support.js"></script>', '')
  .replace('<x-dc>', '').replace('</x-dc>', '')
  .replace('<helmet>', '').replace('</helmet>', '')

const proxy = process.env.HTTPS_PROXY || process.env.https_proxy
const browser = await chromium.launch(proxy ? { proxy: { server: proxy } } : {})

const rendered = []
for (const [i, ab] of canvas.artboards.entries()) {
  const stem = ab.file.replace('.dc.html', '')
  const probe = join(OUT, `.${stem}.html`)
  writeFileSync(probe, unwrap(readFileSync(join(DIR, ab.file), 'utf8')))

  const page = await browser.newPage({
    viewport: { width: ab.w, height: Math.min(ab.h, 2000) },
    deviceScaleFactor: 2,
  })
  await page.goto(`file://${probe}`, { waitUntil: 'load' })
  // Inter arrives over the network; without this the shot can be taken mid-swap and
  // half the board renders in the fallback face.
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(400)

  const png = join(OUT, `${String(i + 1).padStart(2, '0')}-${stem}.png`)
  await page.screenshot({ path: png, fullPage: true })
  await page.close()

  const usedInter = await (async () => {
    const p = await browser.newPage()
    await p.goto(`file://${probe}`, { waitUntil: 'load' })
    const ok = await p.evaluate(async () => {
      await document.fonts.ready
      return document.fonts.check('14px Inter')
    })
    await p.close()
    return ok
  })()

  rendered.push({ png, title: ab.title ?? stem, page: pageName[ab.page ?? 'page-1'], usedInter })
  process.stderr.write(`${stem}: ${ab.w}×${ab.h}${usedInter ? '' : '  [no Inter]'}\n`)
}
await browser.close()

writeFileSync(join(OUT, 'index.json'), `${JSON.stringify(rendered, null, 2)}\n`)
process.stderr.write(`\n${rendered.length} PNGs → ${OUT}\n`)
process.stderr.write(`Inter loaded on ${rendered.filter((r) => r.usedInter).length}/${rendered.length}\n`)

// One PDF, one page per artboard at its natural size (96 px/inch), built from the
// 2x shots downscaled back to CSS pixels so the file stays a sane size.
execFileSync('python3', [join(DIR, 'to-pdf.py'), OUT], { stdio: 'inherit' })
