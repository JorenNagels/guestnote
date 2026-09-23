## Using @guestnote/ui

No provider or wrapper is required — none of these 6 components read from React
context. Just import and render; the token layer ships in `styles.css` and applies
globally once loaded.

### The styling idiom

Components are styled with Tailwind v4 utility classes bound to CSS custom properties
from the token layer (`tokens/`, `styles.css`) — never inline styles, never a CSS-in-JS
prop. Two vocabularies appear:

- **Direct semantic tokens** — `bg-background`, `text-foreground`, `bg-card`,
  `border-border`, `bg-muted` / `text-muted-foreground`, `bg-destructive` /
  `text-destructive-foreground`, `bg-accent` / `text-accent-foreground`. These map
  1:1 to `--background`, `--foreground`, etc. Use Tailwind's own utility form
  (`bg-primary`, not `bg-[var(--primary)]`) for anything not already covered below.
- **The `--gn-*` override seam** — a handful of interactive surface roles are read
  through an *optional* override with a fallback to the base token, e.g.
  `bg-[var(--gn-action,var(--primary))]`, `text-[color:var(--gn-fg,var(--foreground))]`.
  The seam names in use: `--gn-action`, `--gn-action-fg`, `--gn-error`, `--gn-fg`,
  `--gn-input`, `--gn-muted`. None of these are set today (tenant theming is parked),
  so they currently always resolve to their fallback — but a component built on top of
  these primitives should follow the same pattern for the same roles rather than
  bypassing it with a direct token reference, since a future per-venue theme will set
  the `--gn-*` variables and expects every consumer to be listening on them.
- **Radius**: `rounded-[var(--radius)]` for controls, `rounded-[calc(var(--radius)-2px)]`
  for nested/smaller elements (e.g. a switcher's active pill inside a control that's
  already rounded).
- **Fonts**: `font-sans` (Inter Variable) is the default body font; `font-mono` is
  reserved for tabular/code-like content (see `Field`'s `numeric` prop, which switches
  to `font-mono tabular-nums` for a six-digit code).
- **Dark mode**: token values flip via a `.dark` class on an ancestor, not
  `prefers-color-scheme` — wrap a dark preview in a `.dark` container class, don't rely
  on OS theme.

### Where the truth lives

Read `styles.css` (and its `@import` closure, including `_ds_bundle.css`) before
styling anything new — it's the complete, real compiled stylesheet. Each component's
`.d.ts` is its exact prop contract; each `.prompt.md` shows real composed usage.

### A composed example

```tsx
import { Field } from '@guestnote/ui/field'
import { InlineError } from '@guestnote/ui/inline-error'
import { useId } from 'react'

function EmailField() {
  const errorId = useId()
  return (
    <div>
      <Field label="Email address" invalid errorId={errorId} />
      <InlineError id={errorId}>Enter a valid email address.</InlineError>
    </div>
  )
}
```

`InlineError` is always composed next to the `Field` (or other control) it describes,
wired by a shared `id`/`errorId` pair — it is never rendered standalone in a real
screen.
