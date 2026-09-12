/**
 * Shared chrome for the planner-app design canvas.
 *
 * Values here are LIFTED, not invented: every colour is a token from
 * design-system/tokens.css -- a semantic one resolved to its light-mode primitive
 * where one exists, and otherwise a named primitive from section 1 (the Budget
 * bar's two tints, the outline pill's dot, the link hover). Those five are
 * declared below rather than pasted as hex, because tokens.css calls primitives
 * "never referenced in a component" and a raw hex in the markup is how that rule
 * gets broken quietly. Every
 * measurement comes from the component that already ships it --
 * apps/web/src/components/nav/{shell,nav-item,org-head,monogram,account-menu}.tsx.
 * Where a number looks arbitrary (38px rows, 28px monogram, 6px inner radius) it is
 * a Tailwind class in that source, named in the comment beside it.
 *
 * The artboards share nothing at runtime -- each .dc.html is its own sandboxed
 * iframe -- so the sidebar is emitted into every one of them from here rather than
 * hand-copied sixteen times.
 */

export const TOKENS = `
:root{
  /* Primitives, section 1 of tokens.css. Only the handful the boards genuinely
     reach for: a mid-teal and a mid-neutral for the budget bar's segments (no
     semantic token means "the same thing, one step lighter"), a neutral for the
     outline pill's dot, and teal-700 for a:hover. */
  --teal-400:#78C6BF; --teal-700:#2C7D77;
  --neutral-300:#CDC9C5; --neutral-500:#A39D98; --neutral-1000:#181715;

  --background:#F7F6F5; --foreground:#474441;
  --card:#FFFFFF; --card-foreground:#474441;
  --popover:#FFFFFF;
  --muted:#EEECEA; --muted-foreground:#5C5854;
  --secondary:#EEECEA; --secondary-foreground:#5C5854;
  --primary:#206560; --primary-foreground:#FFFFFF;
  --accent:#F7ECD4; --accent-foreground:#554111;
  --destructive:#A94F4A; --destructive-foreground:#FFFFFF;
  --border:#DEDBD7; --input:#8A8580; --ring:#3E9790;

  --st-attending-bg:#DEF4E1; --st-attending-fg:#32663F; --st-attending-dot:#417E50;
  --st-declined-bg:#EEECEA;  --st-declined-fg:#5C5854;  --st-declined-dot:#726E69;
  --st-awaiting-bg:#FFE7D5;  --st-awaiting-fg:#7E4A1D;  --st-awaiting-dot:#9C5D28;
  --st-partial-bg:#DCEFFF;   --st-partial-fg:#2F5C85;   --st-partial-dot:#3D73A4;
  --st-plusone-bg:#F7ECD4;   --st-plusone-fg:#6E5416;   --st-plusone-dot:#886A20;
  --st-alert-bg:#FFE3DF;     --st-alert-fg:#893E3A;     --st-alert-dot:#A94F4A;

  --series-1:#00968C; --series-2:#A37000; --series-3:#005FB7;
  --series-grid:#DEDBD7; --series-axis:#5C5854;

  --row-h:44px; --cell-x:0.8rem; --control-h:36px;
  --radius:0.5rem; --ring-width:2px; --ring-offset:2px;
}
.dark{
  --background:#181715; --foreground:#EEECEA;
  --card:#2C2A27; --card-foreground:#EEECEA;
  --popover:#2C2A27;
  --muted:#474441; --muted-foreground:#BAB5B0;
  --secondary:#5C5854; --secondary-foreground:#EEECEA;
  --primary:#9AD8D2; --primary-foreground:#0A312E;
  --accent:#554111; --accent-foreground:#EDD9B0;
  --destructive:#F9978F;
  --border:#5C5854; --input:#A39D98; --ring:#78C6BF;
  --st-attending-bg:#264F30; --st-attending-fg:#C1E7C8; --st-attending-dot:#88C895;
  --st-declined-bg:#474441;  --st-declined-fg:#DEDBD7;  --st-declined-dot:#BAB5B0;
  --st-awaiting-bg:#623916;  --st-awaiting-fg:#FCD2B3;  --st-awaiting-dot:#E9A570;
  --st-partial-bg:#244768;   --st-partial-fg:#BEE0FF;   --st-partial-dot:#83BBF1;
  --st-plusone-bg:#554111;   --st-plusone-fg:#EDD9B0;   --st-plusone-dot:#D2B16B;
  --st-alert-bg:#6B302C;     --st-alert-fg:#FFCAC4;     --st-alert-dot:#F9978F;
}`

export const BASE = `
*{box-sizing:border-box;border-color:var(--border);}
body{margin:0;background:var(--background);color:var(--foreground);
  font-family:"Inter","Inter Variable",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
  font-size:14px;line-height:1.45;-webkit-font-smoothing:antialiased;}
a{color:var(--primary);text-decoration:none;}
a:hover{color:var(--teal-700);}
.num{text-align:right;font-variant-numeric:tabular-nums;}
.mono{font-family:"JetBrains Mono",ui-monospace,SFMono-Regular,Menlo,monospace;}
/* text-[0.6875rem] + tracking-[0.08em] + uppercase + semibold -- the section-label
   recipe used by MenuLabel, the wedding section head and the palette groups. */
.eyebrow{font-size:0.6875rem;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;
  color:var(--muted-foreground);}
.trunc{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}`

/* ---------- dates ---------------------------------------------------------- *
 * The boards state a T-minus offset and the date it resolves to, side by side --
 * that pairing IS item P8, so a typed date that disagrees with its own offset is
 * the one error this canvas cannot afford. Six of them were typed and four were
 * wrong. They are computed now.
 *
 * UTC throughout, for the reason weddings/page.tsx already gives: a wedding date
 * is a local civil date, and formatting it in a zone west of Greenwich renders
 * the day before.
 * ---------------------------------------------------------------------------- */

const DAY = 86400000
export const WEDDING_ISO = '2027-06-12'
export const TODAY_ISO = '2026-09-12'

const at = (isoDate) => new Date(`${isoDate}T00:00:00Z`)

/** A date from a due_offset_days value: -270 is 270 days before the wedding. */
export const fromOffset = (n) => new Date(at(WEDDING_ISO).getTime() + n * DAY)

const asDate = (x) => (typeof x === 'number' ? fromOffset(x) : at(x))

const fmt = (opts, d) => new Intl.DateTimeFormat('nl-BE', { ...opts, timeZone: 'UTC' }).format(d)

/** "za 5 sep" -- takes an ISO date or an offset. */
export const shortNL = (x) => fmt({ weekday: 'short', day: 'numeric', month: 'short' }, asDate(x))
/** "za 5 sep 2026" */
export const shortYearNL = (x) => fmt({ weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }, asDate(x))
/** "zaterdag 5 september 2026" */
export const longNL = (x) => fmt({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }, asDate(x))
/** Overdue against the canvas's fixed "today". */
export const isLate = (x) => asDate(x).getTime() < at(TODAY_ISO).getTime()
/** The offset a date sits at, so a board can state one it did not start from. */
export const offsetOf = (isoDate) => Math.round((at(isoDate) - at(WEDDING_ISO)) / DAY)

/** Stroke-1.5 24-grid glyphs, the exact geometry of components/nav/icons.tsx where one exists. */
const PATHS = {
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  weddings: '<circle cx="9" cy="14" r="6"/><circle cx="15" cy="14" r="6"/>',
  overview: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M8 4v5"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  chevronRight: '<path d="m9 6 6 6-6 6"/>',
  check: '<path d="m5 13 4 4L19 7"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  collapse: '<path d="M15 6l-6 6 6 6"/><path d="M4 5v14"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  // new sections -- same 24-grid, same 1.5 stroke, so they sit in the existing set
  today: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4.5l3 1.8"/>',
  tasks: '<path d="M4 7h2l1.5 1.5L11 5"/><path d="M4 17h2l1.5 1.5L11 15"/><path d="M14 7h6M14 17h6"/>',
  budget: '<path d="M4 8h16M4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z"/><path d="M15 13.5h2"/>',
  payments: '<rect x="3" y="5" width="18" height="15" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/><path d="M8 14h3"/>',
  vendors: '<path d="M4 20v-1a4 4 0 0 1 4-4h2a4 4 0 0 1 4 4v1"/><circle cx="9" cy="8" r="3"/><path d="M16 11h4M18 9v4"/>',
  runsheet: '<path d="M5 4h11l3 3v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z"/><path d="M8 11h8M8 15h5M8 7h4"/>',
  files: '<path d="M4 7a2 2 0 0 1 2-2h3l2 2.5h7a2 2 0 0 1 2 2V18a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1Z"/>',
  moodboard: '<rect x="3" y="4" width="8" height="7" rx="1"/><rect x="13" y="4" width="8" height="11" rx="1"/><rect x="3" y="13" width="8" height="7" rx="1"/><rect x="13" y="17" width="8" height="3" rx="1"/>',
  team: '<circle cx="9" cy="8" r="3"/><path d="M3 19v-1a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v1"/><path d="M16 5.5a3 3 0 0 1 0 5.8M17 14h.6a4 4 0 0 1 4 4v1"/>',
  lock: '<rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7.5a4 4 0 0 1 8 0V10"/>',
  eye: '<path d="M2.5 12S6 6 12 6s9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.5"/>',
  comment: '<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v9a1.5 1.5 0 0 1-1.5 1.5H9l-5 4Z"/>',
  download: '<path d="M12 4v10m0 0 4-4m-4 4-4-4"/><path d="M4 18h16"/>',
  filter: '<path d="M4 6h16M7 12h10M10 18h4"/>',
  warn: '<path d="M12 4.5 21 19H3Z"/><path d="M12 10v4M12 16.5v.5"/>',
  phone: '<path d="M6.5 4h3l1.5 4-2 1.5a11 11 0 0 0 5.5 5.5L16 13l4 1.5v3a2 2 0 0 1-2.2 2A15.5 15.5 0 0 1 4.5 6.2 2 2 0 0 1 6.5 4Z"/>',
  image: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="10" r="1.5"/><path d="m4 17 5-4.5 4 3.5 3-2.5 4 3.5"/>',
  pdf: '<path d="M6 3h8l4 4v14H6Z"/><path d="M14 3v4h4"/><path d="M9 13h1.5a1.2 1.2 0 0 1 0 2.4H9V13Zm0 5v-2.6"/>',
  archive: '<rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8"/><path d="M10 12h4"/>',
}

export function icon(name, size = 16, opts = {}) {
  const stroke = opts.stroke ?? 1.5
  const style = opts.style ? ` style="${opts.style}"` : ''
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"${style}>${PATHS[name]}</svg>`
}

/* ---------- primitives ---------------------------------------------------- */

const TINTS = ['attending', 'awaiting', 'partial', 'plusone']

/** monogram.tsx: hue is a sum of the name's code points mod 4, so it is stable per org. */
export function tintOf(name) {
  let sum = 0
  for (const ch of name) sum += ch.codePointAt(0)
  return TINTS[sum % TINTS.length]
}

export function initialsOf(name) {
  const w = name.trim().split(/\s+/).filter(Boolean)
  if (!w.length) return '?'
  return ((w[0][0] ?? '') + (w.length > 1 ? w[w.length - 1][0] : '')).toUpperCase()
}

/** size-7 (28px), 11px semibold, radius calc(var(--radius) - 2px) = 6px. */
export function monogram(name, { size = 28, round = 6, font = 11 } = {}) {
  const t = tintOf(name)
  return `<span style="display:grid;place-items:center;flex:0 0 auto;width:${size}px;height:${size}px;border-radius:${round === 999 ? '999px' : round + 'px'};font-size:${font}px;font-weight:600;font-variant-numeric:tabular-nums;background:var(--st-${t}-bg);color:var(--st-${t}-fg);">${initialsOf(name)}</span>`
}

/**
 * The status pill. Dot + word, never the dot alone -- research/08's rule, and the
 * reason it is a rule here is the venue printout: these screens get printed in
 * black and white and read on a phone in sun.
 */
export function chip(label, tone = 'declined', { icon: ic = null } = {}) {
  const g = ic ? icon(ic, 12) : `<span aria-hidden="true" style="width:6px;height:6px;border-radius:999px;flex:0 0 auto;background:var(--st-${tone}-dot);"></span>`
  return `<span style="display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:2px 8px;font-size:12px;line-height:1.5;white-space:nowrap;background:var(--st-${tone}-bg);color:var(--st-${tone}-fg);">${g}${label}</span>`
}

/** The bordered neutral pill weddings/page.tsx already ships for draft/live. */
export function outlinePill(label, strong = false) {
  return `<span style="display:inline-flex;align-items:center;gap:6px;border:1px solid var(--border);border-radius:999px;padding:2px 8px;font-size:12px;white-space:nowrap;color:var(--${strong ? 'foreground' : 'muted-foreground'});"><span aria-hidden="true" style="width:6px;height:6px;border-radius:999px;background:${strong ? 'var(--foreground)' : 'var(--neutral-500)'};"></span>${label}</span>`
}

/**
 * packages/ui/src/button.tsx is h-11 (44px) and full-width because it was written for the
 * sign-in card. Inside the dashboard the same shape at var(--control-h) is what the
 * density token is for, so these are that button at 36px with its own padding.
 */
export function btn(label, { variant = 'secondary', icon: ic = null, h = 36 } = {}) {
  const skin = variant === 'primary'
    ? 'background:var(--primary);color:var(--primary-foreground);border:1px solid transparent;font-weight:600;'
    : 'background:transparent;color:var(--foreground);border:1px solid var(--input);font-weight:500;'
  return `<button type="button" style="display:inline-flex;align-items:center;justify-content:center;gap:8px;height:${h}px;padding:0 12px;border-radius:var(--radius);font-size:14px;font-family:inherit;cursor:pointer;white-space:nowrap;${skin}">${ic ? icon(ic, 15) : ''}${label}</button>`
}

export function kbd(t) {
  return `<kbd style="flex:0 0 auto;border:1px solid var(--border);border-radius:4px;padding:0 4px;font-family:'JetBrains Mono',ui-monospace,Menlo,monospace;font-size:11px;color:var(--muted-foreground);">${t}</kbd>`
}

export function avatar(name, size = 22) {
  return monogram(name, { size, round: 999, font: 9 })
}

/* ---------- the sidebar --------------------------------------------------- */

const ROW_H = 38 // h-[calc(var(--control-h)+2px)]

export function navRow(label, ic, { active = false, badge = null, hint = null, collapsed = false } = {}) {
  const skin = active
    ? 'background:var(--muted);color:var(--foreground);font-weight:500;'
    : 'color:var(--muted-foreground);'
  if (collapsed) {
    // A button, not a div: on the rail the label is not rendered, so the name has
    // to live on the control -- which is what nav-item.tsx does, and what the
    // caption beside this on the Anatomy board claims. A div with an aria-label
    // is ignored by assistive tech (org-head.tsx's comment records the same trap),
    // so the caption would have been describing something that was not there.
    return `<button type="button" aria-label="${label}" title="${label}" style="display:flex;width:100%;align-items:center;justify-content:center;height:${ROW_H}px;padding:0;border:0;background:none;font:inherit;color:inherit;cursor:pointer;border-radius:var(--radius);${skin}">${icon(ic, 16)}</button>`
  }
  const right = badge
    ? `<span style="flex:0 0 auto;font-size:11px;font-variant-numeric:tabular-nums;color:var(--muted-foreground);">${badge}</span>`
    : hint ? kbd(hint) : ''
  return `<div style="display:flex;align-items:center;gap:10px;height:${ROW_H}px;padding:0 10px;border-radius:var(--radius);font-size:14px;${skin}">${icon(ic, 16)}<span class="trunc" style="flex:1 1 auto;">${label}</span>${right}</div>`
}

/**
 * The wedding-context section. Today shell.tsx renders exactly one row here
 * (Overzicht) and OMITS the unbuilt sections rather than greying them out --
 * docs/specs/0001. This is that list once PH1-PH3 have filled it in.
 */
export const WEDDING_SECTIONS = [
  ['Overzicht', 'overview', null],
  ['Taken', 'tasks', '12'],
  ['Budget', 'budget', null],
  ['Betalingen', 'payments', null],
  ['Leveranciers', 'vendors', null],
  ['Draaiboek', 'runsheet', null],
  ['Bestanden', 'files', null],
  ['Moodboard', 'moodboard', null],
]

export function sidebar({
  org = 'Studio Vero',
  user = 'Joren Nagels',
  active = null,
  wedding = null,
  weddingActive = null,
  collapsed = false,
  sections = WEDDING_SECTIONS,
  nav = null,
  dark = false,
} = {}) {
  const w = collapsed ? 56 : 240 // w-14 / w-60
  const pad = collapsed ? 'justify-content:center;' : 'padding:0 10px;'

  const head = `<div style="display:flex;align-items:center;gap:10px;height:44px;${pad}">
      ${monogram(org)}
      ${collapsed ? '' : `<span class="trunc" style="flex:1 1 auto;font-size:14px;font-weight:600;">${org}</span>${icon('chevron', 14, { style: 'opacity:.6;flex:0 0 auto;' })}`}
    </div>`

  const rows = nav ?? [
    ['Zoeken', 'search', 'search'],
    ['Vandaag', 'today', 'today', '5'],
    ['Bruiloften', 'weddings', 'weddings'],
    ['Sjablonen', 'archive', 'templates'],
    ['Team', 'team', 'team'],
  ]
  const globalNav = `<div style="display:flex;flex-direction:column;gap:2px;margin-top:4px;">
      ${rows.map(([label, ic, key, badge]) => navRow(label, ic, {
        active: active === key,
        badge: collapsed ? null : (badge ?? null),
        hint: key === 'search' ? '⌘K' : null,
        collapsed,
      })).join('')}
    </div>`

  const weddingBlock = wedding
    ? `<div style="display:flex;flex-direction:column;gap:2px;margin-top:16px;min-width:0;">
        ${collapsed
          ? '<hr style="border:0;border-top:1px solid var(--border);margin:4px 8px;">'
          : `<div style="padding:0 10px 4px;">
               <p class="eyebrow trunc" style="margin:0;">Deze bruiloft</p>
               <p class="trunc" style="margin:2px 0 0;font-size:14px;font-weight:500;">${wedding.name}</p>
               <p class="trunc" style="margin:2px 0 0;font-size:12px;font-variant-numeric:tabular-nums;color:var(--muted-foreground);">${wedding.date}</p>
             </div>`}
        ${sections.map(([label, ic, badge]) => navRow(label, ic, { active: weddingActive === label, badge: collapsed ? null : badge, collapsed })).join('')}
      </div>`
    : ''

  const foot = `<div style="flex:1 1 auto;"></div>
    ${navRow(collapsed ? 'Uitklappen' : 'Zijbalk inklappen', 'collapse', { collapsed })}
    <hr style="border:0;border-top:1px solid var(--border);margin:2px 0;">
    <div style="display:flex;align-items:center;gap:10px;height:44px;${pad}">
      ${monogram(user, { round: 999 })}
      ${collapsed ? '' : `<span class="trunc" style="flex:1 1 auto;font-size:14px;">${user}</span>${icon('chevron', 14, { style: 'opacity:.6;flex:0 0 auto;' })}`}
    </div>`

  return `<aside class="${dark ? 'dark' : ''}" style="width:${w}px;flex:0 0 ${w}px;border-right:1px solid var(--border);background:${dark ? 'var(--background)' : 'transparent'};color:var(--foreground);">
    <div style="display:flex;flex-direction:column;gap:4px;height:100%;padding:10px;">
      ${head}${globalNav}${weddingBlock}${foot}
    </div>
  </aside>`
}

/* ---------- page frame ---------------------------------------------------- */

/** The content column. weddings/page.tsx uses max-w-5xl px-6 py-8; wide tables get 6xl. */
export function column(inner, { max = 1024 } = {}) {
  return `<div style="max-width:${max}px;margin:0 auto;padding:32px 24px;">${inner}</div>`
}

export function pageHead(title, { sub = null, right = '', eyebrow = null } = {}) {
  return `<header style="display:flex;align-items:flex-end;justify-content:space-between;gap:24px;">
    <div style="min-width:0;">
      ${eyebrow ? `<p class="eyebrow" style="margin:0 0 4px;">${eyebrow}</p>` : ''}
      <h1 style="margin:0;font-size:24px;line-height:1.25;font-weight:600;letter-spacing:-0.02em;">${title}</h1>
      ${sub ? `<p style="margin:6px 0 0;font-size:14px;color:var(--muted-foreground);">${sub}</p>` : ''}
    </div>
    <div style="display:flex;align-items:center;gap:8px;flex:0 0 auto;">${right}</div>
  </header>`
}

export function card(inner, { pad = 0 } = {}) {
  return `<div style="background:var(--card);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;${pad ? `padding:${pad}px;` : ''}">${inner}</div>`
}

/** A segmented filter control at var(--control-h). */
export function segmented(options, activeIndex = 0) {
  return `<div style="display:inline-flex;border:1px solid var(--border);border-radius:var(--radius);background:var(--card);padding:2px;gap:2px;">
    ${options.map((o, i) => `<span style="display:inline-flex;align-items:center;height:30px;padding:0 10px;border-radius:6px;font-size:13px;${i === activeIndex ? 'background:var(--muted);color:var(--foreground);font-weight:500;' : 'color:var(--muted-foreground);'}">${o}</span>`).join('')}
  </div>`
}

export function page({ title = 'Guestnote', body, w = 1440, h = 900, css = '' }) {
  // lang="nl" and a real <title>: every board is Dutch prose, and an untitled
  // document with no language is what a screen reader has to guess its way through.
  return `<!doctype html>
<html lang="nl">
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap">
  <style>${TOKENS}${BASE}${css}</style>
</helmet>
<div style="width:${w}px;min-height:${h}px;background:var(--background);display:flex;">
${body}
</div>
</x-dc>
</body>
</html>
`
}

/** Full dashboard frame: sidebar + scrolling content column. */
export function shell(sidebarOpts, content, { w = 1440, h = 900, max = 1024, title = 'Guestnote', css = '' } = {}) {
  return page({
    title,
    w,
    h,
    css,
    body: `${sidebar(sidebarOpts)}<main style="flex:1 1 auto;min-width:0;">${column(content, { max })}</main>`,
  })
}
