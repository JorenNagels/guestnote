/**
 * Export every artboard as an SVG that Figma will import as editable layers.
 *
 * Why the detour through PDF: there is no "save as SVG" in a browser, and the usual
 * DOM-to-SVG trick wraps the markup in <foreignObject>, which Figma does not parse at
 * all -- you get one flat unusable rectangle. Chromium's own print path emits real
 * vector PDF (paths, text runs, embedded fonts); PyMuPDF then rewrites that as SVG.
 *
 * Text stays TEXT rather than being flattened to outlines, so the layers are editable
 * on the other side. The cost, stated: Figma re-lays-out each text run in whatever font
 * it resolves, so if Inter is not available in the target Figma file the metrics shift.
 * Inter is a Figma default, so this is normally fine -- but it is why the PNGs beside
 * these are the pixel-accurate reference and the SVGs are the editable one.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { chromium } from '/home/user/guestnote/.ds-sync/node_modules/playwright/index.mjs'

const DIR = import.meta.dirname
const OUT = resolve(DIR, '_export/figma')
mkdirSync(OUT, { recursive: true })

const canvas = JSON.parse(readFileSync(join(DIR, 'canvas.json'), 'utf8'))
const unwrap = (html) => html
  .replace('<script src="./support.js"></script>', '')
  .replace('<x-dc>', '').replace('</x-dc>', '')
  .replace('<helmet>', '').replace('</helmet>', '')

const proxy = process.env.HTTPS_PROXY || process.env.https_proxy
const browser = await chromium.launch(proxy ? { proxy: { server: proxy } } : {})

const made = []
const sizes = {}
for (const [i, ab] of canvas.artboards.entries()) {
  const stem = ab.file.replace('.dc.html', '')
  const probe = join(OUT, `.${stem}.html`)
  writeFileSync(probe, unwrap(readFileSync(join(DIR, ab.file), 'utf8')))

  const page = await browser.newPage({ viewport: { width: ab.w, height: Math.min(ab.h, 2000) } })
  await page.goto(`file://${probe}`, { waitUntil: 'load' })
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(300)

  // One page exactly the artboard's size: no margins, no pagination, backgrounds on.
  const pdf = join(OUT, `.${stem}.pdf`)
  await page.pdf({
    path: pdf,
    width: `${ab.w}px`,
    height: `${ab.h}px`,
    printBackground: true,
    margin: { top: '0', right: '0', bottom: '0', left: '0' },
    pageRanges: '1',
  })
  await page.close()
  const key = `${String(i + 1).padStart(2, '0')}-${stem}`
  made.push([key, pdf])
  sizes[key] = [ab.w, ab.h]
  process.stderr.write(`${stem} `)
}
await browser.close()
process.stderr.write('\n')

writeFileSync(join(OUT, '.manifest.json'), JSON.stringify(made))
writeFileSync(join(OUT, '.sizes.json'), JSON.stringify(sizes))
execFileSync('python3', [join(DIR, 'to-svg.py'), OUT], { stdio: 'inherit' })
