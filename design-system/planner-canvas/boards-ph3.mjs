import {
  avatar, btn, card, chip, icon, monogram, page, pageHead, segmented, shell, shortNL,
} from './lib.mjs'
import { LOTTE } from './boards-layout.mjs'

/* ========================================================================== *
 * Moodboard.dc.html -- P21, decided on the 2026-08-29 planner calls and reversing
 * the "not building" line.
 *
 * A NATIVE image board, not a Pinterest embed: v5 of that API exposes only your own
 * account's data, needs app review with a video demo, and its terms bar caching pin
 * data. The value planners asked for is the couple's feedback landing HERE instead
 * of in a WhatsApp thread nobody can find in April -- so the comment rail is the
 * feature and the grid is the container.
 *
 * The tiles are honest placeholders. There are no product images in this repo, and
 * a stock photo would say something about the visual direction that nobody decided.
 * ========================================================================== */

const TINTS = ['attending', 'awaiting', 'partial', 'plusone', 'declined']

function tile(caption, h, i, { comments = 0, selected = false } = {}) {
  const t = TINTS[i % TINTS.length]
  return `<figure style="margin:0;break-inside:avoid;">
    <div style="position:relative;height:${h}px;border-radius:var(--radius);border:1px solid ${selected ? 'var(--primary)' : 'var(--border)'};background:var(--st-${t}-bg);display:grid;place-items:center;color:var(--st-${t}-fg);${selected ? 'box-shadow:0 0 0 2px var(--ring);' : ''}">
      <span style="opacity:.35;">${icon('image', 30)}</span>
      ${comments ? `<span style="position:absolute;right:8px;bottom:8px;display:inline-flex;align-items:center;gap:5px;padding:3px 8px;border-radius:999px;background:var(--card);border:1px solid var(--border);font-size:12px;color:var(--muted-foreground);">${icon('comment', 13)}${comments}</span>` : ''}
    </div>
    <figcaption class="trunc" style="margin-top:6px;font-size:12px;color:var(--muted-foreground);">${caption}</figcaption>
  </figure>`
}

function mbComment(who, when, text) {
  return `<div style="display:flex;gap:9px;padding:12px 0;border-top:1px solid var(--border);">
    ${avatar(who, 24)}
    <div style="min-width:0;flex:1 1 auto;">
      <p style="margin:0;font-size:12px;"><strong style="font-weight:600;">${who}</strong>
        <span style="color:var(--muted-foreground);"> · ${when}</span></p>
      <p style="margin:4px 0 0;font-size:13px;line-height:1.55;">${text}</p>
    </div>
  </div>`
}

export function Moodboard() {
  const grid = `<div style="columns:3;column-gap:14px;">
    ${[
      ['Ranonkels, gebroken wit', 200, 0, 3, true],
      ['Tafelloper, ongebleekt linnen', 150, 1, 0],
      ['Kaarsen in glazen houders', 230, 2, 1],
      ['Menukaart, letterpress', 170, 3, 2],
      ['Boeket, losse vorm', 260, 4, 0],
      ['Stoelen kasteel, hout', 140, 0, 0],
      ['Servetten, oud roze', 190, 1, 1],
      ['Naamkaartjes, handgeschreven', 160, 2, 0],
      ['Taart, ongeglazuurd', 220, 3, 4],
    ].map(([c, h, i, n, sel]) => `<div style="margin-bottom:14px;">${tile(c, h, i, { comments: n, selected: !!sel })}</div>`).join('')}
  </div>`

  const body = `
  ${pageHead('Moodboard', {
    eyebrow: 'Lotte &amp; Bram · 12 juni 2027',
    sub: '9 beelden · 11 reacties · gedeeld met Lotte en Bram',
    right: `${btn('Delen', { icon: 'eye' })}${btn('Beelden toevoegen', { icon: 'plus', variant: 'primary' })}`,
  })}

  <div style="margin-top:18px;display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;">
    ${segmented(['Alles', 'Bloemen', 'Tafels', 'Papierwaren', 'Taart'], 0)}
    <p style="margin:0;font-size:13px;color:var(--muted-foreground);">Sleep om te herschikken</p>
  </div>

  <div style="margin-top:20px;display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:20px;align-items:start;">
    ${grid}

    <div style="position:sticky;top:20px;">
      ${card(`<div>
        <div style="height:150px;background:var(--st-attending-bg);display:grid;place-items:center;color:var(--st-attending-fg);"><span style="opacity:.35;">${icon('image', 30)}</span></div>
        <div style="padding:14px;">
          <p style="margin:0;font-size:14px;font-weight:500;">Ranonkels, gebroken wit</p>
          <p style="margin:4px 0 0;font-size:12px;color:var(--muted-foreground);">Toegevoegd door Joren Nagels · 28 augustus</p>
          <div style="margin-top:12px;">
            <p class="eyebrow" style="margin:0;">Reacties · 3</p>
            ${mbComment('Lotte Peeters', '2 dagen', 'Dit is precies de tint die ik bedoelde. Kan dit ook in het boeket?')}
            ${mbComment('Bram Willems', '2 dagen', 'Van mij mag het iets losser, minder strak gebonden.')}
            ${mbComment('Joren Nagels', 'gisteren', 'Doorgestuurd naar Bloemhuis Dupont bij de tweede offerte-aanvraag.')}
            <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border);">
              <div style="min-height:44px;padding:9px 11px;border:1px solid var(--input);border-radius:var(--radius);font-size:13px;color:var(--muted-foreground);">Reageer op dit beeld…</div>
            </div>
          </div>
        </div>
      </div>`)}

      <p style="margin:12px 2px 0;font-size:13px;line-height:1.6;color:var(--muted-foreground);">
        Vandaag: downloaden van Pinterest, schikken in Canva, link in de groepschat. De reacties staan dan
        op drie plekken en tegen april vindt niemand ze nog terug.</p>
    </div>
  </div>`

  return shell({ wedding: LOTTE, weddingActive: 'Moodboard' }, body, { w: 1440, h: 1120, max: 1152 })
}

/* ========================================================================== *
 * VendorSlice.dc.html -- P18. What DJ Ravage sees, and only that.
 *
 * "Scoped so a vendor sees their own rows, not the budget." No sidebar, no org
 * head, no account menu: this surface is reached by a link, and whether a vendor
 * gets an account at all is still open (PRODUCT.md). Drawing it link-first keeps
 * both answers available -- an account can be added above this page, but a page
 * built around an account cannot be un-built into a link.
 * ========================================================================== */

export function VendorSlice() {
  const row = (time, dur, what, note = '') => `<div style="display:grid;grid-template-columns:74px 62px minmax(0,1fr);align-items:start;gap:0 12px;padding:12px var(--cell-x);border-top:1px solid var(--border);">
    <span style="font-size:15px;font-weight:500;font-variant-numeric:tabular-nums;">${time}</span>
    <span style="font-size:12px;font-variant-numeric:tabular-nums;color:var(--muted-foreground);padding-top:2px;">${dur}</span>
    <span style="min-width:0;"><span style="display:block;font-size:14px;">${what}</span>
      ${note ? `<span style="display:block;margin-top:3px;font-size:12px;line-height:1.55;color:var(--muted-foreground);">${note}</span>` : ''}</span>
  </div>`

  const body = `<div style="width:900px;min-height:780px;background:var(--background);">
    <div style="max-width:760px;margin:0 auto;padding:36px 24px 44px;">
      <header style="display:flex;align-items:flex-start;justify-content:space-between;gap:20px;">
        <div>
          <p class="eyebrow" style="margin:0 0 6px;">Draaiboek · jouw rijen</p>
          <h1 style="margin:0;font-size:24px;line-height:1.25;font-weight:600;letter-spacing:-0.02em;">Lotte &amp; Bram</h1>
          <p style="margin:7px 0 0;font-size:14px;color:var(--muted-foreground);">
            zaterdag 12 juni 2027 · Kasteel van Brasschaat</p>
        </div>
        <div style="text-align:right;">
          <p style="margin:0;font-size:12px;color:var(--muted-foreground);">Gedeeld door</p>
          <div style="margin-top:6px;display:flex;align-items:center;gap:8px;justify-content:flex-end;">
            ${monogram('Studio Vero', { size: 24, round: 5, font: 10 })}
            <span style="font-size:13px;font-weight:500;">Studio Vero</span>
          </div>
        </div>
      </header>

      <div style="margin-top:20px;padding:13px 15px;border:1px solid var(--border);border-radius:var(--radius);background:var(--card);display:flex;gap:11px;align-items:flex-start;">
        <span style="flex:0 0 auto;color:var(--muted-foreground);margin-top:1px;">${icon('lock', 17)}</span>
        <p style="margin:0;font-size:13px;line-height:1.6;color:var(--muted-foreground);">
          Je ziet <strong style="color:var(--foreground);font-weight:500;">alleen de rijen waarop DJ Ravage staat</strong>.
          De rest van de dag, het budget en de gastenlijst zitten niet in deze link.</p>
      </div>

      <h2 style="margin:28px 0 10px;font-size:15px;font-weight:600;">Jouw rijen · 4</h2>
      ${card(`<div>
        ${row('19:00', '60 min', 'Opbouw booth en geluid in de spiegelzaal', 'Stroom: 2 × 16A aan de noordmuur, achter het gordijn. Laden via de zijingang.')}
        ${row('21:30', '10 min', 'Openingsdans', 'Nummer wordt uiterlijk 1 juni doorgegeven door het koppel.')}
        ${row('21:40', '5u20', 'Feest tot 03:00', 'Geluidsnorm kasteel: 95 dB(A). Na 01:00 ramen dicht.')}
        ${row('03:00', '45 min', 'Afbouw booth en geluid', 'De zaal moet om 04:00 leeg zijn.')}
      </div>`)}

      <h2 style="margin:28px 0 10px;font-size:15px;font-weight:600;">Wat we van jou nodig hebben · 2</h2>
      ${card(`<div>
        <div style="display:flex;align-items:center;gap:12px;height:var(--row-h);padding:0 var(--cell-x);">
          <span style="flex:1 1 auto;font-size:14px;">Ondertekend contract terugsturen</span>
          ${chip('Te laat', 'alert')}
          <span class="num" style="flex:0 0 90px;font-size:13px;color:var(--st-alert-fg);font-weight:500;">${shortNL('2026-09-04')}</span>
        </div>
        <div style="display:flex;align-items:center;gap:12px;height:var(--row-h);padding:0 var(--cell-x);border-top:1px solid var(--border);">
          <span style="flex:1 1 auto;font-size:14px;">Technische fiche geluid bezorgen</span>
          ${chip('Open', 'awaiting')}
          <span class="num" style="flex:0 0 90px;font-size:13px;color:var(--muted-foreground);">${shortNL('2027-05-01')}</span>
        </div>
      </div>`)}

      <div style="margin-top:24px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
        ${btn('PDF opslaan', { icon: 'download' })}
        ${btn('Vraag stellen aan Studio Vero', { icon: 'comment' })}
      </div>

      <p style="margin:26px 0 0;font-size:12px;line-height:1.6;color:var(--muted-foreground);">
        Deze link is persoonlijk en verloopt twee weken na de bruiloft. Wijzigingen in het draaiboek
        verschijnen hier vanzelf &mdash; er is geen versie om te downloaden en kwijt te raken.</p>
    </div>
  </div>`

  return page({ w: 900, h: 820, body })
}

/* ========================================================================== *
 * Team.dc.html -- P20 team seats.
 *
 * The screen exists to make one distinction visible that the schema has had since
 * the first migration and no UI has ever shown: org_members is staff, wedding_members
 * is the couple, editors and (from P18) vendors. They are different tables because
 * they are different kinds of person, and a UI that lists them together teaches the
 * planner the wrong model of who can see what.
 * ========================================================================== */

function memberRow(name, email, role, tone, weddings, note = '') {
  return `<div style="display:grid;grid-template-columns:minmax(0,1fr) 150px 130px 130px;align-items:center;gap:0 12px;height:56px;padding:0 var(--cell-x);border-top:1px solid var(--border);">
    <span style="display:flex;align-items:center;gap:10px;min-width:0;">
      ${avatar(name, 30)}
      <span style="min-width:0;"><span class="trunc" style="display:block;font-size:14px;font-weight:500;">${name}</span>
      <span class="trunc" style="display:block;font-size:12px;color:var(--muted-foreground);">${email}</span></span>
    </span>
    <span>${chip(role, tone)}</span>
    <span style="font-size:13px;color:var(--muted-foreground);">${weddings}</span>
    <span class="trunc" style="font-size:12px;text-align:right;color:var(--muted-foreground);">${note}</span>
  </div>`
}

const PEOPLE = ['Joren Nagels', 'Sofie Claes', 'An De Wilde']

function matrixRow(wedding, date, cells, couple) {
  return `<div style="display:grid;grid-template-columns:minmax(0,1fr) repeat(3,84px) 150px;align-items:center;gap:0 12px;height:var(--row-h);padding:0 var(--cell-x);border-top:1px solid var(--border);">
    <span style="min-width:0;"><span class="trunc" style="display:block;font-size:14px;">${wedding}</span>
      <span class="trunc" style="display:block;font-size:12px;font-variant-numeric:tabular-nums;color:var(--muted-foreground);">${date}</span></span>
    ${cells.map((c) => `<span style="display:grid;place-items:center;color:${c ? 'var(--primary)' : 'var(--border)'};">${c ? icon('check', 17, { stroke: 2 }) : '<span style="width:11px;height:1px;background:var(--border);display:block;"></span>'}</span>`).join('')}
    <span style="font-size:13px;text-align:right;color:var(--muted-foreground);">${couple}</span>
  </div>`
}

export function Team() {
  const body = `
  ${pageHead('Team', {
    sub: 'Studio Vero · Studio-abonnement, onbeperkte bruiloften en extra teamleden',
    right: btn('Iemand uitnodigen', { icon: 'plus', variant: 'primary' }),
  })}

  <section style="margin-top:26px;">
    <div style="display:flex;align-items:baseline;gap:10px;padding:0 var(--cell-x) 8px;">
      <h2 style="margin:0;font-size:14px;font-weight:600;">Organisatie</h2>
      <code class="mono" style="font-size:11px;color:var(--muted-foreground);">org_members</code>
      <span style="font-size:13px;color:var(--muted-foreground);">· eigenaar en beheerder zien alle bruiloften, een medewerker alleen de toegewezen</span>
    </div>
    ${card(`<div>
      <div style="display:grid;grid-template-columns:minmax(0,1fr) 150px 130px 130px;gap:0 12px;padding:8px var(--cell-x);">
        <span class="eyebrow">Persoon</span><span class="eyebrow">Rol</span>
        <span class="eyebrow">Bruiloften</span><span class="eyebrow" style="text-align:right;">Laatst actief</span>
      </div>
      ${memberRow('Joren Nagels', 'joren@studiovero.be', 'Eigenaar', 'declined', 'alle 12', 'nu')}
      ${memberRow('Sofie Claes', 'sofie@studiovero.be', 'Medewerker', 'declined', '3 toegewezen', '2 uur geleden')}
      ${memberRow('An De Wilde', 'an@studiovero.be', 'Uitgenodigd', 'awaiting', '—', 'nog niet aangemeld')}
    </div>`)}
    <p style="margin:10px 2px 0;font-size:13px;line-height:1.6;color:var(--muted-foreground);max-width:80ch;">
      Een <strong style="color:var(--foreground);font-weight:500;">medewerker</strong> heeft geen organisatiebrede blik:
      die ziet precies de bruiloften waarop ze staat. Dat is geen instelling die aan of uit kan, maar de vorm van de
      afscherming zelf &mdash; er bestaat voor haar geen zoekopdracht die de rest teruggeeft.</p>
  </section>

  <section style="margin-top:30px;">
    <div style="display:flex;align-items:baseline;gap:10px;padding:0 var(--cell-x) 8px;">
      <h2 style="margin:0;font-size:14px;font-weight:600;">Toewijzing per bruiloft</h2>
      <span style="font-size:13px;color:var(--muted-foreground);">· 5 actieve bruiloften</span>
    </div>
    ${card(`<div>
      <div style="display:grid;grid-template-columns:minmax(0,1fr) repeat(3,84px) 150px;gap:0 12px;padding:8px var(--cell-x);">
        <span class="eyebrow">Bruiloft</span>
        ${PEOPLE.map((p) => `<span class="eyebrow" style="text-align:center;">${p.split(' ')[0]}</span>`).join('')}
        <span class="eyebrow" style="text-align:right;">Koppel &amp; leveranciers</span>
      </div>
      ${matrixRow('Marie &amp; Tom', '19 september 2026', [true, true, false], '2 koppel')}
      ${matrixRow('Hanne &amp; Seppe', '2 mei 2027', [true, false, false], '2 koppel')}
      ${matrixRow('Lotte &amp; Bram', '12 juni 2027', [true, true, false], '2 koppel · 1 leverancier')}
      ${matrixRow('Amina &amp; Youssef', '3 juli 2027', [true, false, false], '2 koppel')}
      ${matrixRow('Fien &amp; Wout', '29 augustus 2027', [true, true, false], '1 koppel')}
    </div>`)}
  </section>

  <section style="margin-top:30px;">
    <div style="display:flex;align-items:baseline;gap:10px;padding:0 var(--cell-x) 8px;">
      <h2 style="margin:0;font-size:14px;font-weight:600;">Per bruiloft uitgenodigd</h2>
      <code class="mono" style="font-size:11px;color:var(--muted-foreground);">wedding_members</code>
      <span style="font-size:13px;color:var(--muted-foreground);">· nooit organisatielid, nooit organisatiebreed</span>
    </div>
    ${card(`<div>
      ${memberRow('Lotte Peeters', 'lotte@…', 'Koppel', 'partial', 'Lotte &amp; Bram', 'gisteren')}
      ${memberRow('Bram Willems', 'bram@…', 'Koppel', 'partial', 'Lotte &amp; Bram', '4 dagen geleden')}
      ${memberRow('Kevin Maes · DJ Ravage', 'kevin@…', 'Leverancier', 'plusone', 'Lotte &amp; Bram', 'nog niet aangemeld')}
    </div>`)}
    <p style="margin:10px 2px 0;font-size:13px;line-height:1.6;color:var(--muted-foreground);max-width:80ch;">
      Wie geen rol in de organisatie heeft, <em>moet</em> aan één bruiloft hangen. Zonder dat valt de afscherming
      terug op organisatiebreed en leest een koppel het volledige boek van de planner &mdash; het is de reden dat
      dit twee tabellen zijn en niet één met een kolom erbij.</p>
  </section>`

  return shell({ active: 'team' }, body, { w: 1440, h: 1140, max: 1152 })
}
