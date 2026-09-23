# @guestnote/ui

Presentational primitives for the planner platform. One file per component, one entry per
file in `package.json` `exports`. Colours and sizes come from `design-system/tokens.css`
(via Tailwind and the `--gn-*` seam in `src/slots.ts`); `apps/web/src/app/globals.css`
already scans `src/**/*.tsx`, so a new file needs no `@source` line. The package holds no
copy: every accessible name (`label`, `closeLabel`, `caption`) is a required prop.

The primitives below are the planner-app kit (spec 0003, slice F2). The older ones
(`button`, `field`, `inline-error`, `live-region`, `locale-switcher`, `arrival-badge`,
`step-indicator`) are described in their own files.

## Table

`Table`, `TableHead`, `TableBody`, `TableFoot`, `TableHeaderCell`, `TableCell` around a real `<table>`; `caption` is required and screen-reader-only. Rows are plain `<tr>`; `numeric` on a cell right-aligns it in mono, and row height follows `[data-density]`.

## Pill

A state in words with a status dot: `tone` is `success | neutral | warning | info | accent | danger`, mapped onto the `--st-*` token pairs. There is no icon-only form, so the state never rests on colour alone.

## Tabs

In-page ARIA tabs (`role="tab"`), controlled with `value` and `onValueChange` or uncontrolled with `defaultValue`. One tab stop, arrows wrap, Home and End jump. It is not the wedding's route strip; links to other pages want `<a aria-current>`.

## Badge

A count or short code in a mono chip (`neutral | accent | primary`), for the "12" on a tab or the "T-42" in the sidebar. It carries no status meaning; use `Pill` for that.

## Card

The bordered `--card` box the screens sit in. `as` picks the element (`div | section | article | aside`); `padding="none"` is for content that runs to the edge, such as a list of rows.

## Sheet

A modal side panel: `open`, `onClose`, `title`, `closeLabel`, optional `footer`. Focus goes in on open and back on close, Tab wraps, Escape and the scrim close it. Unmounted when closed, so a draft does not survive. Not portalled; do not render it inside a transformed ancestor.

## ColorPicker

Six preset swatches (real radios) plus a native colour input. `onChange` always receives `#RRGGBB` uppercase; `COLOR_PRESETS` and `normalizeHex` are exported. Colour is a dot or a stripe, never text or a ground behind text.
