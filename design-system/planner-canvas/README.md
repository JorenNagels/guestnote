# The planner-app design canvas

Sixteen artboards for `app.guestnote.be`: the shell as it is built today, and every
PH1&ndash;PH3 screen that is not. Published as a Claude Design canvas &mdash;

**<https://claude.ai/code/artifact/b7717fe5-ad9a-48f6-be04-551a63761161>**

These are **mockups, not a spec**. `CLAUDE.md`'s rule stands: no feature gets planned
before it gets specified, so anything here that turns into work goes through `/feature`
first. What the canvas is for is the question a spec cannot answer on its own &mdash;
whether the shell that `docs/specs/0001` settled still holds once eight sections hang
off it instead of one.

## What is in it

| Page | Artboards |
|---|---|
| Layout | the sidebar in four states + the primitive sheet · **Vandaag** (P16) · the wedding overview |
| PH1 | checklist (P6, P8) · task and comments (P4) · templates (P9, P17) · couple portal (P7) |
| PH2 | budget (P11) · payments (P12) · vendors (P13) · run sheet (P14), desktop and phone · files (P15) |
| PH3 | moodboard (P21) · the vendor's signed-link slice (P18) · team seats (P20) |

Three things on it are **proposals, not current behaviour**, and the canvas says so in
its own sticky notes:

1. **`Vandaag` is in the nav and `/` no longer redirects to `/weddings`.** Spec 0001
   withheld that item deliberately &mdash; "a nav item that highlights the wrong thing"
   &mdash; until P16 exists. This is what the reversal looks like.
2. **A count badge on `Taken`.** Spec 0001 kept a badge off `Bruiloften` because for an
   org `member` it costs one transaction per assigned wedding on every page render.
   Inside one wedding it is one aggregate, which is reasoning and not a measurement.
3. **The couple portal is the same UI scoped down.** `PRODUCT.md` lists "same UI scoped
   down vs a separate surface" as undecided; this is the cheap side, drawn so the choice
   can be judged rather than argued.

No new tokens. The sidebar is still `--card` / `--muted` / `--border` / `--foreground`,
because the `--sidebar-*` group ADR 0003 anticipates needs a contrast pass this work does
not do.

All names, weddings and amounts are sample data. The moodboard tiles are placeholders:
there is no imagery in this repo, and a stock photo would assert a visual direction
nobody has chosen.

## Regenerating it

`lib.mjs` holds the shared chrome &mdash; tokens resolved to their light-mode primitives,
the icon set, the sidebar. Values are **lifted from the components that ship them**
(`components/nav/{shell,nav-item,org-head,monogram}.tsx`, `packages/ui/src/button.tsx`),
never rounded to a grid. The `boards-*.mjs` files each emit their artboards; `build.mjs`
writes the `.dc.html` files and `canvas.json`.

```bash
node build.mjs              # rewrite the artboards and canvas.json
node build.mjs --measure    # ...and re-measure every artboard in headless Chromium
```

`--measure` exists because a canvas frame **clips rather than scales**: an artboard one
row taller than its frame loses the row with no error anywhere. The heights in
`canvas.json` are read off a real layout and cached in `heights.json`; run it after any
change that adds rows. It needs the Chromium at the path named in `build.mjs` (the
Playwright browser that ships in the agent container) &mdash; on a laptop, point `CHROME`
at any Chrome build.

To update the published canvas, re-seed and republish to the **same URL** &mdash; a new
path claims a new artifact and abandons the link above:

```bash
B=<the design skill's base directory>
node "$B/seed-canvas.mjs" --template "$B/payload.template.html" \
  --out guestnote-planner-app.html --title "Guestnote Planner-app" \
  --canvas canvas.json $(for f in *.dc.html; do printf -- "--artboard %s " "$f"; done)
node "$B/seed-canvas.mjs" --check guestnote-planner-app.html
```

The seeded `.html` is gitignored; see the note in `.gitignore` for why.

**If someone has edited the canvas in the browser, the artifact is ahead of these files.**
Read it back with the seed helper's `--extract` into an empty directory before touching
anything here, or their work is discarded on the next republish.
