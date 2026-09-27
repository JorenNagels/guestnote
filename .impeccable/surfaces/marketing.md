---
version: 1
slug: "marketing"
primary_target: "apps/web/src/app/(marketing)/[locale]"
related_targets: ["apps/web/src/components/marketing"]
---

# Marketing: `guestnote.be/{nl,en,fr}`

> **Revised 2026-09-27 (same day): "don't read as AI-made."** The user asked for the copy and
> the page to stop reading as generated. Checked against Wikipedia's *Signs of AI writing* and
> the AI-design-slop lists, the first version hit most of them. What changed, and what the rest
> of this brief should be read through:
>
> - **No uppercase mono label above headings** (it was on every section).
> - **No italic accent word in the headline**, and no `<em>` device anywhere.
> - **No dark hero with a glow**: the hero is the page background with a rule under it.
> - **No numbered 01/02/03 steps, no before/after cards, no checkmark lists**: prose instead.
> - **Copy rules:** no "not X, it's Y" contrasts, no em dashes as pivots, no reflexive lists of
>   three, no slogan fragments ending in a full stop. Headings say what the section is about in
>   plain words ("Wat het kost", not "Eén studio, één prijs."). Concrete detail beats adjectives.
>   Voice is "we", anonymous, per the user.
>
> Kept: Fraunces for headings, the self-drawing mark, the mini-UIs and their motion.
>
> **Then, same day: more colour and illustration** (the user, pointing at introw.io; also read
> HoneyBook, Tally and the 2026 "warm B2B" counter-trend of Notion and PostHog). Every product
> preview stands on a tinted **stage** (`.mk-stage`, teal / gold / sage, two neighbouring steps
> of one token ramp), the hero is a small **collage** (Today plus an overlapping budget card),
> the "why" section is a gold band, and a small **line illustration set** in the mark's own
> stroke style -- sprig, rings, envelope (`components/marketing/illustrations.tsx`) --
> replaces stock art. Rejected: purple or blue glows, 3D shapes, character illustrations.

Design brief for spec 0006. Concept locked 2026-09-27: **The editorial shell around the working
tool.** The page talks like a well-set magazine. The product inside it looks exactly like the
product.

## 1. Job and audience

**Mode: Persuade, then hand off.** The visitor decides whether to spend ten minutes trying the
product. They leave through one door: "Start free" goes to `app.guestnote.be/signup`.

| | |
|---|---|
| Primary | 🎩 an independent Belgian wedding planner, 1–3 people, currently on Excel + WhatsApp |
| Also | 🏛 a venue coordinator doing the same job |
| Not served | couples and guests (their surfaces are the wedding site and the couple portal, which come later) |

The scene is **the desk, in the evening, comparing tools**. Laptop first, phone second (a link
shared in a planner WhatsApp group opens on a phone). Nothing is urgent. The page earns the
trial by being specific: it shows the actual screens, it names the price, and it doesn't
oversell.

## 2. Tone

Warm and exact. Belgian understatement, no exclamation marks, no "revolutionise". The
competitor is a spreadsheet, and the copy says so plainly. NL is written first; EN and FR are
translations of meaning, not word for word.

## 3. The two layers

**Editorial (the shell).** A display serif for headlines only: **Fraunces**, variable, with its
soft optical size and a real italic, self-hosted through `next/font` (no request to Google from
the browser). The coming-soon page used the system serif; Fraunces is its intentional successor
and carries the same italic-emphasis device (`<em>` in a headline is set in teal italic). The
body stays on `--font-sans`. The ramp: display `clamp(2.4rem, 6vw, 4.25rem)` / 1.02 / −0.025em,
h2 `clamp(1.75rem, 3.6vw, 2.6rem)`, lede `1.125rem` / 1.55, and body 1rem. The measure caps at
62ch.

**Product (the showcase).** Mini-UIs recreate real screens from `@guestnote/ui` primitives on
the dashboard tokens, at the dashboard's own sizes, inside a quiet window frame (1px border,
`--radius-xl`, a soft long shadow, and three muted dots). Never zoomed-up type, never fake
glass. If a mini-UI and the app disagree, the app is right and the mini-UI changes.

## 4. Colour

- **Hero ground:** the coming-soon deep teal `#06211F` → `#0A312E`, cream `#ECFAF9` headline, and
  body `#B9E6E1`. It is the only dark band and ties the brand to what was live before. Contrast
  is cream on `#06211F` at 15.75:1 and body at 12.42:1 (13.15 and 10.37 on `#0A312E`, the
  gradient's lighter end), computed 2026-09-27.
- **Everything else:** the light dashboard tokens (`--background`, `--card`, `--primary`
  teal-800, and `--accent` gold-100 for highlight chips). Marketing never sets `.dark`.
- **Logo colours** `#94CFC9`/`#D6B776` appear in the mark, and on the dark hero ground only
  as the headline `<em>` and the eyebrow -- the coming-soon page's own usage, and the one place
  their 1.8:1 on white does not apply (on `#06211F` they measure well above 4.5:1). Never text
  on light.

## 5. Motion

- **The logo check draws itself** once on load (stroke-dashoffset, as coming-soon did).
- **Mini-UIs act once when scrolled into view:** a task ticks off, a run-sheet row slides in, a
  budget line lands and the total counts on. The timing is 600–900ms, ease-out, and staggered
  by 120ms. Nothing loops and nothing autoplays off-screen.
- **`prefers-reduced-motion: reduce`:** every animated element renders its final frame. No
  motion is needed to understand anything.
- JS is only the in-view trigger. Without JS, the final frame shows.

## 6. Layout

Header: the wordmark on the left. Nav (Features · Pricing · About), the language switcher,
Log in, and a solid **Start free** on the right. Under 720px, the nav moves into a disclosure
(`<details>`, no JS). Sections alternate text/mini-UI left and right on desktop and stack on a
phone. The content width is 1120px with a 24px gutter (16px under 400px). Footer: three
columns (Product, Legal, Contact), then the imprint line.

## 7. Accessibility

WCAG 2.1 AA: visible focus rings (`--ring`), one `h1` per page, and landmarks (`header`,
`nav`, `main`, `footer`). Mini-UIs are `aria-hidden` illustrations with a text description
beside them, because a screen reader should not tab through a fake checklist.
