/**
 * Writes the .dc.html artboards and canvas.json for the planner-app design canvas.
 *
 *   node build.mjs            -- write the artboards
 *   node build.mjs --measure  -- also re-measure every artboard in headless Chromium
 *                                and write the measured frame heights into canvas.json
 *
 * The measure pass exists because a canvas frame CLIPS rather than scales: an
 * artboard one row taller than its frame loses the row silently. Guessing the
 * heights was wrong twice, so they are read off a real layout instead.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { Anatomy, Main, WeddingOverview } from './boards-layout.mjs'
import { BASE, TOKENS, sidebar } from './lib.mjs'
import { LOTTE } from './boards-layout.mjs'
import { Checklist, CouplePortal, TaskDetail, Templates } from './boards-ph1.mjs'
import { Budget, Files, Payments, RunSheet, RunSheetPhone, Vendors } from './boards-ph2.mjs'
import { Moodboard, Team, VendorSlice } from './boards-ph3.mjs'

const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'

/** file stem -> [builder, frame width, canvas page, cosmetic title] */
const BOARDS = [
  ['Anatomy', Anatomy, 1440, 'page-1', 'Layout · anatomie'],
  ['Main', Main, 1440, 'page-1', 'Vandaag · P16'],
  ['WeddingOverview', WeddingOverview, 1440, 'page-1', 'Bruiloft · overzicht'],

  ['Checklist', Checklist, 1440, 'page-2', 'Taken · P6 + P8'],
  ['TaskDetail', TaskDetail, 560, 'page-2', 'Taak en reacties · P4'],
  ['Templates', Templates, 1440, 'page-2', 'Sjablonen · P9 + P17'],
  ['CouplePortal', CouplePortal, 1440, 'page-2', 'Koppelportaal · P7'],

  ['Budget', Budget, 1440, 'page-3', 'Budget · P11'],
  ['Payments', Payments, 1440, 'page-3', 'Betalingen · P12'],
  ['Vendors', Vendors, 1440, 'page-3', 'Leveranciers · P13'],
  ['RunSheet', RunSheet, 1440, 'page-3', 'Draaiboek · P14'],
  ['RunSheetPhone', RunSheetPhone, 390, 'page-3', 'Draaiboek op de dag · P14'],
  ['Files', Files, 1440, 'page-3', 'Bestanden · P15'],

  ['Moodboard', Moodboard, 1440, 'page-4', 'Moodboard · P21'],
  ['VendorSlice', VendorSlice, 900, 'page-4', 'Leverancierslink · P18'],
  ['Team', Team, 1440, 'page-4', 'Team en zitjes · P20'],
]

const PAGES = [
  { id: 'page-1', name: 'Layout' },
  { id: 'page-2', name: 'Taken, sjablonen, koppel' },
  { id: 'page-3', name: 'PH2 — dagelijkse motor' },
  { id: 'page-4', name: 'PH3 — plakkracht' },
]

/* ---------- write ---------------------------------------------------------- */

const files = []
for (const [stem, build] of BOARDS) {
  const html = build()
  writeFileSync(`${stem}.dc.html`, html)
  files.push([stem, html])
}

/* ---------- measure -------------------------------------------------------- */

/**
 * Strip the Design Component wrapper so a plain browser lays the artboard out,
 * then read documentElement.scrollHeight back out through the title.
 */
function measure(stem, html) {
  const probe = html
    .replace('<script src="./support.js"></script>', '')
    .replace('<x-dc>', '')
    .replace('</x-dc>', '')
    .replace('<helmet>', '')
    .replace('</helmet>', '')
    .replace('</body>', '<script>document.title="H:"+document.documentElement.scrollHeight</script></body>')
  const dir = join(tmpdir(), 'gn-canvas-measure')
  mkdirSync(dir, { recursive: true })
  const path = join(dir, `${stem}.html`)
  writeFileSync(path, probe)
  const out = execFileSync(CHROME, [
    '--headless', '--no-sandbox', '--disable-gpu', '--hide-scrollbars',
    '--window-size=1600,200', '--virtual-time-budget=4000',
    '--dump-dom', `file://${path}`,
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 })
  const m = out.match(/<title>H:(\d+)<\/title>/)
  if (!m) throw new Error(`could not measure ${stem}`)
  return Number(m[1])
}

/**
 * The sidebar on its own, which no artboard is: the note on page 1 quotes this
 * number, and a quoted measurement has to come from a pass that measured that
 * thing. It was a hand sum first, and the hand sum was 125px out.
 */
function measureSidebar() {
  const html = `<!doctype html><html lang="nl"><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap">
<style>${TOKENS}${BASE}</style></head><body>
<div id="probe" style="display:flex;align-items:flex-start;">${sidebar({ wedding: LOTTE, weddingActive: 'Taken' })}</div>
<script>document.title="H:"+document.querySelector('#probe aside > div').scrollHeight</script>
</body></html>`
  return measure('_sidebar', html)
}

let heights = {}
try {
  heights = JSON.parse(readFileSync('heights.json', 'utf8'))
} catch {}
const SIDEBAR_H = heights._sidebar ?? 775

if (process.argv.includes('--measure')) {
  for (const [stem, html] of files) {
    heights[stem] = measure(stem, html)
    process.stderr.write(`${stem}: ${heights[stem]}px\n`)
  }
  heights._sidebar = measureSidebar()
  process.stderr.write(`_sidebar: ${heights._sidebar}px\n`)
  writeFileSync('heights.json', `${JSON.stringify(heights, null, 2)}\n`)
}

const ANNOTATIONS = [
  {
    id: 'note-shell', page: 'page-1', x: 0, y: -230, w: 420,
    text: 'Wat hier NIEUW is tegenover shell.tsx vandaag:\n\n· Vandaag (P16) staat in de navigatie, en / stopt met doorverwijzen naar /weddings\n· de bruiloftsectie heeft acht rijen in plaats van één\n· Sjablonen en Team staan globaal, niet per bruiloft\n\nWat NIET verandert: geen --sidebar-* tokengroep. De zijbalk blijft staan op --background met --border ernaast, --muted voor de actieve rij en --foreground voor de tekst — precies zoals spec 0001 besloot — die groep vraagt een contrastpas die dit werk niet doet.',
  },
  {
    id: 'note-height', page: 'page-1', x: 460, y: -230, w: 400,
    text: `Gemeten, niet geschat: ${SIDEBAR_H}px voor de zijbalk met acht bruiloftsecties (build.mjs --measure, headless Chromium, Inter geladen).\n\nDat past op 900px en niet op de ~740px van een 13-inch laptop. Er is geen scrollgebied in de zijbalk, dus wat wegvalt is het account en de inklapknop — de twee dingen die altijd bereikbaar horen te zijn. Kop en account vastzetten, middenstuk laten scrollen.`,
  },
  {
    id: 'note-badge', page: 'page-1', x: 1560, y: -230, w: 400,
    text: 'Het telletje op Taken is een VOORSTEL, geen bestaand gedrag.\n\nSpec 0001 liet het badge op Bruiloften bewust weg: voor een `member` kost dat één transactie per toegewezen bruiloft, op elke paginarender. Binnen één bruiloft is het één aggregaat — maar dat is geredeneerd, niet gemeten. Meten voordat het gebouwd wordt.',
  },
  {
    id: 'note-internal', page: 'page-2', x: 0, y: -250, w: 430,
    text: 'De interne grens staat er twee keer op: getinte rij ÉN slotchip met het woord "Intern".\n\nNooit kleur alleen. Deze schermen worden zwart-wit afgedrukt voor de zaal, en principe 4 zegt dat die grens altijd zichtbaar moet zijn, nooit af te leiden.\n\nDe reacties erven de zichtbaarheid van de taak via een databasetrigger, niet via applicatiecode — daarom durft het paneel te beloven dat ze meegaan.',
  },
  {
    id: 'note-couple', page: 'page-2', x: 3800, y: -250, w: 420,
    text: 'PRODUCT.md laat open of het koppel dezelfde UI uitgekleed krijgt of een aparte surface. Dit is de goedkope kant, getekend zodat de keuze te beoordelen valt.\n\nHet belangrijkste aan dit scherm is wat er NIET staat: geen spoor van de vier interne taken. Geen telling, geen grijze rij, geen "3 verborgen". Een hint dat er iets verborgen is, is zelf het lek.',
  },
  {
    id: 'note-print', page: 'page-3', x: 4680, y: -250, w: 420,
    text: 'Het draaiboek is ontworpen om een zwart-witte A4 te overleven: de wie-kolom is een naam plus een rolwoord, de blokken zijn toon en geen kleur, en elk bedrag is rechts uitgelijnd met tabular-nums (td.num is een baselaagregel in tokens.css, geen keuze per scherm).\n\nOp de telefoon: geen nagemaakte statusbalk, elk tikdoel ≥44px. Dit is het enige scherm dat offline moet werken.',
  },
  {
    id: 'note-mood', page: 'page-4', x: 0, y: -210, w: 400,
    text: 'De moodboardtegels zijn placeholders. Er zit geen beeldmateriaal in deze repo, en een stockfoto zou een visuele richting suggereren die niemand gekozen heeft.\n\nDe reactierail rechts is de eigenlijke feature: die haalt de feedback van het koppel weg uit de groepschat.',
  },
]

/* ---------- lay out -------------------------------------------------------- */

const GAP = 120
const artboards = []
const cursor = Object.fromEntries(PAGES.map((p) => [p.id, 0]))

for (const [stem, , w, pageId, title] of BOARDS) {
  // Measured height, plus 24px so a rounded-up font metric can never clip a
  // last row. A surplus frame just paints the artboard's own background.
  const h = (heights[stem] ?? 1000) + 24
  artboards.push({ file: `${stem}.dc.html`, x: cursor[pageId], y: 0, w, h, page: pageId, title })
  cursor[pageId] += w + GAP
}

writeFileSync('canvas.json', `${JSON.stringify({
  artboards,
  annotations: ANNOTATIONS,
  pages: PAGES,
  launch: { view: 'canvas', page: 'page-1' },
}, null, 2)}\n`)

process.stderr.write(`wrote ${files.length} artboards + canvas.json\n`)
