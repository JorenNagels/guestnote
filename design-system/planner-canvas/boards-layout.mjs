import {
  avatar, btn, card, chip, column, icon, isLate, kbd, monogram, outlinePill, page,
  pageHead, segmented, shell, shortNL, sidebar, WEDDING_SECTIONS,
} from './lib.mjs'

export const LOTTE = { name: 'Lotte & Bram', date: '12 juni 2027' }

/* ========================================================================== *
 * Main.dc.html -- "Vandaag", item P16.
 *
 * The one screen research/09 calls "the single most valuable screen in the app" and the
 * reason a planner opens it daily rather than weekly. It is also the screen
 * docs/specs/0001 deliberately did NOT put in the nav yet: "putting a Vandaag item
 * in the nav before it exists would be a nav item that highlights the wrong thing."
 * This is what it looks like once it does exist, and `/` stops redirecting.
 * ========================================================================== */

const TODAY_ROWS = {
  laat: [
    ['Definitieve gastenlijst opvragen', 'Marie & Tom', 'Koppel', '2026-09-05'],
    ['Gastenlijst van Brams kant compleet maken', 'Lotte & Bram', 'Bram Willems', '2026-09-05'],
    ['Traiteur: menukeuze doorgeven', 'Marie & Tom', 'Joren Nagels', '2026-09-08'],
    ['Saldo fotograaf overmaken', 'Hanne & Seppe', 'Joren Nagels', '2026-09-10'],
    ['Vervoer gasten naar feestzaal bevestigen', 'Marie & Tom', 'Sofie Claes', '2026-09-11'],
  ],
  week: [
    ['Proefdiner inplannen bij de traiteur', 'Lotte & Bram', 'Joren Nagels', '2026-09-13'],
    ['Marge nakijken op offerte bloemist', 'Lotte & Bram', 'Joren Nagels', '2026-09-14', true],
    ['Save-the-date versturen', 'Fien & Wout', 'Koppel', '2026-09-15'],
    ['Bloemist tweede offerte opvragen', 'Lotte & Bram', 'Joren Nagels', '2026-09-16'],
    ['Ceremoniemeester briefen', 'Marie & Tom', 'Sofie Claes', '2026-09-16'],
    ['Openstaande factuur DJ opvolgen', 'Hanne & Seppe', 'Joren Nagels', '2026-09-17', true],
    ['Muziekwensen doorgeven', 'Lotte & Bram', 'Lotte Peeters', '2026-09-18'],
    ['Kappersproef bevestigen', 'Amina & Youssef', 'Koppel', '2026-09-18'],
  ],
  volgende: [
    ['Zaalindeling doorgeven aan Kasteel van Brasschaat', 'Lotte & Bram', 'Joren Nagels', '2026-09-21'],
    ['Aantal nachten hotelblok vastleggen', 'Fien & Wout', 'Sofie Claes', '2026-09-23'],
    ['Contract DJ ondertekend terugvragen', 'Amina & Youssef', 'Joren Nagels', '2026-09-25'],
  ],
}

const GRID = 'display:grid;grid-template-columns:26px minmax(0,1fr) 190px 168px 104px;align-items:center;gap:0 12px;'

function checkbox(done = false) {
  return `<span aria-hidden="true" style="display:grid;place-items:center;width:17px;height:17px;border-radius:5px;border:1px solid ${done ? 'var(--primary)' : 'var(--input)'};background:${done ? 'var(--primary)' : 'transparent'};color:var(--primary-foreground);">${done ? icon('check', 12, { stroke: 2.5 }) : ''}</span>`
}

function todayRow([title, wedding, who, due, internal = false]) {
  const late = isLate(due)
  return `<div style="${GRID}height:var(--row-h);padding:0 var(--cell-x);border-top:1px solid var(--border);${internal ? 'background:var(--muted);' : ''}">
    ${checkbox()}
    <span style="display:flex;align-items:center;gap:8px;min-width:0;">
      <span class="trunc" style="font-size:14px;">${title}</span>
      ${internal ? chip('Intern', 'plusone', { icon: 'lock' }) : ''}
    </span>
    <span class="trunc" style="display:flex;align-items:center;gap:7px;font-size:13px;color:var(--muted-foreground);">${icon('weddings', 14)}<span class="trunc">${wedding}</span></span>
    <span style="display:flex;align-items:center;gap:7px;min-width:0;">${avatar(who, 20)}<span class="trunc" style="font-size:13px;color:var(--muted-foreground);">${who}</span></span>
    <span class="num" style="font-size:13px;${late ? 'color:var(--st-alert-fg);font-weight:500;' : 'color:var(--muted-foreground);'}">${shortNL(due)}</span>
  </div>`
}

function groupHead(label, count, note = '') {
  return `<div style="display:flex;align-items:baseline;gap:10px;padding:0 var(--cell-x) 8px;">
    <h2 style="margin:0;font-size:14px;font-weight:600;">${label}</h2>
    <span style="font-size:13px;font-variant-numeric:tabular-nums;color:var(--muted-foreground);">${count}</span>
    ${note ? `<span style="font-size:13px;color:var(--muted-foreground);">${note}</span>` : ''}
  </div>`
}

export function Main() {
  const head = `<div style="${GRID}height:32px;padding:0 var(--cell-x);">
      <span></span>
      <span class="eyebrow">Taak</span>
      <span class="eyebrow">Bruiloft</span>
      <span class="eyebrow">Toegewezen aan</span>
      <span class="eyebrow num">Vervalt</span>
    </div>`

  const body = `
  ${pageHead('Vandaag', {
    sub: 'zaterdag 12 september · 5 actieve bruiloften · 5 taken te laat',
    right: `${segmented(['Alles', 'Aan mij', 'Aan het koppel'], 0)}${btn('Intern tonen', { icon: 'eye' })}`,
  })}

  <div style="margin-top:28px;display:flex;flex-direction:column;gap:24px;">
    <section>
      ${groupHead('Te laat', '5', '· de oudste staat 7 dagen open')}
      ${card(`<div>${head}${TODAY_ROWS.laat.map(todayRow).join('')}</div>`)}
    </section>

    <section>
      ${groupHead('Deze week', '8')}
      ${card(`<div>${TODAY_ROWS.week.map(todayRow).join('')}</div>`)}
    </section>

    <section>
      ${groupHead('Volgende week', '7')}
      ${card(`<div>${TODAY_ROWS.volgende.map(todayRow).join('')}</div>
        <div style="border-top:1px solid var(--border);padding:10px var(--cell-x);">
          <span style="font-size:13px;color:var(--muted-foreground);">Nog 4 taken volgende week</span>
        </div>`)}
    </section>
  </div>`

  return shell({ active: 'today' }, body, { w: 1440, h: 980, max: 1152 })
}

/* ========================================================================== *
 * WeddingOverview.dc.html -- the wedding hub, once the sections below it exist.
 * ========================================================================== */

function statCard(label, value, sub, tone = null) {
  return card(`<div style="padding:14px 16px;">
    <p class="eyebrow" style="margin:0;">${label}</p>
    <p style="margin:8px 0 0;font-size:20px;line-height:1.2;font-weight:600;font-variant-numeric:tabular-nums;">${value}</p>
    <p style="margin:6px 0 0;font-size:13px;color:${tone === 'alert' ? 'var(--st-alert-fg)' : 'var(--muted-foreground)'};">${sub}</p>
  </div>`)
}

function miniRow(title, who, due, { internal = false, late = false } = {}) {
  return `<div style="display:flex;align-items:center;gap:10px;height:var(--row-h);padding:0 var(--cell-x);border-top:1px solid var(--border);${internal ? 'background:var(--muted);' : ''}">
    ${checkbox()}
    <span class="trunc" style="flex:1 1 auto;font-size:14px;">${title}</span>
    ${internal ? chip('Intern', 'plusone', { icon: 'lock' }) : ''}
    ${avatar(who, 20)}
    <span class="num" style="flex:0 0 76px;font-size:13px;${late ? 'color:var(--st-alert-fg);font-weight:500;' : 'color:var(--muted-foreground);'}">${due}</span>
  </div>`
}

function personRow(name, role, note) {
  return `<div style="display:flex;align-items:center;gap:10px;padding:9px 14px;border-top:1px solid var(--border);">
    ${avatar(name, 24)}
    <span style="flex:1 1 auto;min-width:0;">
      <span class="trunc" style="display:block;font-size:13px;font-weight:500;">${name}</span>
      <span class="trunc" style="display:block;font-size:12px;color:var(--muted-foreground);">${note}</span>
    </span>
    ${role}
  </div>`
}

export function WeddingOverview() {
  const body = `
  ${pageHead('Lotte &amp; Bram', {
    eyebrow: 'Deze bruiloft',
    sub: 'zaterdag 12 juni 2027 · Kasteel van Brasschaat · 120 gasten geraamd',
    right: `${outlinePill('Live', true)}${btn('Bruiloftsite', { icon: 'eye' })}${btn('Taak', { icon: 'plus', variant: 'primary' })}`,
  })}

  <div style="margin-top:22px;display:flex;align-items:center;gap:12px;">
    <span style="font-size:13px;font-variant-numeric:tabular-nums;color:var(--muted-foreground);">Nog 273 dagen</span>
    <span style="flex:1 1 auto;height:4px;border-radius:999px;background:var(--muted);overflow:hidden;">
      <span style="display:block;width:40%;height:100%;background:var(--primary);"></span>
    </span>
    <span style="font-size:13px;color:var(--muted-foreground);">Geboekt in maart 2026</span>
  </div>

  <div style="margin-top:20px;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;">
    ${statCard('Taken', '12 open', '1 te laat · 3 liggen bij het koppel', 'alert')}
    ${statCard('Budget', '€ 25.200', 'vastgelegd van € 28.000 geraamd')}
    ${statCard('Betalingen', '€ 2.400', 'volgende schijf op 15 oktober')}
    ${statCard('Leveranciers', '6 van 9', 'bloemist, DJ en vervoer nog niet rond')}
  </div>

  <div style="margin-top:24px;display:grid;grid-template-columns:minmax(0,1fr) 312px;gap:20px;align-items:start;">
    <section>
      ${groupHead('Deze week op deze bruiloft', '4')}
      ${card(`<div>
        ${miniRow('Proefdiner inplannen bij de traiteur', 'Joren Nagels', shortNL('2026-09-13'))}
        ${miniRow('Marge nakijken op offerte bloemist', 'Joren Nagels', shortNL('2026-09-14'), { internal: true })}
        ${miniRow('Bloemist tweede offerte opvragen', 'Joren Nagels', shortNL('2026-09-16'))}
        ${miniRow('Muziekwensen doorgeven', 'Lotte Peeters', shortNL('2026-09-18'))}
      </div>`)}

      <div style="margin-top:24px;">
        ${groupHead('Draaiboek', '')}
        ${card(`<div style="padding:24px 16px;text-align:center;">
          <p style="margin:0;font-size:14px;font-weight:500;">Nog geen draaiboek voor deze dag</p>
          <p style="margin:6px auto 0;max-width:44ch;font-size:13px;line-height:1.55;color:var(--muted-foreground);">
            Een draaiboek bouwt zich op rond de ceremonie: geef het uur en Guestnote zet de blokken ervoor en erna klaar.</p>
          <div style="margin-top:14px;display:flex;justify-content:center;gap:8px;">${btn('Draaiboek starten', { variant: 'primary' })}${btn('Uit sjabloon')}</div>
        </div>`)}
      </div>
    </section>

    <div style="display:flex;flex-direction:column;gap:20px;">
      <section>
        ${groupHead('Team', '')}
        ${card(`<div>
          ${personRow('Joren Nagels', chip('Eigenaar', 'declined'), 'Studio Vero · org_members')}
          ${personRow('Sofie Claes', chip('Medewerker', 'declined'), 'Studio Vero · toegewezen')}
          ${personRow('Lotte Peeters', chip('Koppel', 'partial'), 'wedding_members · ziet gedeeld')}
          ${personRow('Bram Willems', chip('Koppel', 'partial'), 'wedding_members · ziet gedeeld')}
        </div>`)}
      </section>

      <section>
        ${groupHead('Zichtbaarheid', '')}
        ${card(`<div style="padding:14px;">
          <div style="display:flex;align-items:flex-start;gap:10px;">
            <span style="color:var(--st-plusone-fg);flex:0 0 auto;margin-top:1px;">${icon('lock', 16)}</span>
            <p style="margin:0;font-size:13px;line-height:1.55;color:var(--muted-foreground);">
              <strong style="color:var(--foreground);font-weight:500;">2 interne taken</strong> en 1 intern bestand
              op deze bruiloft. Lotte en Bram zien die niet, ook niet in de weekmail.</p>
          </div>
        </div>`)}
      </section>
    </div>
  </div>`

  return shell(
    { active: null, wedding: LOTTE, weddingActive: 'Overzicht' },
    body,
    { w: 1440, h: 1020, max: 1152 },
  )
}

/* ========================================================================== *
 * Anatomy.dc.html -- the shell's states and the primitives every other board
 * is built from. This is the "main layout" answer, taken apart.
 * ========================================================================== */

function frame(caption, note, inner, w) {
  return `<div style="flex:0 0 ${w}px;">
    <p style="margin:0 0 2px;font-size:13px;font-weight:600;">${caption}</p>
    <p style="margin:0 0 10px;font-size:12px;line-height:1.5;color:var(--muted-foreground);min-height:32px;">${note}</p>
    <div style="border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;background:var(--background);">${inner}</div>
  </div>`
}

function swatch(label, tone) {
  return `<div style="display:flex;flex-direction:column;gap:6px;align-items:flex-start;">
    ${chip(label, tone)}
    <code class="mono" style="font-size:11px;color:var(--muted-foreground);">--st-${tone}-*</code>
  </div>`
}

function densityTable(compact) {
  const rowH = compact ? 32 : 44
  const cellX = compact ? '0.55rem' : '0.8rem'
  const rows = [
    ['Locatie bevestigen', 'Joren Nagels', '12 mrt'],
    ['Traiteur vastleggen', 'Joren Nagels', '3 apr'],
    ['Uitnodigingen versturen', 'Koppel', '20 apr'],
    ['Tafelschikking afronden', 'Koppel', '28 mei'],
  ]
  return `<div style="background:var(--card);">
    ${rows.map((r, i) => `<div style="display:grid;grid-template-columns:24px minmax(0,1fr) 130px 62px;align-items:center;gap:0 10px;height:${rowH}px;padding:0 ${cellX};${i ? 'border-top:1px solid var(--border);' : ''}">
      ${checkbox(i === 0)}
      <span class="trunc" style="font-size:${compact ? 13 : 14}px;${i === 0 ? 'color:var(--muted-foreground);text-decoration:line-through;' : ''}">${r[0]}</span>
      <span class="trunc" style="font-size:13px;color:var(--muted-foreground);">${r[1]}</span>
      <span class="num" style="font-size:13px;color:var(--muted-foreground);">${r[2]}</span>
    </div>`).join('')}
  </div>`
}

export function Anatomy() {
  const phoneDrawer = `<div style="position:relative;width:390px;height:600px;background:var(--background);overflow:hidden;">
    <div style="display:flex;align-items:center;gap:8px;height:56px;padding:0 12px;border-bottom:1px solid var(--border);">
      <span style="display:grid;place-items:center;width:40px;height:40px;border-radius:var(--radius);">${icon('menu', 20)}</span>
      <span style="font-size:14px;font-weight:600;">Studio Vero</span>
    </div>
    <div style="padding:24px 16px;opacity:.5;">
      <div style="height:20px;width:52%;border-radius:4px;background:var(--muted);"></div>
      <div style="margin-top:16px;height:12px;width:80%;border-radius:4px;background:var(--muted);"></div>
      <div style="margin-top:8px;height:12px;width:66%;border-radius:4px;background:var(--muted);"></div>
    </div>
    <div style="position:absolute;inset:0;background:rgba(0,0,0,.4);"></div>
    <div style="position:absolute;inset:0 auto 0 0;width:256px;background:var(--card);border-right:1px solid var(--border);box-shadow:0 20px 40px rgba(0,0,0,.25);">
      <div style="display:flex;justify-content:flex-end;padding:8px 8px 0;">
        <span style="display:grid;place-items:center;width:36px;height:36px;border-radius:var(--radius);">${icon('close', 18)}</span>
      </div>
      <div style="height:calc(100% - 44px);overflow:hidden;">${sidebar({ wedding: LOTTE, weddingActive: 'Taken', sections: WEDDING_SECTIONS.slice(0, 5) }).replace('width:240px;flex:0 0 240px', 'width:256px;flex:0 0 256px').replace('border-right:1px solid var(--border);', '')}</div>
    </div>
  </div>`

  const body = `<div style="width:1440px;padding:36px 40px 44px;">
    <header style="max-width:70ch;">
      <p class="eyebrow" style="margin:0 0 6px;">app.guestnote.be</p>
      <h1 style="margin:0;font-size:28px;line-height:1.2;font-weight:600;letter-spacing:-0.02em;">De layout, uit elkaar gehaald</h1>
      <p style="margin:10px 0 0;font-size:14px;line-height:1.6;color:var(--muted-foreground);">
        De zijbalk zoals <code class="mono" style="font-size:12px;">components/nav/shell.tsx</code> hem vandaag rendert,
        met de secties die PH1&ndash;PH3 eraan toevoegen. Geen nieuwe tokens: alles hieronder komt uit
        <code class="mono" style="font-size:12px;">design-system/tokens.css</code>.</p>
    </header>

    <div style="margin-top:32px;display:flex;gap:28px;align-items:flex-start;">
      ${frame('Uitgeklapt · 240px', 'De organisatie bovenaan, het account onderaan. Onze eigen merknaam staat hier nergens.', `<div style="height:800px;display:flex;">${sidebar({ wedding: LOTTE, weddingActive: 'Taken', active: null })}</div>`, 242)}
      ${frame('Rail · 56px', 'Labels verhuizen naar de tooltip én naar de toegankelijke naam op de knop zelf.', `<div style="height:800px;display:flex;">${sidebar({ wedding: LOTTE, weddingActive: 'Taken', collapsed: true })}</div>`, 58)}
      ${frame('Telefoon · lade', 'Onder md verlaat de zijbalk de flow. De kolom eronder krijgt inert, niet alleen main. Menu- en sluitknop staan op 40 en 36px, overgenomen uit shell.tsx.', phoneDrawer, 390)}
      ${frame('Donker', 'Zelfde tokens, andere laag. De .dark-klasse, nooit prefers-color-scheme.', `<div class="dark" style="height:800px;display:flex;background:#181715;">${sidebar({ wedding: LOTTE, weddingActive: 'Taken', dark: true })}</div>`, 242)}
    </div>

    <div style="margin-top:22px;max-width:96ch;padding:13px 15px;border:1px solid var(--border);border-radius:var(--radius);background:var(--card);display:flex;gap:11px;align-items:flex-start;">
      <span style="flex:0 0 auto;color:var(--st-awaiting-fg);margin-top:1px;">${icon('warn', 17)}</span>
      <p style="margin:0;font-size:13px;line-height:1.6;color:var(--muted-foreground);">
        <strong style="color:var(--foreground);font-weight:500;">Met acht bruiloftsecties meet de zijbalk 775px</strong>
        (gemeten 12&nbsp;september&nbsp;2026, headless Chromium, Inter geladen). Dat past op een scherm van 900px
        en niet op de ~740px die een 13-inch laptop overhoudt na browserchroom &mdash; en de zijbalk heeft geen
        scrollgebied, dus wat eraf valt is precies het account en de inklapknop. Het voorstel: kop en account
        vastzetten, alleen het middenstuk laten scrollen. Bij twaalf secties, die PH4 erbij zet, is dat geen
        voorstel meer.</p>
    </div>

    <div style="margin-top:34px;display:grid;grid-template-columns:minmax(0,1.35fr) minmax(0,1fr);gap:28px;align-items:start;">
      <section>
        <h2 style="margin:0 0 12px;font-size:15px;font-weight:600;">Status &mdash; punt én woord, nooit kleur alleen</h2>
        ${card(`<div style="padding:16px;display:flex;flex-wrap:wrap;gap:18px 22px;">
          ${swatch('Komt', 'attending')}
          ${swatch('Kan niet', 'declined')}
          ${swatch('Nog geen antwoord', 'awaiting')}
          ${swatch('Deels', 'partial')}
          ${swatch('Plus één', 'plusone')}
          ${swatch('Bounce', 'alert')}
        </div>
        <div style="border-top:1px solid var(--border);padding:16px;display:flex;flex-wrap:wrap;gap:10px;align-items:center;">
          ${outlinePill('Concept')}${outlinePill('Live', true)}${outlinePill('Gearchiveerd')}
          ${chip('Intern', 'plusone', { icon: 'lock' })}${chip('Gedeeld', 'attending', { icon: 'eye' })}
          ${chip('Te laat', 'alert')}${chip('Betaald', 'attending')}${chip('Openstaand', 'awaiting')}
        </div>
        <div style="border-top:1px solid var(--border);padding:16px;">
          <p style="margin:0 0 10px;font-size:13px;line-height:1.55;color:var(--muted-foreground);">
            <strong style="color:var(--foreground);font-weight:500;">Kan niet is neutraal, niet rood.</strong>
            Een beleefde nee is geen fout. Rood is voor wat echt stuk is: een bounce, een te late betaling, boven capaciteit.</p>
        </div>`)}

        <h2 style="margin:28px 0 12px;font-size:15px;font-weight:600;">Bedieningselementen op 36px</h2>
        ${card(`<div style="padding:16px;display:flex;flex-wrap:wrap;gap:10px;align-items:center;">
          ${btn('Taak toevoegen', { variant: 'primary', icon: 'plus' })}
          ${btn('Sjabloon toepassen')}
          ${btn('Exporteren', { icon: 'download' })}
          ${segmented(['Alles', 'Aan mij', 'Aan het koppel'], 0)}
          <span style="display:inline-flex;align-items:center;gap:8px;height:36px;padding:0 10px;border:1px solid var(--input);border-radius:var(--radius);color:var(--muted-foreground);font-size:13px;min-width:180px;">${icon('search', 15)}Zoek een bruiloft ${kbd('⌘K')}</span>
        </div>`)}
      </section>

      <section>
        <h2 style="margin:0 0 12px;font-size:15px;font-weight:600;">Dichtheid schakelt de tabel én de navigatie om</h2>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
          <div>
            <p style="margin:0 0 8px;font-size:12px;color:var(--muted-foreground);">Ruim &middot; --row-h 44px</p>
            ${card(densityTable(false))}
          </div>
          <div>
            <p style="margin:0 0 8px;font-size:12px;color:var(--muted-foreground);">Compact &middot; --row-h 32px</p>
            ${card(densityTable(true))}
          </div>
        </div>
        <p style="margin:12px 0 0;font-size:13px;line-height:1.55;color:var(--muted-foreground);">
          Een gastenlijst van 300 en een dozijn bruiloften is het normale geval, niet het uitzonderlijke.
          Compact verandert rijhoogte, celpadding én knophoogte tegelijk &mdash; het is dezelfde leessessie.</p>

        <h2 style="margin:28px 0 12px;font-size:15px;font-weight:600;">Organisatie-monogram</h2>
        ${card(`<div style="padding:16px;display:flex;gap:12px;align-items:center;flex-wrap:wrap;">
          ${['Studio Vero', 'Kasteel van Brasschaat', 'Bruiloft &amp; Co', 'Atelier Noor'].map((n) => `<span style="display:flex;align-items:center;gap:8px;">${monogram(n)}<span style="font-size:13px;">${n}</span></span>`).join('')}
        </div>
        <div style="border-top:1px solid var(--border);padding:14px 16px;">
          <p style="margin:0;font-size:13px;line-height:1.55;color:var(--muted-foreground);">
            Er is geen logo om te tonen: <code class="mono" style="font-size:12px;">organizations.brand</code> is leeg jsonb
            zonder uploadpad. De tint komt uit de naam, dus ze blijft elke ochtend dezelfde.</p>
        </div>`)}
      </section>
    </div>
  </div>`

  return page({ w: 1440, h: 1210, body })
}
