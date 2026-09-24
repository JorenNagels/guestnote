import {
  avatar, btn, card, chip, icon, isLate, monogram, page, pageHead, segmented,
  shell, shortNL,
} from './lib.mjs'
import { LOTTE } from './boards-layout.mjs'

const EUR = (n) => '€&nbsp;' + n.toLocaleString('nl-BE')

/* ========================================================================== *
 * Budget.dc.html -- P11.
 *
 * Fully shared with the couple, decided 2026-08-14: the planner's fee is either
 * outside the budget or simply another line, so there is no margin to hide and no
 * dual-visibility model to build. The fee is therefore drawn as a line, not as a
 * footnote -- if it were hidden here the whole "no second version" claim is untrue.
 *
 * Every money column is right-aligned with tabular-nums, which tokens.css states as
 * a base-layer rule on `td.num, th.num`. These boards are CSS grids of spans rather
 * than tables, so that selector cannot reach them -- lib.mjs restates it as a `.num`
 * class. The rule is inherited, not applied; when this becomes real markup it should
 * be a table and the selector should do the work.
 * ========================================================================== */

const B_GRID = 'display:grid;grid-template-columns:minmax(0,1fr) 148px 104px 104px 104px 136px;align-items:center;gap:0 12px;'

function budgetRow(label, vendor, geraamd, vastgelegd, betaald, status, tone) {
  const open = vastgelegd - betaald
  return `<div style="${B_GRID}height:var(--row-h);padding:0 var(--cell-x);border-top:1px solid var(--border);">
    <span class="trunc" style="font-size:14px;">${label}</span>
    <span class="trunc" style="font-size:13px;color:var(--muted-foreground);">${vendor}</span>
    <span class="num" style="font-size:13px;color:var(--muted-foreground);">${EUR(geraamd)}</span>
    <span class="num" style="font-size:13px;">${vastgelegd ? EUR(vastgelegd) : '—'}</span>
    <span class="num" style="font-size:13px;color:var(--muted-foreground);">${betaald ? EUR(betaald) : '—'}</span>
    <span style="display:flex;justify-content:flex-end;">${chip(status, tone)}</span>
  </div>`
}

function catHead(name, geraamd, vastgelegd) {
  return `<div style="${B_GRID}height:34px;padding:0 var(--cell-x);border-top:1px solid var(--border);background:var(--muted);">
    <span style="font-size:13px;font-weight:600;">${name}</span><span></span>
    <span class="num" style="font-size:12px;color:var(--muted-foreground);">${EUR(geraamd)}</span>
    <span class="num" style="font-size:12px;font-weight:500;">${EUR(vastgelegd)}</span>
    <span></span><span></span>
  </div>`
}

export function Budget() {
  const body = `
  ${pageHead('Budget', {
    eyebrow: 'Lotte &amp; Bram · 12 juni 2027',
    right: `${btn('CSV', { icon: 'download' })}${btn('Budgetlijn', { icon: 'plus', variant: 'primary' })}`,
  })}

  <div style="margin-top:20px;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;">
    ${[['Geraamd', 28000, 'door het koppel opgegeven'], ['Vastgelegd', 25200, '2 lijnen nog zonder bedrag'], ['Betaald', 9540, '38% van het vastgelegde'], ['Openstaand', 15660, 'over 8 schijven']]
      .map(([l, v, s], i) => card(`<div style="padding:14px 16px;">
        <p class="eyebrow" style="margin:0;">${l}</p>
        <p style="margin:8px 0 0;font-size:20px;font-weight:600;font-variant-numeric:tabular-nums;${i === 3 ? 'color:var(--st-awaiting-fg);' : ''}">${EUR(v)}</p>
        <p style="margin:5px 0 0;font-size:13px;color:var(--muted-foreground);">${s}</p>
      </div>`)).join('')}
  </div>

  <div style="margin-top:14px;padding:14px 16px;background:var(--card);border:1px solid var(--border);border-radius:var(--radius);">
    <div style="display:flex;align-items:baseline;justify-content:space-between;gap:16px;margin-bottom:9px;">
      <p style="margin:0;font-size:13px;">Verwachte uitgave <strong style="font-weight:600;font-variant-numeric:tabular-nums;">${EUR(27400)}</strong></p>
      <p style="margin:0;font-size:13px;color:var(--muted-foreground);">${EUR(600)} onder de raming van ${EUR(28000)}</p>
    </div>
    <div style="display:flex;height:10px;border-radius:999px;overflow:hidden;background:var(--muted);">
      <span style="width:34.8%;background:var(--primary);"></span>
      <span style="width:57.2%;background:var(--teal-400);"></span>
      <span style="width:8.0%;background:var(--neutral-300);"></span>
    </div>
    <div style="margin-top:10px;display:flex;gap:20px;flex-wrap:wrap;font-size:12px;color:var(--muted-foreground);">
      <span style="display:flex;align-items:center;gap:7px;"><span style="width:9px;height:9px;border-radius:2px;background:var(--primary);"></span>Betaald ${EUR(9540)}</span>
      <span style="display:flex;align-items:center;gap:7px;"><span style="width:9px;height:9px;border-radius:2px;background:var(--teal-400);"></span>Vastgelegd, nog te betalen ${EUR(15660)}</span>
      <span style="display:flex;align-items:center;gap:7px;"><span style="width:9px;height:9px;border-radius:2px;background:var(--neutral-300);"></span>Nog te boeken, geraamd ${EUR(2200)}</span>
    </div>
  </div>

  <div style="margin-top:24px;">
    <div style="${B_GRID}padding:0 var(--cell-x) 8px;">
      <span class="eyebrow">Budgetlijn</span><span class="eyebrow">Leverancier</span>
      <span class="eyebrow num">Geraamd</span><span class="eyebrow num">Vastgelegd</span>
      <span class="eyebrow num">Betaald</span><span class="eyebrow" style="text-align:right;">Status</span>
    </div>
    ${card(`<div>
      ${catHead('Locatie', 6150, 6800)}
      ${budgetRow('Zaalhuur + terras', 'Kasteel van Brasschaat', 6150, 6800, 2000, 'Deels betaald', 'partial')}
      ${catHead('Eten &amp; drank', 9400, 8360)}
      ${budgetRow('Diner, 4 gangen · 120 couverts', 'Traiteur Vermeulen', 7000, 6360, 1500, 'Deels betaald', 'partial')}
      ${budgetRow('Dranken en receptie', 'Traiteur Vermeulen', 2400, 2000, 0, 'Openstaand', 'awaiting')}
      ${catHead('Beeld &amp; muziek', 3600, 3600)}
      ${budgetRow('Fotografie, hele dag', 'Studio Lens', 2200, 2200, 1100, 'Deels betaald', 'partial')}
      ${budgetRow('DJ tot 3u', 'DJ Ravage', 1400, 1400, 0, 'Openstaand', 'awaiting')}
      ${catHead('Bloemen', 1800, 0)}
      ${budgetRow('Ceremonie, tafels, boeket', 'Bloemhuis Dupont', 1800, 0, 0, 'Offerte gevraagd', 'declined')}
      ${catHead('Kleding, haar &amp; drukwerk', 3300, 3090)}
      ${budgetRow('Jurk, pak, haar en make-up', '—', 2600, 2450, 2450, 'Betaald', 'attending')}
      ${budgetRow('Uitnodigingen en menukaarten', 'Drukkerij Vanhee', 700, 640, 640, 'Betaald', 'attending')}
      ${catHead('Vervoer', 400, 0)}
      ${budgetRow('Pendeldienst station → kasteel', '—', 400, 0, 0, 'Nog te boeken', 'declined')}
      ${catHead('Begeleiding', 3350, 3350)}
      ${budgetRow('Honorarium wedding planner', 'Studio Vero', 3000, 3000, 1500, 'Deels betaald', 'partial')}
      ${budgetRow('Ceremoniebegeleiding', 'Ceremoniemeester Jo', 350, 350, 350, 'Betaald', 'attending')}
      <div style="${B_GRID}height:48px;padding:0 var(--cell-x);border-top:1px solid var(--foreground);">
        <span style="font-size:14px;font-weight:600;">Totaal</span><span></span>
        <span class="num" style="font-size:14px;font-weight:600;">${EUR(28000)}</span>
        <span class="num" style="font-size:14px;font-weight:600;">${EUR(25200)}</span>
        <span class="num" style="font-size:14px;font-weight:600;">${EUR(9540)}</span>
        <span></span>
      </div>
    </div>`)}
    <p style="margin:12px 2px 0;font-size:13px;line-height:1.6;color:var(--muted-foreground);max-width:78ch;">
      Het honorarium van Studio Vero staat gewoon in de lijst. Dat is de reden dat er geen tweede,
      afgeschermde budgetweergave bestaat: er valt niets te verbergen, dus valt er niets te bouwen.</p>
  </div>`

  return shell({ wedding: LOTTE, weddingActive: 'Budget' }, body, { w: 1440, h: 1160, max: 1152 })
}

/* ========================================================================== *
 * Payments.dc.html -- P12, "the half of budget management Excel does worst".
 * ========================================================================== */

const P_GRID = 'display:grid;grid-template-columns:104px minmax(0,1fr) 170px 120px 128px;align-items:center;gap:0 12px;'

function payRow(due, what, vendor, amount, status, tone, { done = false } = {}) {
  return `<div style="${P_GRID}height:var(--row-h);padding:0 var(--cell-x);border-top:1px solid var(--border);">
    <span style="font-size:13px;font-variant-numeric:tabular-nums;color:var(--muted-foreground);">${shortNL(due)}</span>
    <span class="trunc" style="font-size:14px;${done ? 'color:var(--muted-foreground);' : ''}">${what}</span>
    <span class="trunc" style="font-size:13px;color:var(--muted-foreground);">${vendor}</span>
    <span class="num" style="font-size:14px;font-weight:${done ? 400 : 500};">${EUR(amount)}</span>
    <span style="display:flex;justify-content:flex-end;">${chip(status, tone)}</span>
  </div>`
}

function payMonth(label, total) {
  return `<div style="${P_GRID}height:34px;padding:0 var(--cell-x);border-top:1px solid var(--border);background:var(--muted);">
    <span style="font-size:13px;font-weight:600;grid-column:span 3;">${label}</span>
    <span class="num" style="font-size:12px;font-weight:500;">${EUR(total)}</span><span></span>
  </div>`
}

export function Payments() {
  const body = `
  ${pageHead('Betalingen', {
    eyebrow: 'Lotte &amp; Bram · 12 juni 2027',
    right: `${btn('CSV', { icon: 'download' })}${btn('Schijf', { icon: 'plus', variant: 'primary' })}`,
  })}

  <div style="margin-top:18px;display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;">
    ${segmented(['Alles', 'Openstaand', 'Betaald'], 0)}
    <p style="margin:0;font-size:13px;font-variant-numeric:tabular-nums;color:var(--muted-foreground);">
      Volgende schijf ${EUR(2400)} op 15 oktober · ${EUR(15660)} openstaand over 8 schijven</p>
  </div>

  <div style="margin-top:20px;">
    <div style="${P_GRID}padding:0 var(--cell-x) 8px;">
      <span class="eyebrow">Vervalt</span><span class="eyebrow">Schijf</span>
      <span class="eyebrow">Aan</span><span class="eyebrow num">Bedrag</span>
      <span class="eyebrow" style="text-align:right;">Status</span>
    </div>
    ${card(`<div>
      ${payMonth('Oktober 2026', 2400)}
      ${payRow('2026-10-15', 'Tweede schijf zaalhuur', 'Kasteel van Brasschaat', 2400, 'Openstaand', 'awaiting')}
      ${payMonth('November 2026', 1000)}
      ${payRow('2026-11-01', 'Honorarium, tweede van drie', 'Studio Vero', 1000, 'Openstaand', 'awaiting')}
      ${payMonth('December 2026', 1100)}
      ${payRow('2026-12-15', 'Saldo fotografie', 'Studio Lens', 1100, 'Openstaand', 'awaiting')}
      ${payMonth('Maart 2027', 2500)}
      ${payRow('2027-03-01', 'Voorschot traiteur', 'Traiteur Vermeulen', 2500, 'Openstaand', 'awaiting')}
      ${payMonth('Mei 2027', 3800)}
      ${payRow('2027-05-01', 'Saldo zaalhuur', 'Kasteel van Brasschaat', 2400, 'Openstaand', 'awaiting')}
      ${payRow('2027-05-29', 'DJ, volledig bedrag', 'DJ Ravage', 1400, 'Openstaand', 'awaiting')}
      ${payMonth('Juni 2027', 4860)}
      ${payRow('2027-06-01', 'Honorarium, laatste schijf', 'Studio Vero', 500, 'Openstaand', 'awaiting')}
      ${payRow('2027-06-05', 'Saldo traiteur, na definitieve aantallen', 'Traiteur Vermeulen', 4360, 'Openstaand', 'awaiting')}
    </div>`)}

    <div style="margin-top:22px;">
      <div style="display:flex;align-items:center;gap:8px;padding:0 var(--cell-x) 8px;color:var(--muted-foreground);">
        ${icon('chevronRight', 14)}<h2 style="margin:0;font-size:14px;font-weight:600;color:var(--foreground);">Reeds betaald</h2>
        <span style="font-size:13px;font-variant-numeric:tabular-nums;">${EUR(9540)} · 7 schijven</span>
      </div>
      ${card(`<div>
        ${payRow('2026-03-12', 'Voorschot zaalhuur bij boeking', 'Kasteel van Brasschaat', 2000, 'Betaald', 'attending', { done: true })}
        ${payRow('2026-04-03', 'Voorschot fotografie', 'Studio Lens', 1100, 'Betaald', 'attending', { done: true })}
        ${payRow('2026-06-01', 'Honorarium, eerste van drie', 'Studio Vero', 1500, 'Betaald', 'attending', { done: true })}
      </div>
      <div style="border-top:1px solid var(--border);padding:10px var(--cell-x);">
        <span style="font-size:13px;color:var(--muted-foreground);">Nog 4 betalingen</span>
      </div>`)}
    </div>
  </div>`

  return shell({ wedding: LOTTE, weddingActive: 'Betalingen' }, body, { w: 1440, h: 1120, max: 1152 })
}

/* ========================================================================== *
 * Vendors.dc.html -- P13. Contact, category, amount, contract file.
 * ========================================================================== */

function vendorRow(name, cat, contact, amount, contract, status, tone) {
  return `<div style="display:grid;grid-template-columns:minmax(0,1.3fr) 150px minmax(0,1fr) 110px 132px 130px;align-items:center;gap:0 12px;height:56px;padding:0 var(--cell-x);border-top:1px solid var(--border);">
    <span style="display:flex;align-items:center;gap:10px;min-width:0;">
      ${monogram(name, { size: 30, round: 6, font: 11 })}
      <span class="trunc" style="font-size:14px;font-weight:500;">${name}</span>
    </span>
    <span class="trunc" style="font-size:13px;color:var(--muted-foreground);">${cat}</span>
    <span style="display:flex;align-items:center;gap:8px;min-width:0;">
      <span class="trunc" style="font-size:13px;color:var(--muted-foreground);">${contact}</span>
      <span style="display:flex;gap:4px;flex:0 0 auto;color:var(--muted-foreground);">${icon('phone', 15)}${icon('comment', 15)}</span>
    </span>
    <span class="num" style="font-size:13px;">${amount ? EUR(amount) : '—'}</span>
    <span style="font-size:13px;color:var(--muted-foreground);display:flex;align-items:center;gap:6px;">${contract ? icon('pdf', 15) + contract : '<span style="color:var(--st-awaiting-fg);">Ontbreekt</span>'}</span>
    <span style="display:flex;justify-content:flex-end;">${chip(status, tone)}</span>
  </div>`
}

export function Vendors() {
  const body = `
  ${pageHead('Leveranciers', {
    eyebrow: 'Lotte &amp; Bram · 12 juni 2027',
    sub: '6 van 9 bevestigd · 1 in optie · 1 offerte open · 1 nog te kiezen',
    right: `${btn('Uit mijn adresboek', { icon: 'archive' })}${btn('Leverancier', { icon: 'plus', variant: 'primary' })}`,
  })}

  <div style="margin-top:22px;">
    <div style="display:grid;grid-template-columns:minmax(0,1.3fr) 150px minmax(0,1fr) 110px 132px 130px;gap:0 12px;padding:0 var(--cell-x) 8px;">
      <span class="eyebrow">Leverancier</span><span class="eyebrow">Categorie</span>
      <span class="eyebrow">Contactpersoon</span><span class="eyebrow num">Bedrag</span>
      <span class="eyebrow">Contract</span><span class="eyebrow" style="text-align:right;">Status</span>
    </div>
    ${card(`<div>
      ${vendorRow('Kasteel van Brasschaat', 'Locatie', 'Ann Peeters', 6800, 'contract.pdf', 'Bevestigd', 'attending')}
      ${vendorRow('Traiteur Vermeulen', 'Eten &amp; drank', 'Dirk Vermeulen', 8360, 'contract.pdf', 'Bevestigd', 'attending')}
      ${vendorRow('Studio Lens', 'Fotografie', 'Nele Cools', 2200, 'contract.pdf', 'Bevestigd', 'attending')}
      ${vendorRow('DJ Ravage', 'Muziek', 'Kevin Maes', 1400, null, 'Optie tot 1 okt', 'awaiting')}
      ${vendorRow('Bloemhuis Dupont', 'Bloemen', 'Marie Dupont', 0, null, 'Offerte gevraagd', 'declined')}
      ${vendorRow('Haarsalon Lila', 'Haar &amp; make-up', 'Lila Vanden Broeck', 450, 'bevestiging.pdf', 'Bevestigd', 'attending')}
      ${vendorRow('Drukkerij Vanhee', 'Drukwerk', 'Tom Vanhee', 640, 'offerte.pdf', 'Bevestigd', 'attending')}
      ${vendorRow('Ceremoniemeester Jo', 'Ceremonie', 'Jo Aerts', 350, 'contract.pdf', 'Bevestigd', 'attending')}
    </div>
    <div style="border-top:1px solid var(--border);padding:14px var(--cell-x);display:flex;align-items:center;gap:10px;">
      <span style="color:var(--muted-foreground);">${icon('plus', 16)}</span>
      <span style="font-size:13px;color:var(--muted-foreground);">Vervoer &mdash; nog geen leverancier gekozen</span>
    </div>`)}
  </div>

  <div style="margin-top:24px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;">
    ${card(`<div style="padding:16px;">
      <p class="eyebrow" style="margin:0 0 8px;">Adresboek van Studio Vero</p>
      <p style="margin:0;font-size:13px;line-height:1.6;color:var(--muted-foreground);">
        34 leveranciers over 12 bruiloften. Wie je hier toevoegt, staat de volgende keer klaar &mdash;
        met het bedrag van vorige keer als vertrekpunt.</p>
    </div>`)}
    ${card(`<div style="padding:16px;">
      <p class="eyebrow" style="margin:0 0 8px;">Draaiboek</p>
      <p style="margin:0;font-size:13px;line-height:1.6;color:var(--muted-foreground);">
        Zes van deze leveranciers hebben rijen in het draaiboek. Zij krijgen straks een link naar
        <strong style="color:var(--foreground);font-weight:500;">alleen hun eigen rijen</strong> &mdash; niet het budget,
        niet de gastenlijst.</p>
    </div>`)}
  </div>`

  return shell({ wedding: LOTTE, weddingActive: 'Leveranciers' }, body, { w: 1440, h: 1020, max: 1152 })
}

/* ========================================================================== *
 * RunSheet.dc.html -- P14, "the gap the strategy identified".
 *
 * Everything here is built to survive a black-and-white A4 printed at a venue with
 * no signal: the who column is a name plus a role word, never a colour, and the
 * block bands are tone, not hue.
 * ========================================================================== */

const R_GRID = 'display:grid;grid-template-columns:70px 56px minmax(0,1fr) 210px 40px;align-items:center;gap:0 12px;'

function rsRow(time, dur, what, who, note = false, cur = false) {
  return `<div style="${R_GRID}min-height:var(--row-h);padding:6px var(--cell-x);border-top:1px solid var(--border);${cur ? 'background:var(--accent);' : ''}">
    <span style="font-size:14px;font-weight:500;font-variant-numeric:tabular-nums;">${time}</span>
    <span style="font-size:12px;font-variant-numeric:tabular-nums;color:var(--muted-foreground);">${dur}</span>
    <span style="min-width:0;"><span class="trunc" style="display:block;font-size:14px;">${what}</span>
      ${note ? `<span class="trunc" style="display:block;margin-top:2px;font-size:12px;color:var(--muted-foreground);">${note}</span>` : ''}</span>
    <span class="trunc" style="font-size:13px;color:var(--muted-foreground);">${who}</span>
    <span style="color:var(--muted-foreground);display:flex;justify-content:flex-end;">${icon('menu', 15)}</span>
  </div>`
}

function rsBlock(name, span) {
  return `<div style="${R_GRID}height:34px;padding:0 var(--cell-x);border-top:1px solid var(--border);background:var(--muted);">
    <span style="font-size:13px;font-weight:600;grid-column:span 2;">${name}</span>
    <span style="font-size:12px;color:var(--muted-foreground);grid-column:span 3;">${span}</span>
  </div>`
}

export function RunSheet() {
  const exportMenu = `<div style="position:relative;">
    ${btn('Exporteren', { icon: 'download' })}
    <div style="position:absolute;top:42px;right:0;width:266px;background:var(--popover);border:1px solid var(--border);border-radius:var(--radius);box-shadow:0 12px 28px rgba(0,0,0,.14);padding:4px;text-align:left;z-index:5;">
      <p class="eyebrow" style="margin:0;padding:6px 8px 4px;">Draaiboek</p>
      ${[['pdf', 'PDF · A4 staand'], ['pdf', 'PDF · zwart-wit voor de zaal'], ['pdf', 'PDF · alleen mijn rijen']].map(([ic, l]) => `<span style="display:flex;align-items:center;gap:8px;padding:7px 8px;border-radius:6px;font-size:13px;color:var(--muted-foreground);">${icon(ic, 15)}${l}</span>`).join('')}
      <hr style="border:0;border-top:1px solid var(--border);margin:4px -4px;">
      <span style="display:flex;align-items:center;gap:8px;padding:7px 8px;border-radius:6px;font-size:13px;color:var(--muted-foreground);">${icon('download', 15)}Budget · CSV</span>
    </div>
  </div>`

  const body = `
  ${pageHead('Draaiboek', {
    eyebrow: 'Lotte &amp; Bram · zaterdag 12 juni 2027',
    right: `${btn('Delen met leveranciers', { icon: 'vendors' })}${exportMenu}${btn('Rij', { icon: 'plus', variant: 'primary' })}`,
  })}

  <div style="margin-top:18px;display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;">
    ${segmented(['Hele dag', 'Alleen mijn rijen', 'Per leverancier'], 0)}
    <p style="margin:0;font-size:13px;color:var(--muted-foreground);">
      08:00 → 04:00 · 19 rijen · 6 leveranciers hebben rijen</p>
  </div>

  <div style="margin-top:20px;">
    <div style="${R_GRID}padding:0 var(--cell-x) 8px;">
      <span class="eyebrow">Uur</span><span class="eyebrow">Duur</span>
      <span class="eyebrow">Wat</span><span class="eyebrow">Wie</span><span></span>
    </div>
    ${card(`<div>
      ${rsBlock('Ochtend', '08:00 → 13:00')}
      ${rsRow('08:00', '30 min', 'Sleutel kasteel ophalen bij de conciërge', 'Joren Nagels · planner')}
      ${rsRow('09:00', '2 u', 'Opbouw traiteur, keuken en bar', 'Traiteur Vermeulen', 'Levering langs de zijingang, niet via de oprit')}
      ${rsRow('10:30', '90 min', 'Haar en make-up bruid + moeders', 'Haarsalon Lila', 'In de bibliotheek op de eerste verdieping')}
      ${rsRow('12:00', '60 min', 'Bloemen leveren en opstellen', 'Bloemhuis Dupont')}
      ${rsBlock('Ceremonie', '14:30 → 16:15')}
      ${rsRow('14:30', '30 min', 'Gasten ontvangen met welkomstdrink', 'Personeel kasteel')}
      ${rsRow('15:00', '45 min', 'Ceremonie in de rozentuin', 'Ceremoniemeester Jo', 'Bij regen: binnen in de spiegelzaal, beslissing om 13:00')}
      ${rsRow('15:45', '30 min', 'Felicitaties en groepsfoto op de trap', 'Studio Lens')}
      ${rsBlock('Receptie en diner', '16:15 → 21:30')}
      ${rsRow('16:15', '90 min', 'Receptie op het terras', 'Traiteur Vermeulen')}
      ${rsRow('17:45', '15 min', 'Speech vader van de bruid', 'Ceremoniemeester Jo')}
      ${rsRow('18:00', '30 min', 'Gasten begeleiden naar de zaal', 'Joren Nagels · planner')}
      ${rsRow('18:30', '2u30', 'Diner, vier gangen · 120 couverts', 'Traiteur Vermeulen')}
      ${rsRow('19:00', '60 min', 'Opbouw booth en geluid in de spiegelzaal', 'DJ Ravage', 'Stroom: 2 × 16A aan de noordmuur, achter het gordijn. Laden via de zijingang.')}
      ${rsRow('21:00', '20 min', 'Taart aansnijden', 'Traiteur Vermeulen')}
      ${rsBlock('Feest', '21:30 → 04:00')}
      ${rsRow('21:30', '10 min', 'Openingsdans', 'DJ Ravage', 'Nummer wordt uiterlijk 1 juni doorgegeven')}
      ${rsRow('21:40', '5u20', 'Feest tot 03:00', 'DJ Ravage', 'Geluidsnorm kasteel: 95 dB(A). Na 01:00 ramen dicht.')}
      ${rsRow('23:00', '45 min', 'Middernachtsnack', 'Traiteur Vermeulen')}
      ${rsRow('02:00', '60 min', 'Afbouw bar en keuken', 'Traiteur Vermeulen')}
      ${rsRow('03:00', '45 min', 'Afbouw booth en geluid', 'DJ Ravage')}
      ${rsRow('04:00', '—', 'Zaal leeg, sleutel terug bij de conciërge', 'Joren Nagels · planner')}
    </div>`)}
  </div>`

  return shell({ wedding: LOTTE, weddingActive: 'Draaiboek' }, body, { w: 1440, h: 1180, max: 1152 })
}

/* ========================================================================== *
 * RunSheetPhone.dc.html -- the same run sheet on the day itself.
 *
 * "The day-of surface is a phone. Deliberately responsive web, not a native app."
 * No painted status bar: the real one renders on top of this.
 * ========================================================================== */

function phoneRow(time, what, who, { state = 'todo', dur = '' } = {}) {
  const done = state === 'done'
  const now = state === 'now'
  return `<div style="display:flex;gap:12px;padding:12px 16px;border-top:1px solid var(--border);min-height:64px;${now ? 'background:var(--accent);' : ''}">
    <span style="flex:0 0 46px;font-size:15px;font-weight:${now ? 600 : 500};font-variant-numeric:tabular-nums;${done ? 'color:var(--muted-foreground);' : ''}">${time}</span>
    <span style="flex:1 1 auto;min-width:0;">
      <span style="display:block;font-size:15px;line-height:1.35;${done ? 'color:var(--muted-foreground);' : ''}">${what}</span>
      <span style="display:flex;align-items:center;gap:8px;margin-top:4px;font-size:12px;color:var(--muted-foreground);">
        ${who}${dur ? ' · ' + dur : ''}</span>
    </span>
    ${who.includes('·') || done ? '' : `<span style="flex:0 0 44px;height:44px;display:grid;place-items:center;border:1px solid var(--input);border-radius:var(--radius);color:var(--foreground);">${icon('phone', 18)}</span>`}
  </div>`
}

export function RunSheetPhone() {
  const body = `<div style="width:390px;min-height:844px;background:var(--background);display:flex;flex-direction:column;">
    <header style="padding:14px 16px 12px;border-bottom:1px solid var(--border);background:var(--card);">
      <div style="display:flex;align-items:center;gap:10px;">
        <span style="display:grid;place-items:center;width:44px;height:44px;margin-left:-10px;">${icon('menu', 20)}</span>
        <span style="flex:1 1 auto;min-width:0;">
          <span class="trunc" style="display:block;font-size:15px;font-weight:600;">Lotte &amp; Bram</span>
          <span class="trunc" style="display:block;font-size:12px;color:var(--muted-foreground);">Draaiboek · zaterdag 12 juni</span>
        </span>
        <span style="display:grid;place-items:center;width:44px;height:44px;">${icon('download', 20)}</span>
      </div>
    </header>

    <div style="padding:14px 16px;background:var(--card);border-bottom:1px solid var(--border);">
      <p class="eyebrow" style="margin:0 0 6px;">Nu · 15:42</p>
      <p style="margin:0;font-size:17px;line-height:1.35;font-weight:600;">Felicitaties en groepsfoto op de trap</p>
      <p style="margin:6px 0 0;font-size:13px;color:var(--muted-foreground);">Studio Lens · nog 3 minuten</p>
      <div style="margin-top:12px;display:flex;gap:8px;">
        <span style="flex:1 1 auto;display:inline-flex;align-items:center;justify-content:center;gap:8px;height:44px;border-radius:var(--radius);background:var(--primary);color:var(--primary-foreground);font-size:14px;font-weight:600;">${icon('check', 16)}Afgevinkt</span>
        <span style="flex:0 0 44px;display:grid;place-items:center;height:44px;border:1px solid var(--input);border-radius:var(--radius);">${icon('phone', 18)}</span>
      </div>
    </div>

    <div style="flex:1 1 auto;background:var(--card);">
      ${phoneRow('14:30', 'Gasten ontvangen met welkomstdrink', 'Personeel kasteel', { state: 'done' })}
      ${phoneRow('15:00', 'Ceremonie in de rozentuin', 'Ceremoniemeester Jo', { state: 'done' })}
      ${phoneRow('15:45', 'Felicitaties en groepsfoto op de trap', 'Studio Lens', { state: 'now', dur: '30 min' })}
      ${phoneRow('16:15', 'Receptie op het terras', 'Traiteur Vermeulen', { dur: '90 min' })}
      ${phoneRow('17:45', 'Speech vader van de bruid', 'Ceremoniemeester Jo', { dur: '15 min' })}
      ${phoneRow('18:00', 'Gasten begeleiden naar de zaal', 'Joren Nagels · planner', { dur: '30 min' })}
      ${phoneRow('18:30', 'Diner, vier gangen · 120 couverts', 'Traiteur Vermeulen', { dur: '2u30' })}
      ${phoneRow('21:00', 'Taart aansnijden', 'Traiteur Vermeulen', { dur: '20 min' })}
    </div>
  </div>`

  return page({ w: 390, h: 844, body })
}

/* ========================================================================== *
 * Files.dc.html -- P15. S3 + signed URLs; visibility is per file, same word as
 * on a task, because a planner should never have to learn it twice.
 * ========================================================================== */

function fileRow(name, kind, size, who, when, shared) {
  return `<div style="display:grid;grid-template-columns:minmax(0,1fr) 96px 150px 110px 150px;align-items:center;gap:0 12px;height:52px;padding:0 var(--cell-x);border-top:1px solid var(--border);">
    <span style="display:flex;align-items:center;gap:10px;min-width:0;">
      <span style="flex:0 0 auto;color:var(--muted-foreground);">${icon(kind === 'image' ? 'image' : 'pdf', 18)}</span>
      <span class="trunc" style="font-size:14px;">${name}</span>
    </span>
    <span class="num" style="font-size:13px;color:var(--muted-foreground);">${size}</span>
    <span class="trunc" style="font-size:13px;color:var(--muted-foreground);">${who}</span>
    <span class="num" style="font-size:13px;color:var(--muted-foreground);">${when}</span>
    <span style="display:flex;justify-content:flex-end;">${shared ? chip('Gedeeld', 'attending', { icon: 'eye' }) : chip('Intern', 'plusone', { icon: 'lock' })}</span>
  </div>`
}

function fileGroup(name, n) {
  return `<div style="display:grid;grid-template-columns:minmax(0,1fr) 96px 150px 110px 150px;height:34px;align-items:center;padding:0 var(--cell-x);border-top:1px solid var(--border);background:var(--muted);">
    <span style="font-size:13px;font-weight:600;">${name} <span style="font-weight:400;color:var(--muted-foreground);">${n}</span></span>
  </div>`
}

export function Files() {
  const body = `
  ${pageHead('Bestanden', {
    eyebrow: 'Lotte &amp; Bram · 12 juni 2027',
    sub: '12 bestanden · 9 gedeeld met het koppel · 10,2 MB',
    right: btn('Uploaden', { icon: 'plus', variant: 'primary' }),
  })}

  <div style="margin-top:22px;">
    <div style="display:grid;grid-template-columns:minmax(0,1fr) 96px 150px 110px 150px;gap:0 12px;padding:0 var(--cell-x) 8px;">
      <span class="eyebrow">Bestand</span><span class="eyebrow num">Grootte</span>
      <span class="eyebrow">Toegevoegd door</span><span class="eyebrow num">Wanneer</span>
      <span class="eyebrow" style="text-align:right;">Zichtbaarheid</span>
    </div>
    ${card(`<div>
      ${fileGroup('Contracten', 5)}
      ${fileRow('Kasteel van Brasschaat — contract.pdf', 'PDF', '1,2 MB', 'Joren Nagels', '12 mrt', true)}
      ${fileRow('Traiteur Vermeulen — contract.pdf', 'PDF', '840 kB', 'Joren Nagels', '3 apr', true)}
      ${fileRow('Studio Lens — contract.pdf', 'PDF', '512 kB', 'Joren Nagels', '3 apr', true)}
      ${fileRow('Studio Vero — opdrachtbevestiging.pdf', 'PDF', '318 kB', 'Joren Nagels', '2 mrt', true)}
      ${fileRow('Marge-overzicht Q2.pdf', 'PDF', '96 kB', 'Joren Nagels', '14 aug', false)}
      ${fileGroup('Plattegronden', 3)}
      ${fileRow('Spiegelzaal — tafelplan v3.pdf', 'PDF', '2,4 MB', 'Joren Nagels', '1 sep', true)}
      ${fileRow('Rozentuin — opstelling ceremonie.jpg', 'image', '1,8 MB', 'Ann Peeters', '28 aug', true)}
      ${fileRow('Regenscenario — spiegelzaal.pdf', 'PDF', '1,6 MB', 'Joren Nagels', '28 aug', true)}
      ${fileGroup('Offertes', 4)}
      ${fileRow('Bloemhuis Dupont — offerte 1.pdf', 'PDF', '204 kB', 'Joren Nagels', '20 aug', false)}
      ${fileRow('DJ Ravage — offerte.pdf', 'PDF', '188 kB', 'Joren Nagels', '15 aug', true)}
      ${fileRow('Traiteur Vermeulen — offerte 2, na onderhandeling.pdf', 'PDF', '420 kB', 'Joren Nagels', '2 apr', true)}
      ${fileRow('Kasteel van Brasschaat — offerte zaalhuur.pdf', 'PDF', '600 kB', 'Joren Nagels', '4 mrt', false)}
    </div>
    <div style="border-top:1px dashed var(--input);padding:22px var(--cell-x);text-align:center;">
      <p style="margin:0;font-size:13px;color:var(--muted-foreground);">Sleep bestanden hierheen, of klik om te uploaden</p>
      <p style="margin:5px 0 0;font-size:12px;color:var(--muted-foreground);">
        Nieuwe bestanden staan standaard op <strong style="color:var(--foreground);font-weight:500;">intern</strong>.
        Delen is dan een keuze, geen vergissing.</p>
    </div>`)}
  </div>`

  return shell({ wedding: LOTTE, weddingActive: 'Bestanden' }, body, { w: 1440, h: 980, max: 1152 })
}
