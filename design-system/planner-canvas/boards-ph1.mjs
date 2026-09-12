import {
  avatar, btn, card, chip, icon, monogram, outlinePill, page,
  pageHead, segmented, shell, sidebar,
} from './lib.mjs'
import { LOTTE } from './boards-layout.mjs'

/* ========================================================================== *
 * Checklist.dc.html -- P6 shared checklist + P8 wedding-date-anchored due dates.
 *
 * "Assignment is the feature. A shared checklist nobody owns is just a document."
 * So the owner column is never empty and never optional, and the internal/shared
 * boundary is drawn twice -- a tinted row AND a lock chip -- because principle 4
 * says that boundary must always be visible, never inferred.
 * ========================================================================== */

const T_GRID = 'display:grid;grid-template-columns:26px minmax(0,1fr) 176px 40px 108px;align-items:center;gap:0 12px;'

function box(done = false) {
  return `<span aria-hidden="true" style="display:grid;place-items:center;width:17px;height:17px;border-radius:5px;border:1px solid ${done ? 'var(--primary)' : 'var(--input)'};background:${done ? 'var(--primary)' : 'transparent'};color:var(--primary-foreground);">${done ? icon('check', 12, { stroke: 2.5 }) : ''}</span>`
}

function taskRow({ title, who, due, internal = false, done = false, comments = 0, late = false, selected = false }) {
  return `<div style="${T_GRID}height:var(--row-h);padding:0 var(--cell-x);border-top:1px solid var(--border);${internal ? 'background:var(--muted);' : ''}${selected ? 'box-shadow:inset 2px 0 0 var(--primary);' : ''}">
    ${box(done)}
    <span style="display:flex;align-items:center;gap:8px;min-width:0;">
      <span class="trunc" style="font-size:14px;${done ? 'color:var(--muted-foreground);text-decoration:line-through;' : ''}">${title}</span>
      ${internal ? chip('Intern', 'plusone', { icon: 'lock' }) : ''}
    </span>
    <span style="display:flex;align-items:center;gap:7px;min-width:0;">${avatar(who, 20)}<span class="trunc" style="font-size:13px;color:var(--muted-foreground);">${who}</span></span>
    <span style="display:flex;align-items:center;gap:4px;font-size:12px;color:var(--muted-foreground);font-variant-numeric:tabular-nums;">${comments ? icon('comment', 14) + comments : ''}</span>
    <span class="num" style="font-size:13px;${late ? 'color:var(--st-alert-fg);font-weight:500;' : 'color:var(--muted-foreground);'}">${due}</span>
  </div>`
}

function phase(label, offset, resolved, rows) {
  return `<section style="margin-top:20px;">
    <div style="display:flex;align-items:baseline;gap:10px;padding:0 var(--cell-x) 8px;">
      <h2 style="margin:0;font-size:14px;font-weight:600;">${label}</h2>
      <code class="mono" style="font-size:11px;color:var(--muted-foreground);">${offset}</code>
      <span style="font-size:13px;color:var(--muted-foreground);">${resolved}</span>
    </div>
    ${card(`<div>${rows.map(taskRow).join('')}</div>`)}
  </section>`
}

export function Checklist() {
  const body = `
  ${pageHead('Taken', {
    eyebrow: 'Lotte &amp; Bram · 12 juni 2027',
    right: `${btn('Sjabloon toepassen', { icon: 'archive' })}${btn('Taak', { icon: 'plus', variant: 'primary' })}`,
  })}

  <div style="margin-top:18px;display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;">
    <div style="display:flex;align-items:center;gap:10px;">
      ${segmented(['Alles', 'Aan mij', 'Aan het koppel'], 0)}
      ${btn('Intern tonen', { icon: 'eye' })}
    </div>
    <p style="margin:0;font-size:13px;font-variant-numeric:tabular-nums;color:var(--muted-foreground);">
      12 open · 3 te laat · 8 afgerond · 4 intern</p>
  </div>

  ${phase('Nu', 'due_offset_days −273 … −265', 'sep 2026', [
    { title: 'Definitieve gastenlijst opvragen', who: 'Lotte Peeters', due: 'vr 5 sep', late: true, comments: 3 },
    { title: 'Proefdiner inplannen bij de traiteur', who: 'Joren Nagels', due: 'zo 13 sep' },
    { title: 'Marge nakijken op offerte bloemist', who: 'Joren Nagels', due: 'ma 14 sep', internal: true, comments: 1 },
    { title: 'Bloemist tweede offerte opvragen', who: 'Joren Nagels', due: 'wo 16 sep', selected: true, comments: 2 },
    { title: 'Muziekwensen doorgeven', who: 'Lotte Peeters', due: 'vr 18 sep' },
  ])}

  ${phase('Negen maanden voor', 'due_offset_days −270', 'sep 2026 · uit sjabloon', [
    { title: 'Zaalindeling doorgeven aan het kasteel', who: 'Joren Nagels', due: 'ma 21 sep' },
    { title: 'Hotelblok reserveren voor gasten van ver', who: 'Sofie Claes', due: 'wo 23 sep' },
    { title: 'Aanbetaling kasteel op de rekening zetten', who: 'Joren Nagels', due: 'vr 25 sep', internal: true },
  ])}

  ${phase('Zes maanden voor', 'due_offset_days −180', 'dec 2026 · uit sjabloon', [
    { title: 'Uitnodigingen laten drukken', who: 'Lotte Peeters', due: 'ma 14 dec' },
    { title: 'Menu vastleggen met de traiteur', who: 'Joren Nagels', due: 'do 17 dec' },
    { title: 'Ceremoniemeester briefen', who: 'Sofie Claes', due: 'ma 21 dec' },
  ])}

  ${phase('Week van de dag', 'due_offset_days −7 … 0', 'juni 2027 · uit sjabloon', [
    { title: 'Draaiboek naar alle leveranciers sturen', who: 'Joren Nagels', due: 'ma 7 jun' },
    { title: 'Definitieve aantallen naar de traiteur', who: 'Joren Nagels', due: 'di 8 jun' },
  ])}

  <section style="margin-top:20px;">
    <div style="display:flex;align-items:center;gap:8px;padding:0 var(--cell-x) 8px;color:var(--muted-foreground);">
      ${icon('chevronRight', 14)}<h2 style="margin:0;font-size:14px;font-weight:600;color:var(--foreground);">Afgerond</h2>
      <span style="font-size:13px;">8</span>
    </div>
    ${card(`<div>
      ${taskRow({ title: 'Locatie bevestigen en voorschot betalen', who: 'Joren Nagels', due: '12 mrt', done: true })}
      ${taskRow({ title: 'Fotograaf vastleggen', who: 'Joren Nagels', due: '3 apr', done: true })}
    </div>
    <div style="border-top:1px solid var(--border);padding:10px var(--cell-x);">
      <span style="font-size:13px;color:var(--muted-foreground);">Nog 6 afgeronde taken</span>
    </div>`)}
  </section>`

  return shell(
    { wedding: LOTTE, weddingActive: 'Taken' },
    body,
    { w: 1440, h: 1140, max: 1152 },
  )
}

/* ========================================================================== *
 * TaskDetail.dc.html -- P4 comments, and the visibility switch that decides who
 * can read them.
 *
 * The comment thread inherits the task's visibility through a database TRIGGER,
 * not application code (packages/db/src/schema/tasks.ts) -- so flipping this task
 * to internal takes the whole thread with it. The panel says so, because a planner
 * who does not believe that will keep the conversation in WhatsApp.
 * ========================================================================== */

function metaRow(label, value, { control = false } = {}) {
  return `<div style="display:flex;align-items:center;gap:12px;padding:9px 0;border-top:1px solid var(--border);">
    <span style="flex:0 0 118px;font-size:13px;color:var(--muted-foreground);">${label}</span>
    <span style="flex:1 1 auto;min-width:0;display:flex;align-items:center;gap:8px;font-size:13px;">${value}</span>
    ${control ? `<span style="flex:0 0 auto;color:var(--muted-foreground);">${icon('chevron', 14)}</span>` : ''}
  </div>`
}

function comment(who, when, text, { internal = false } = {}) {
  return `<div style="display:flex;gap:10px;padding:14px 0;border-top:1px solid var(--border);">
    ${avatar(who, 26)}
    <div style="min-width:0;flex:1 1 auto;">
      <p style="margin:0;display:flex;align-items:center;gap:8px;font-size:13px;">
        <strong style="font-weight:600;">${who}</strong>
        <span style="color:var(--muted-foreground);">${when}</span>
        ${internal ? chip('Intern', 'plusone', { icon: 'lock' }) : ''}
      </p>
      <p style="margin:5px 0 0;font-size:13px;line-height:1.6;">${text}</p>
    </div>
  </div>`
}

export function TaskDetail() {
  const body = `<div style="width:560px;min-height:920px;background:var(--card);border-left:1px solid var(--border);display:flex;flex-direction:column;">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 20px;border-bottom:1px solid var(--border);">
      <span class="eyebrow">Lotte &amp; Bram · Taken</span>
      <span style="display:flex;gap:6px;color:var(--muted-foreground);">${icon('comment', 18)}${icon('close', 18)}</span>
    </div>

    <div style="padding:20px 20px 24px;">
      <div style="display:flex;align-items:flex-start;gap:12px;">
        ${box(false)}
        <h1 style="margin:-2px 0 0;font-size:19px;line-height:1.35;font-weight:600;letter-spacing:-0.01em;">Bloemist tweede offerte opvragen</h1>
      </div>

      <div style="margin-top:16px;">
        ${metaRow('Toegewezen aan', `${avatar('Joren Nagels', 22)}Joren Nagels ${chip('Planner', 'declined')}`, { control: true })}
        ${metaRow('Vervalt', `<span style="font-variant-numeric:tabular-nums;">woensdag 16 september 2026</span><code class="mono" style="font-size:11px;color:var(--muted-foreground);">T−270</code>`, { control: true })}
        ${metaRow('Status', chip('Open', 'awaiting'), { control: true })}
        ${metaRow('Zichtbaarheid', `${chip('Gedeeld met het koppel', 'attending', { icon: 'eye' })}`, { control: true })}
      </div>

      <div style="margin-top:18px;padding:12px 14px;border:1px solid var(--border);border-radius:var(--radius);background:var(--muted);">
        <div style="display:flex;gap:10px;align-items:flex-start;">
          <span style="flex:0 0 auto;color:var(--st-plusone-fg);margin-top:1px;">${icon('lock', 16)}</span>
          <p style="margin:0;font-size:13px;line-height:1.6;color:var(--muted-foreground);">
            Zet je deze taak op <strong style="color:var(--foreground);font-weight:500;">intern</strong>, dan gaan
            <strong style="color:var(--foreground);font-weight:500;">de reacties mee</strong>. Lotte en Bram zien de taak
            dan niet meer, ook niet in de weekmail, en ook niet wat er al gezegd is.</p>
        </div>
      </div>

      <div style="margin-top:20px;">
        <p class="eyebrow" style="margin:0 0 8px;">Notitie</p>
        <p style="margin:0;font-size:13px;line-height:1.65;color:var(--muted-foreground);">
          Eerste offerte kwam op € 3.100 voor ceremonie + zaal. Lotte wil pioenrozen; die zijn half juni
          net buiten het seizoen. Vraag een alternatief met ranonkels erbij.</p>
      </div>

      <div style="margin-top:22px;">
        <p class="eyebrow" style="margin:0;">Reacties · 2</p>
        ${comment('Joren Nagels', '3 dagen geleden', 'Offerte opgevraagd bij Bloemhuis Dupont. Zij hebben half juni wel ranonkels en anemonen.')}
        ${comment('Lotte Peeters', 'gisteren', 'Ranonkels vind ik mooi. Kan het in dezelfde tinten blijven als op het moodboard?')}
        <div style="display:flex;gap:10px;padding-top:14px;border-top:1px solid var(--border);">
          ${avatar('Joren Nagels', 26)}
          <div style="flex:1 1 auto;">
            <div style="min-height:64px;padding:9px 11px;border:1px solid var(--input);border-radius:var(--radius);font-size:13px;color:var(--muted-foreground);">
              Schrijf een reactie…</div>
            <div style="margin-top:10px;display:flex;align-items:center;justify-content:space-between;gap:10px;">
              <span style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--muted-foreground);">
                ${icon('eye', 14)} Zichtbaar voor Lotte en Bram</span>
              ${btn('Plaatsen', { variant: 'primary', h: 32 })}
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>`

  return page({ w: 560, h: 920, body })
}

/* ========================================================================== *
 * Templates.dc.html -- P9 apply a standard plan in one click, P17 the library the
 * planner builds up.
 *
 * The whole point of the T-minus column: one template applies to any wedding and
 * the dates compute themselves against weddings.wedding_date. So the preview shows
 * BOTH -- the stored offset and what it resolves to for the wedding you picked.
 * ========================================================================== */

function tplRow(name, tasks, used, active = false) {
  return `<div style="display:flex;align-items:center;gap:10px;padding:11px 14px;border-top:1px solid var(--border);${active ? 'background:var(--muted);' : ''}">
    <span style="flex:1 1 auto;min-width:0;">
      <span class="trunc" style="display:block;font-size:14px;font-weight:${active ? 500 : 400};">${name}</span>
      <span class="trunc" style="display:block;margin-top:2px;font-size:12px;color:var(--muted-foreground);">${tasks} taken · ${used}</span>
    </span>
    <span style="flex:0 0 auto;color:var(--muted-foreground);">${icon('chevronRight', 14)}</span>
  </div>`
}

function tplTask(offset, label, who, resolved, internal = false) {
  return `<div style="display:grid;grid-template-columns:96px minmax(0,1fr) 150px 116px;align-items:center;gap:0 12px;height:var(--row-h);padding:0 var(--cell-x);border-top:1px solid var(--border);${internal ? 'background:var(--muted);' : ''}">
    <code class="mono" style="font-size:12px;color:var(--muted-foreground);">${offset}</code>
    <span style="display:flex;align-items:center;gap:8px;min-width:0;">
      <span class="trunc" style="font-size:14px;">${label}</span>
      ${internal ? chip('Intern', 'plusone', { icon: 'lock' }) : ''}
    </span>
    <span style="font-size:13px;color:var(--muted-foreground);">${who}</span>
    <span class="num" style="font-size:13px;font-variant-numeric:tabular-nums;color:var(--muted-foreground);">${resolved}</span>
  </div>`
}

export function Templates() {
  const body = `
  ${pageHead('Sjablonen', {
    sub: 'Een standaardplan dat zichzelf uitrekent tegen de trouwdatum.',
    right: `${btn('Sjabloon maken', { icon: 'plus', variant: 'primary' })}`,
  })}

  <div style="margin-top:24px;display:grid;grid-template-columns:320px minmax(0,1fr);gap:20px;align-items:start;">
    <div>
      ${card(`<div>
        <div style="padding:11px 14px;"><p class="eyebrow" style="margin:0;">Van Studio Vero</p></div>
        ${tplRow('Kasteel + traiteur · 14 maanden', 42, 'op 6 bruiloften', true)}
        ${tplRow('Kort traject · 6 maanden', 24, 'op 2 bruiloften')}
        ${tplRow('Kerkelijk + receptie', 38, 'op 4 bruiloften')}
        ${tplRow('Tweede dag / brunch', 11, 'nog niet gebruikt')}
        <div style="padding:11px 14px;border-top:1px solid var(--border);"><p class="eyebrow" style="margin:0;">Van Guestnote</p></div>
        ${tplRow('Standaard België · 12 maanden', 36, 'startpunt')}
      </div>`)}
      <p style="margin:12px 2px 0;font-size:13px;line-height:1.55;color:var(--muted-foreground);">
        Een planner met vijftien bruiloften bouwt die lijst geen vijftien keer opnieuw. Dit is wat de tool
        plakkeriger maakt naarmate ze hem langer gebruiken.</p>
    </div>

    <div>
      <div style="display:flex;align-items:flex-end;justify-content:space-between;gap:16px;">
        <div>
          <h2 style="margin:0;font-size:17px;font-weight:600;letter-spacing:-0.01em;">Kasteel + traiteur · 14 maanden</h2>
          <p style="margin:5px 0 0;font-size:13px;color:var(--muted-foreground);">42 taken · 9 intern · laatst bewerkt 2 augustus</p>
        </div>
        ${btn('Bewerken')}
      </div>

      <div style="margin-top:16px;padding:14px;border:1px solid var(--border);border-radius:var(--radius);background:var(--card);">
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
          <span style="font-size:13px;color:var(--muted-foreground);">Toepassen op</span>
          <span style="display:inline-flex;align-items:center;gap:8px;height:36px;padding:0 10px;border:1px solid var(--input);border-radius:var(--radius);font-size:13px;">
            ${monogram('Lotte Bram', { size: 20, round: 5, font: 9 })} Lotte &amp; Bram · 12 juni 2027 ${icon('chevron', 14, { style: 'opacity:.6;' })}</span>
          <span style="font-size:13px;color:var(--muted-foreground);">→ 42 taken krijgen een datum</span>
          <span style="flex:1 1 auto;"></span>
          ${btn('Toepassen', { variant: 'primary' })}
        </div>
        <p style="margin:10px 0 0;font-size:12px;line-height:1.55;color:var(--muted-foreground);">
          Bestaande taken met dezelfde titel worden overgeslagen, niet gedupliceerd. Data die in het verleden
          vallen &mdash; deze bruiloft is al geboekt &mdash; komen op vandaag te staan en worden gemarkeerd.</p>
      </div>

      <div style="margin-top:18px;">
        <div style="display:grid;grid-template-columns:96px minmax(0,1fr) 150px 116px;gap:0 12px;padding:0 var(--cell-x) 8px;">
          <span class="eyebrow">Offset</span><span class="eyebrow">Taak</span>
          <span class="eyebrow">Standaard aan</span><span class="eyebrow num">Wordt</span>
        </div>
        ${card(`<div>
          ${tplTask('−420', 'Locatie bezichtigen en optie nemen', 'Planner', 'reeds voorbij')}
          ${tplTask('−390', 'Voorschot kasteel betalen', 'Planner', 'reeds voorbij')}
          ${tplTask('−300', 'Traiteur kiezen na proeverij', 'Planner', 'do 16 jul 2026')}
          ${tplTask('−270', 'Zaalindeling doorgeven', 'Planner', 'ma 21 sep 2026')}
          ${tplTask('−270', 'Marge nakijken op offertes', 'Planner', 'ma 21 sep 2026', true)}
          ${tplTask('−180', 'Uitnodigingen laten drukken', 'Koppel', 'ma 14 dec 2026')}
          ${tplTask('−120', 'Menu definitief vastleggen', 'Planner', 'ma 12 feb 2027')}
          ${tplTask('−30', 'Tafelschikking afronden', 'Koppel', 'wo 12 mei 2027')}
          ${tplTask('−7', 'Draaiboek naar leveranciers', 'Planner', 'za 5 jun 2027')}
          ${tplTask('0', 'Sleutel kasteel ophalen om 8u', 'Planner', 'za 12 jun 2027')}
        </div>
        <div style="border-top:1px solid var(--border);padding:10px var(--cell-x);">
          <span style="font-size:13px;color:var(--muted-foreground);">Nog 32 taken</span>
        </div>`)}
      </div>
    </div>
  </div>`

  return shell({ active: 'templates' }, body, { w: 1440, h: 1080, max: 1152 })
}

/* ========================================================================== *
 * CouplePortal.dc.html -- P7.
 *
 * Same UI, scoped down: no org switcher, no cross-wedding Vandaag, no Sjablonen,
 * no Team. PRODUCT.md lists "same UI scoped down vs a separate surface" as still
 * undecided; this artboard is the cheap answer, drawn so the choice can be judged.
 *
 * What must NOT be here: any trace of the four internal tasks. Not a count, not a
 * greyed row, not "3 verborgen". A hint that something is hidden is the leak.
 * ========================================================================== */

const COUPLE_NAV = [['Zoeken', 'search', 'search']]
const COUPLE_SECTIONS = [
  ['Overzicht', 'overview', null],
  ['Onze taken', 'tasks', '5'],
  ['Budget', 'budget', null],
  ['Moodboard', 'moodboard', null],
  ['Bestanden', 'files', null],
]

export function CouplePortal() {
  const ourTask = (title, who, due, late = false) => `<div style="display:grid;grid-template-columns:26px minmax(0,1fr) 150px 108px;align-items:center;gap:0 12px;height:var(--row-h);padding:0 var(--cell-x);border-top:1px solid var(--border);">
    ${box(false)}
    <span class="trunc" style="font-size:14px;">${title}</span>
    <span style="display:flex;align-items:center;gap:7px;min-width:0;">${avatar(who, 20)}<span class="trunc" style="font-size:13px;color:var(--muted-foreground);">${who}</span></span>
    <span class="num" style="font-size:13px;${late ? 'color:var(--st-alert-fg);font-weight:500;' : 'color:var(--muted-foreground);'}">${due}</span>
  </div>`

  const body = `
  ${pageHead('Lotte &amp; Bram', {
    eyebrow: 'Onze bruiloft',
    sub: 'zaterdag 12 juni 2027 · Kasteel van Brasschaat · nog 273 dagen',
    right: btn('Onze site bekijken', { icon: 'eye' }),
  })}

  <div style="margin-top:24px;display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:20px;align-items:start;">
    <div>
      <div style="display:flex;align-items:baseline;gap:10px;padding:0 var(--cell-x) 8px;">
        <h2 style="margin:0;font-size:14px;font-weight:600;">Wat wij moeten doen</h2>
        <span style="font-size:13px;color:var(--muted-foreground);">5 · 1 te laat</span>
      </div>
      ${card(`<div>
        ${ourTask('Definitieve gastenlijst doorgeven', 'Lotte Peeters', 'vr 5 sep', true)}
        ${ourTask('Muziekwensen doorgeven', 'Lotte Peeters', 'vr 18 sep')}
        ${ourTask('Uitnodigingen nakijken vóór de druk', 'Bram Willems', 'ma 14 dec')}
        ${ourTask('Tafelschikking afronden', 'Lotte Peeters', 'wo 12 mei')}
        ${ourTask('Ringen ophalen', 'Bram Willems', 'do 3 jun')}
      </div>`)}

      <div style="margin-top:24px;">
        <div style="display:flex;align-items:baseline;gap:10px;padding:0 var(--cell-x) 8px;">
          <h2 style="margin:0;font-size:14px;font-weight:600;">Waar Joren mee bezig is</h2>
          <span style="font-size:13px;color:var(--muted-foreground);">7</span>
        </div>
        ${card(`<div>
          ${ourTask('Proefdiner inplannen bij de traiteur', 'Joren Nagels', 'zo 13 sep')}
          ${ourTask('Bloemist tweede offerte opvragen', 'Joren Nagels', 'wo 16 sep')}
          ${ourTask('Zaalindeling doorgeven aan het kasteel', 'Joren Nagels', 'ma 21 sep')}
        </div>
        <div style="border-top:1px solid var(--border);padding:10px var(--cell-x);">
          <span style="font-size:13px;color:var(--muted-foreground);">Nog 4 taken</span>
        </div>`)}
      </div>
    </div>

    <div style="display:flex;flex-direction:column;gap:20px;">
      ${card(`<div style="padding:14px 16px;">
        <p class="eyebrow" style="margin:0;">Budget</p>
        <p style="margin:8px 0 0;font-size:20px;font-weight:600;font-variant-numeric:tabular-nums;">€ 24.850</p>
        <p style="margin:4px 0 0;font-size:13px;color:var(--muted-foreground);">vastgelegd van € 28.000</p>
        <span style="display:block;margin-top:12px;height:6px;border-radius:999px;background:var(--muted);overflow:hidden;">
          <span style="display:block;width:89%;height:100%;background:var(--primary);"></span></span>
        <p style="margin:12px 0 0;font-size:13px;line-height:1.55;color:var(--muted-foreground);">
          Jullie zien exact hetzelfde budget als Joren. Er is geen tweede versie.</p>
      </div>`)}

      ${card(`<div style="padding:14px 16px;">
        <p class="eyebrow" style="margin:0;">Jullie planner</p>
        <div style="margin-top:10px;display:flex;align-items:center;gap:10px;">
          ${monogram('Studio Vero')}
          <span><span style="display:block;font-size:13px;font-weight:500;">Studio Vero</span>
          <span style="display:block;font-size:12px;color:var(--muted-foreground);">Joren Nagels · Sofie Claes</span></span>
        </div>
        <div style="margin-top:12px;">${btn('Bericht sturen', { icon: 'comment' })}</div>
      </div>`)}
    </div>
  </div>`

  return shell(
    {
      org: 'Studio Vero',
      user: 'Lotte Peeters',
      nav: COUPLE_NAV,
      wedding: { name: 'Onze bruiloft', date: '12 juni 2027' },
      weddingActive: 'Overzicht',
      sections: COUPLE_SECTIONS,
    },
    body,
    { w: 1440, h: 940, max: 1024 },
  )
}
