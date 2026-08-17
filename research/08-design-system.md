# Design system — the planner platform

> ## ✅ DECIDED (2026-08-13)
>
> Scope: **`pro.guestnote.be` only.** Tailwind v4 + shadcn/ui token names, so the
> seed app's components port without renaming. Three token layers.
>
> **Tenant wedding-site theming is parked**, along with the palettes from the two
> existing weddings. `design-system/theme-contract.ts` stays on disk and stays
> correct — pick it back up at **F4** (content blocks) / **V7** (templates).
>
> Files: `design-system/tokens.css` (generated) · `tokens-reference.html` (visual).

The thing being designed is **V4 — the planner multi-wedding dashboard**, which
`04-speclist.md` calls "the B2B product. Nobody in the Benelux has one." So the
hard part is not the brand palette. It is **status at a glance** across hundreds
of guests and a dozen weddings.

## The one rule that carries over

**The logo colours are not UI colours.** `#94CFC9` and `#D6B776` both sit at
**OKLCH L≈0.80** — different hues, identical lightness, **1.10:1** against each
other and ~1.8:1 on white. Fine for the mark, which is exempt from WCAG 1.4.3 and
1.4.11. Unusable for text, borders, icons, state or chart series.

So they stay frozen as `--logo-teal` / `--logo-gold`, and the UI draws from ramps
on the *same two hues* (teal 188.1°, gold 84.9°). Brand reads identically; the
interface is legible. The trap: **`teal-500` is 2.56:1 on white** — the step that
looks most like the logo is the one that fails.

## What changed now that this is a data tool

| | was | now | why |
|---|---|---|---|
| `--radius` | `0.9rem` | **`0.5rem`** | 0.9rem came from `se-parti-rsvp`, an editorial wedding site. A dense table grid needs a crisper corner; soft radii on a 32px row read as bubbly |
| dark ground | `neutral-950` | **`neutral-1000`** (new step, `#181715`) | cards move to `950`, which gives charts a genuinely dark surface to hit 3:1 against. At the old values the card was too light to be a chart ground |
| density | — | **`--row-h` 44px / 32px** | a 300-guest list is unusable at comfortable spacing. `[data-density="compact"]` switches row height, cell padding and control height together |
| status | generic success/warning/danger | **six RSVP states** | see below — this is the actual domain |

## RSVP status: six states, not three

`04-speclist.md` forces this. **G4** makes RSVP per-event (ceremony / dinner /
party), so "attending" is not binary — a guest can be coming to the dinner and
not the ceremony. **G9** adds plus-ones, so a guest can have replied while their
`+1` is still unnamed. Both are states a planner has to act on.

| state | ramp | why that colour |
|---|---|---|
| Attending | success | the happy path |
| **Declined** | **neutral** | **deliberately not red.** A polite no is not an error. Painting declines red makes a healthy guest list look like a fire and trains the planner to ignore red |
| Awaiting reply | warning | the planner's actual work queue — **V1** reminder emails target exactly this set |
| Partial (some events) | info | needs a look, not a chase |
| Plus-one unnamed | gold | an action item, and the brand accent earns its keep here |
| Bounced / over capacity | **danger** | red is reserved for things that are genuinely broken — a dead email address, a **D4** shuttle past capacity, a **D5** room block oversold |

All six chips verified in both modes: **light 5.83–6.15:1, dark 6.92–7.09:1.**

Each chip ships as **dot + label**, never colour alone. Two reasons beyond WCAG
1.4.1: the planner-facing exports (**D2** place cards, **D3** caterer list) get
printed in mono, and a status column that only means something in colour is
useless on a venue's black-and-white printout.

## Chart palette — validated, with honest caps

Run through the CVD validator rather than eyeballed. Status hues (150 / 58 / 25)
are **reserved and never reused as a series**, so the categorical set avoids them.

| slot | hue | light | dark |
|---|---|---|---|
| 1 | teal 188° | `#00968C` | `#00A398` |
| 2 | gold 85° | `#A37000` | `#B88100` |
| 3 | blue 248° | `#005FB7` | `#007ED3` |
| 4 | lime 110° | `#8D8D00` | `#939300` |
| 5 | magenta 330° | `#A64BA0` | `#B357AD` |

Assign in **fixed order, never cycled**. A 6th series folds into "Other" or
becomes small multiples.

**The caps, because they're real:**

- **Stacked bars, grouped bars, lines** (adjacent pairs only): all 5 slots pass
  both modes. Worst adjacent CVD ΔE 14.5 light / 14.5 dark against a ≥8 target.
- **Scatter, bubble, small multiples** (every pair on screen at once): **3 slots.**
  Slots 2 and 4 are both yellow-family and collide at ΔE 3.7 deutan / 8.4
  normal-vision. Past three, facet instead.

Two orderings were rejected on measurement, not taste: violet 295° next to blue
248° failed at ΔE 1.6 deutan, and magenta adjacent to blue failed at ΔE 3.3
protan. Magenta is now slot 5 so it never sits beside blue.

Dark is **re-stepped, not flipped** — its own lightness band (OKLCH 0.48–0.67)
against the `neutral-950` card.

Sequential (magnitude, e.g. response rate by wedding): **teal ramp, one hue,
light→dark.** Diverging: only if there's a real zero point; nothing in the spec
needs one yet.

## Charts the dashboard actually needs

Derived from the spec, so the palette isn't decorative:

| view | form | encoding |
|---|---|---|
| Guest list (**C1**) | table | status chip per row, tabular-nums counts, sticky header |
| Multi-wedding overview (**V4**) | row per wedding + hero number | response rate as a bar, days-to-date as urgency |
| RSVP breakdown | stacked bar, **status colours** | not the categorical set |
| Per-event attendance (**G4**) | 3-slot categorical | ceremony / dinner / party |
| Dietary aggregation (**D3**) | horizontal bar, sorted | one series; the count is the point |
| Language split (**V3**) | 3-slot categorical | NL / FR / EN |

Note the split: **RSVP breakdown uses status colours, not series colours.** Same
chart form, different job — the segments are states, not identities.

## Every pair verified, not asserted

Both modes machine-checked, **0 failures**. Tightest margins:

| pair | light | dark | needs |
|---|---|---|---|
| `ring` on `card` | 3.48:1 | 7.24:1 | 3.0 |
| `input` on `card` | 3.65:1 | 5.34:1 | 3.0 |
| `muted-foreground` on `muted` | 5.98:1 | 4.76:1 | 4.5 |

Two deliberate calls, unchanged:

- **`--border` has no minimum.** WCAG 1.4.11 covers UI component boundaries, not
  decorative dividers. Light mode is 1.28:1, intentional — a table with 3:1
  gridlines is a spreadsheet from 1997.
- **`--input` does** need 3:1. A field's edge is what tells you the control is
  there. This forces a darker border than is fashionable. Keep it.

## Table patterns, since this is mostly tables

- Numeric columns right-aligned with `tabular-nums` — wired into `@layer base`,
  so headcounts and money line up without per-table work.
- Row separation by **hairline, not zebra.** Zebra fights the status chips and
  breaks when rows are filtered.
- Sticky header; sticky first column (guest name) at narrow widths.
- Bulk selection is a planner necessity — **C2** CSV import and **C3** link
  generation are both bulk operations.
- Empty, loading and filtered-to-zero are three different states with three
  different messages. "No guests yet" and "No guests match these filters" are
  not the same problem for the user.

## Deliberately not decided

- **Dashboard typeface.** Inter is in the tokens as a safe default. It is also
  the single most generic choice available. Worth revisiting — but with the
  template designer at **V7**, not in isolation.
- **Does the dashboard get white-labelled?** **V5** scopes white-label to "client
  sites and emails," so no. But the planner's own logo needs a home in the org
  switcher, and it arrives as a user-uploaded file of unknown colour and aspect —
  it needs a neutral, bounded slot, not a bare `<img>`.
- **Couple-facing views.** `07-auth-and-tenancy.md` has couples on
  `wedding_members` rather than as org members, so they get *some* dashboard.
  Whether that is the same UI scoped down or a separate surface is unresolved,
  and it changes how much of this system has to work at two levels of privilege.

## Parked, not discarded

`design-system/theme-contract.ts` — tenant theme type, `validateTheme()`,
`toCssVars()`. Still correct, still needed at **F4/V7**. The finding that
justified it also stands: both live weddings ship failing contrast
(`paulien-sander` body text at **1.74:1**), which is what happens without a
publish gate. Left in place so it isn't rediscovered later.
